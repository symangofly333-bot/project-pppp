"use strict";
// 분류 → 생성 → 검증 → (실패 시) 1회 재생성 파이프라인.
//
// 왜 이 구조인가 (전부 라이브 실측 결과다. PROJECT.md 7절 참고):
//  - 통짜 schema.v1.json(8종 전부)은 Claude 구조화 출력이 거부한다. 그래서 먼저 타입을
//    정하고, 그 타입 하나로 좁힌 스키마로 답을 만든다.
//  - 좁혀도 큰 4종(6,134자 이상)은 여전히 거부된다. 작은 4종(4,492자 이하)만 통과한다.
//    한계선을 코드에 숫자로 박으면 모델이 바뀔 때 틀리므로, 일단 강제 출력을 시도해보고
//    거부당하면 프롬프트 방식으로 내려간다. 거부는 생성 전에 나므로 토큰 비용이 없다.
//  - 판정은 어느 방식이든 항상 원본 schema.v1.json으로 한다.

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const { generate, ClaudeAdapterError } = require("./claude-adapter");
const { buildTypeSchema, buildClassifierSchema } = require("../chatbot/schema-split");
const semanticValidator = require("../chatbot/semantic_validator");

const schemaPath = path.join(__dirname, "..", "chatbot", "schema.v1.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

// 판정용. 원본 스키마 하나만 쓰므로 한 번만 컴파일한다.
const validateOriginal = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

// 타입별로 강제 출력이 되는지 한 번 알아내면 그 뒤로는 재사용한다.
// (24회 실행에서 같은 타입에 대해 거부 요청을 반복하지 않기 위함)
const strictSupport = new Map();

function describeAjvErrors(errors) {
  return (errors || []).map((e) => `${e.instancePath || "(최상위)"}: ${e.message}`);
}

function isSchemaRejection(error) {
  return error instanceof ClaudeAdapterError &&
    (error.category === "schema_request_error" || error.category === "schema_compilation_error");
}

/** 1단계: 어떤 body.type으로 답할지만 정한다. 스키마가 작아 강제 출력이 항상 통과한다. */
async function classify(prompt) {
  const result = await generate(prompt, buildClassifierSchema(schema));
  return { bodyType: result.json?.body_type, meta: result.meta };
}

/** 2단계: 해당 타입으로 답을 만든다. 강제 출력이 거부되면 프롬프트 방식으로 내려간다. */
async function generateForType(prompt, bodyType, priorAttempt) {
  const typeSchema = buildTypeSchema(schema, bodyType);

  // 재생성은 직전 응답을 대화에 넣어야 하므로 프롬프트 방식으로만 가능하다.
  if (!priorAttempt && strictSupport.get(bodyType) !== false) {
    try {
      const result = await generate(prompt, typeSchema);
      strictSupport.set(bodyType, true);
      return result;
    } catch (error) {
      if (!isSchemaRejection(error)) throw error;
      strictSupport.set(bodyType, false);
    }
  }

  return generate(prompt, typeSchema, { mode: "prompt", priorAttempt });
}

/**
 * 한 질문에 대해 검증까지 통과한 응답을 만든다.
 *
 * @param {string} prompt
 * @param {object} [context] semantic_validator에 넘길 문맥 (예: {userSuppliedCode: true})
 * @returns {Promise<{json, meta, attempts, violations}>}
 *   violations는 block이 없는 상태로만 반환된다. 끝내 실패하면 예외를 던진다.
 */
async function generateValidated(prompt, context = {}) {
  const classification = await classify(prompt);
  const bodyType = classification.bodyType;
  if (!bodyType) {
    throw new ClaudeAdapterError("분류 단계가 body_type을 반환하지 않았다.", {
      category: "classification_error",
    });
  }

  const attempts = [];
  let priorAttempt;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await generateForType(prompt, bodyType, priorAttempt);

    const schemaOk = validateOriginal(result.json);
    const violations = [
      ...describeAjvErrors(schemaOk ? [] : validateOriginal.errors),
      ...semanticValidator.check(result.json, context)
        .filter((v) => v.severity === "block")
        .map((v) => `${v.rule}: ${v.message}`),
    ];

    attempts.push({
      attempt,
      mode: result.meta.mode,
      latencyMs: result.meta.latencyMs,
      violations,
    });

    if (violations.length === 0) {
      // 분류 1회 + 생성 시도들. 타입별로 최초 1회만 발생하는 강제 출력 거부 요청은
      // 답을 만들기 전에 끝나므로 여기에 포함하지 않는다.
      const totalLatencyMs = classification.meta.latencyMs +
        attempts.reduce((sum, a) => sum + a.latencyMs, 0);

      return {
        json: result.json,
        meta: { ...result.meta, bodyType, totalLatencyMs, classifierMeta: classification.meta },
        attempts,
        // 통과했어도 warn은 남겨 보고서에서 셀 수 있게 한다.
        violations: semanticValidator.check(result.json, context),
      };
    }

    priorAttempt = { text: result.rawText, violations };
  }

  throw new ClaudeAdapterError(
    `재생성 후에도 검증에 실패했다: ${attempts[attempts.length - 1].violations.join(" / ")}`,
    { category: "validation_failed", rawError: { bodyType, attempts } }
  );
}

module.exports = { generateValidated, classify, generateForType };
