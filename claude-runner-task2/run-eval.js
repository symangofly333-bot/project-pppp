"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const { generate, DEFAULT_MODEL } = require("./claude-adapter");
const testCases = require("./test-cases");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[arg.slice(2)] = next;
        i += 1;
      } else {
        out[arg.slice(2)] = true;
      }
    }
  }
  return out;
}

function resolveRequiredFile(explicitPath, candidates, label) {
  const paths = explicitPath
    ? [path.resolve(explicitPath)]
    : candidates.map((candidate) => path.resolve(candidate));
  const found = paths.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `${label} not found. Pass --${label} PATH. Checked:\n${paths.join("\n")}`
    );
  }
  return found;
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function countSchemaStats(schema) {
  const stats = {
    properties: 0,
    optionalProperties: 0,
    anyOfKeywordCount: 0,
    anyOfAlternativeCount: 0,
    typeArrayCount: 0,
    keywordCounts: {},
    unionLocations: [],
  };
  const watched = [
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "minimum",
    "maximum",
    "uniqueItems",
    "default",
  ];

  function walk(node, currentPath) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, `${currentPath}[${index}]`));
      return;
    }

    if (node.properties) {
      const required = new Set(node.required || []);
      for (const key of Object.keys(node.properties)) {
        stats.properties += 1;
        if (!required.has(key)) stats.optionalProperties += 1;
      }
    }
    if (Array.isArray(node.anyOf)) {
      stats.anyOfKeywordCount += 1;
      stats.anyOfAlternativeCount += node.anyOf.length;
      stats.unionLocations.push({ path: currentPath, kind: "anyOf", variants: node.anyOf.length });
    }
    if (Array.isArray(node.type)) {
      stats.typeArrayCount += 1;
      stats.unionLocations.push({ path: `${currentPath}.type`, kind: "type-array", variants: node.type.length });
    }
    for (const keyword of watched) {
      if (Object.prototype.hasOwnProperty.call(node, keyword)) {
        stats.keywordCounts[keyword] = (stats.keywordCounts[keyword] || 0) + 1;
      }
    }
    for (const [key, value] of Object.entries(node)) {
      walk(value, `${currentPath}.${key}`);
    }
  }

  walk(schema, "$");
  return stats;
}

function schemaRefUnionPlacements(schema, stats) {
  const unionDefs = new Set(
    stats.unionLocations
      .map((item) => item.path.match(/^\$\.\$defs\.([^.]+)$/)?.[1])
      .filter(Boolean)
  );
  const directParameterUnions = stats.unionLocations.filter(
    (item) => !item.path.startsWith("$.$defs.")
  ).length;
  let referencedUnionParameters = 0;

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((value) => walk(value));
      return;
    }
    if (typeof node.$ref === "string") {
      const match = node.$ref.match(/^#\/\$defs\/(.+)$/);
      if (match && unionDefs.has(match[1])) referencedUnionParameters += 1;
    }
    for (const value of Object.values(node)) walk(value);
  }
  walk(schema);
  return {
    directParameterUnions,
    referencedUnionParameters,
    expandedPlacementEstimate: directParameterUnions + referencedUnionParameters,
  };
}

function loadSemanticCheck(semanticPath) {
  delete require.cache[require.resolve(semanticPath)];
  const loaded = require(semanticPath);
  if (!loaded || typeof loaded.check !== "function") {
    throw new Error(`${semanticPath} does not export check(response, context).`);
  }
  return loaded.check;
}

function normalizeViolation(violation) {
  if (typeof violation === "string") {
    const match = violation.match(/^규칙\s*(\d+)/);
    return {
      rule: match ? Number(match[1]) : "unknown",
      severity: "block",
      message: violation,
    };
  }
  return {
    rule: violation?.rule ?? "unknown",
    severity: violation?.severity || "block",
    message: violation?.message || JSON.stringify(violation),
  };
}

function shapeSignature(value) {
  const paths = [];
  function walk(node, currentPath) {
    if (Array.isArray(node)) {
      paths.push(`${currentPath}:array`);
      for (const item of node) walk(item, `${currentPath}[]`);
      return;
    }
    if (node && typeof node === "object") {
      paths.push(`${currentPath}:object`);
      for (const key of Object.keys(node).sort()) walk(node[key], `${currentPath}.${key}`);
      return;
    }
    paths.push(`${currentPath}:${node === null ? "null" : typeof node}`);
  }
  walk(value, "$");
  return [...new Set(paths)].sort().join("|");
}

function arrayCardinalitySignature(value) {
  const entries = [];
  function walk(node, currentPath) {
    if (Array.isArray(node)) {
      entries.push(`${currentPath}=${node.length}`);
      node.forEach((item) => walk(item, `${currentPath}[]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node).sort()) walk(node[key], `${currentPath}.${key}`);
    }
  }
  walk(value, "$");
  return entries.sort().join("|");
}

function groupCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].map(([signature, count]) => ({ signature, count }));
}

function causeForError(category) {
  if (category === "schema_compilation_error" || category === "schema_request_error") {
    return "schema_problem";
  }
  if (
    category === "refusal" ||
    category === "output_truncated" ||
    category === "json_parse_error"
  ) {
    return "prompt_or_model_behavior";
  }
  if (
    category === "configuration_error" ||
    category === "authentication_error" ||
    category === "rate_limit_error" ||
    category === "network_error" ||
    category === "timeout_error" ||
    category === "provider_error"
  ) {
    return "environment_or_provider";
  }
  return "request_or_provider";
}

function summarize(results, plannedCalls, schemaApiCompilation) {
  const completed = results.filter((item) => item.response);
  const ajvPass = completed.filter((item) => item.validation.ajvValid).length;
  const typeCorrect = completed.filter((item) => item.validation.typeMatches).length;
  const semantic = {};

  for (const item of completed) {
    for (const violation of item.validation.semanticViolations) {
      const key = String(violation.rule);
      semantic[key] ||= { block: 0, warn: 0, other: 0, total: 0 };
      semantic[key].total += 1;
      if (violation.severity === "block") semantic[key].block += 1;
      else if (violation.severity === "warn") semantic[key].warn += 1;
      else semantic[key].other += 1;
    }
  }

  const variability = {};
  for (const testCase of testCases) {
    const matching = completed.filter((item) => item.caseId === testCase.id);
    variability[testCase.id] = {
      successfulResponses: matching.length,
      uniqueFieldShapes: groupCounts(matching.map((item) => shapeSignature(item.response.json))),
      uniqueArrayCardinalities: groupCounts(
        matching.map((item) => arrayCardinalitySignature(item.response.json))
      ),
    };
  }

  return {
    plannedCalls,
    attemptedCalls: results.length,
    completedResponses: completed.length,
    failedCalls: results.filter((item) => item.error).length,
    typeClassification: {
      correct: typeCorrect,
      denominatorPlanned: plannedCalls,
      denominatorCompleted: completed.length,
      rateOfPlanned: plannedCalls ? typeCorrect / plannedCalls : 0,
      rateOfCompleted: completed.length ? typeCorrect / completed.length : 0,
    },
    ajv: {
      passed: ajvPass,
      denominatorPlanned: plannedCalls,
      denominatorCompleted: completed.length,
      rateOfPlanned: plannedCalls ? ajvPass / plannedCalls : 0,
      rateOfCompleted: completed.length ? ajvPass / completed.length : 0,
    },
    semanticRuleCounts: semantic,
    schemaApiCompilation,
    variability,
  };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function jsonFence(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function renderReport(run) {
  const s = run.summary;
  const liveBlocked = run.runStatus === "blocked_missing_api_key";
  const lines = [
    "# Claude API 구조화 출력 검증 리포트",
    "",
    `- 실행 상태: **${run.runStatus}**`,
    `- 실행 시각: ${run.startedAt}`,
    `- 모델: \`${run.model}\``,
    `- 계획 호출: ${s.plannedCalls}회`,
    `- 실제 시도: ${s.attemptedCalls}회`,
    `- 정상 JSON 응답: ${s.completedResponses}회`,
    "",
    "## 핵심 결과",
    "",
    liveBlocked
      ? "- 유형 분류 정확도: **미실행**"
      : `- 유형 분류 정확도: ${s.typeClassification.correct}/${s.plannedCalls} (${percent(
          s.typeClassification.rateOfPlanned
        )})`,
    liveBlocked
      ? "- 원본 schema.v1.json AJV 통과율: **미실행**"
      : `- 원본 schema.v1.json AJV 통과율: ${s.ajv.passed}/${s.plannedCalls} (${percent(
          s.ajv.rateOfPlanned
        )})`,
    `- Claude API 원본 스키마 컴파일: **${s.schemaApiCompilation.status}**`,
    "",
  ];

  if (liveBlocked) {
    lines.push(
      "> `ANTHROPIC_API_KEY`가 환경에 없어 라이브 호출은 실행되지 않았다. 모델의 성공률·실패율은 아직 판정할 수 없다.",
      ""
    );
  }

  lines.push(
    "## 원본 스키마 사전 점검",
    "",
    `- 속성 수: ${run.schemaStats.properties}`,
    `- 선택 속성 수: ${run.schemaStats.optionalProperties}`,
    `- 문자 그대로의 \`anyOf\` 키워드: ${run.schemaStats.anyOfKeywordCount}곳`,
    `- \`anyOf\` 대안 분기 합계: ${run.schemaStats.anyOfAlternativeCount}개`,
    `- 재사용 \`$ref\`까지 펼친 union 배치 추정: ${run.schemaStats.unionPlacementEstimate.expandedPlacementEstimate}곳`,
    `- \`minItems\`: ${run.schemaStats.keywordCounts.minItems || 0}곳`,
    `- \`maxItems\`: ${run.schemaStats.keywordCounts.maxItems || 0}곳`,
    `- \`maxLength\`: ${run.schemaStats.keywordCounts.maxLength || 0}곳`,
    "",
    "주의: 전달받은 설명의 “anyOf 9개”와 달리 파일을 직접 세면 literal `anyOf`는 5곳이다. `$ref` 재사용을 실제 매개변수 위치로 펼치면 10곳으로 추정된다. Claude의 16개 제한 적용 방식은 라이브 컴파일 결과를 최종 기준으로 삼는다.",
    "",
    "또한 Anthropic 공식 문서는 `maxLength`를 구조화 출력에서 SDK가 제거하는 미지원 제약의 예로 든다. 이번 러너는 지시대로 제거하지 않고 원본을 그대로 전송하며, 400이 나면 원문을 기록한다.",
    "",
    "## semantic_validator 규칙별 위반",
    "",
    "| 규칙 | block | warn | 합계 |",
    "|---:|---:|---:|---:|"
  );

  for (let rule = 1; rule <= 6; rule += 1) {
    const count = s.semanticRuleCounts[String(rule)] || { block: 0, warn: 0, total: 0 };
    lines.push(`| ${rule} | ${count.block} | ${count.warn} | ${count.total} |`);
  }

  lines.push("", "## 3회 반복 구조 편차", "", "| 유형 | 정상 응답 | 필드 구조 수 | 배열 개수 구조 수 |", "|---|---:|---:|---:|");
  for (const testCase of testCases) {
    const item = s.variability[testCase.id];
    lines.push(
      `| ${testCase.id} | ${item.successfulResponses} | ${item.uniqueFieldShapes.length} | ${item.uniqueArrayCardinalities.length} |`
    );
  }

  const failures = run.results.filter((item) => item.error);
  lines.push("", "## 실패 원인 분리", "");
  if (failures.length === 0) {
    lines.push("기록된 호출 실패 없음.", "");
  } else {
    for (const item of failures) {
      lines.push(
        `### ${item.caseId} / 반복 ${item.repeat}`,
        "",
        `- 분류: \`${item.error.cause}\` → \`${item.error.category}\``,
        `- HTTP: ${item.error.status ?? "없음"}`,
        `- 메시지: ${item.error.message}`,
        "",
        "원문:",
        "",
        jsonFence(item.error.rawError),
        ""
      );
    }
  }

  const ajvFailures = run.results.filter(
    (item) => item.response && !item.validation.ajvValid
  );
  lines.push("## AJV 실패 원문", "");
  if (ajvFailures.length === 0) {
    lines.push("기록된 AJV 실패 없음.", "");
  } else {
    for (const item of ajvFailures) {
      lines.push(
        `### ${item.caseId} / 반복 ${item.repeat}`,
        "",
        jsonFence(item.validation.ajvErrors),
        ""
      );
    }
  }

  lines.push(
    "## 판정 기준",
    "",
    "- 생성 요청과 AJV 판정 모두 원본 `schema.v1.json`을 사용했다.",
    "- `schema.v1.openai-strict.json`은 읽거나 전송하거나 판정에 사용하지 않았다.",
    "- 첫 성공 응답이 오면 원본 스키마가 Claude에서 컴파일된 것으로 기록한다.",
    "- 첫 요청이 `Schema is too complex for compilation` 또는 다른 스키마 400으로 실패하면 나머지 호출을 중단한다.",
    "- refusal·max_tokens·JSON 파싱 실패는 스키마 문제가 아니라 프롬프트/모델 동작으로 분리한다.",
    "",
    "## 공식 문서",
    "",
    "- [Anthropic Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)",
    "- [Anthropic Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)",
    "- [Claude Sonnet 5](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5)",
    ""
  );

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repeats = Number.parseInt(args.repeats || "3", 10);
  if (!Number.isSafeInteger(repeats) || repeats <= 0) {
    throw new Error("--repeats must be a positive integer.");
  }

  const schemaPath = resolveRequiredFile(
    args.schema,
    [
      path.join(process.cwd(), "schema.v1.json"),
      path.join(ROOT, "chatbot", "schema.v1.json"),
      path.join(ROOT, "project_sources", "07-schema.v1.json"),
      path.join(ROOT, "upload", "schema.v1(1).json"),
    ],
    "schema"
  );
  const semanticPath = resolveRequiredFile(
    args.semantic,
    [
      path.join(process.cwd(), "semantic_validator.js"),
      path.join(ROOT, "chatbot", "semantic_validator.js"),
      path.join(ROOT, "upload", "semantic_validator(1).js"),
      path.join(ROOT, "project_sources", "05-semantic_validator.js"),
    ],
    "semantic"
  );
  const outputDir = path.resolve(
    args.out || path.join(__dirname, "results", new Date().toISOString().replace(/[:.]/g, "-"))
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const semanticCheck = loadSemanticCheck(semanticPath);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const schemaStats = countSchemaStats(schema);
  schemaStats.unionPlacementEstimate = schemaRefUnionPlacements(schema, schemaStats);

  const startedAt = new Date().toISOString();
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const plannedCalls = testCases.length * repeats;
  const results = [];
  let runStatus = "completed";
  const schemaApiCompilation = { status: "not_tested", firstSuccessfulCase: null, error: null };

  if (!process.env.ANTHROPIC_API_KEY) {
    runStatus = "blocked_missing_api_key";
  } else {
    let stopForSchema = false;
    for (const testCase of testCases) {
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        if (stopForSchema) break;
        const record = {
          caseId: testCase.id,
          expectedType: testCase.expectedType,
          repeat,
          prompt: testCase.prompt,
          context: testCase.context,
          response: null,
          validation: null,
          error: null,
        };

        try {
          const response = await generate(testCase.prompt, schema);
          if (schemaApiCompilation.status === "not_tested") {
            schemaApiCompilation.status = "passed";
            schemaApiCompilation.firstSuccessfulCase = {
              caseId: testCase.id,
              repeat,
              requestId: response.meta.requestId,
            };
          }

          const ajvValid = validate(response.json);
          const semanticViolations = semanticCheck(response.json, testCase.context).map(
            normalizeViolation
          );
          record.response = response;
          record.validation = {
            ajvValid,
            ajvErrors: ajvValid ? [] : JSON.parse(JSON.stringify(validate.errors || [])),
            actualType: response.json?.body?.type ?? null,
            typeMatches: response.json?.body?.type === testCase.expectedType,
            semanticViolations,
            semanticBlockCount: semanticViolations.filter(
              (item) => item.severity === "block"
            ).length,
            semanticWarnCount: semanticViolations.filter(
              (item) => item.severity === "warn"
            ).length,
          };
        } catch (error) {
          const category = error.category || "runner_error";
          record.error = {
            category,
            cause: causeForError(category),
            status: error.status ?? null,
            code: error.code ?? null,
            requestId: error.requestId ?? null,
            stopReason: error.stopReason ?? null,
            message: error.message,
            rawError: error.rawError ?? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            latencyMs: error.latencyMs ?? null,
          };
          if (
            category === "schema_compilation_error" ||
            category === "schema_request_error"
          ) {
            schemaApiCompilation.status = "failed";
            schemaApiCompilation.error = record.error;
            stopForSchema = true;
            runStatus = "stopped_schema_error";
          } else {
            runStatus = "completed_with_failures";
          }
        }
        results.push(record);
      }
      if (stopForSchema) break;
    }
  }

  const summary = summarize(results, plannedCalls, schemaApiCompilation);
  const run = {
    runnerVersion: "1.0.0",
    startedAt,
    finishedAt: new Date().toISOString(),
    runStatus,
    provider: "anthropic",
    model,
    sourceFiles: {
      schema: { path: schemaPath, sha256: hashFile(schemaPath) },
      semanticValidator: { path: semanticPath, sha256: hashFile(semanticPath) },
    },
    schemaStats,
    summary,
    results,
  };

  const resultsPath = path.join(outputDir, "results.json");
  const reportPath = path.join(outputDir, "report.md");
  fs.writeFileSync(resultsPath, `${JSON.stringify(run, null, 2)}\n`);
  fs.writeFileSync(reportPath, renderReport(run));

  console.log(`Run status: ${runStatus}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Raw results: ${resultsPath}`);

  if (runStatus !== "completed") process.exitCode = 2;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  arrayCardinalitySignature,
  countSchemaStats,
  normalizeViolation,
  shapeSignature,
};
