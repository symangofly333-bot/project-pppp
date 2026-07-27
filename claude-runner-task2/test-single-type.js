"use strict";
// 진단용 1회 호출 스크립트.
//
// 통짜 schema.v1.json(8종 전부, 14,291자)은 Claude가 거부한다:
//   "The compiled grammar is too large, which would cause performance issues."
// 타입 1종만 남기고 안 쓰는 $defs까지 잘라낸 축소본은 통과한다(concept_explanation, 4,493자 확인됨).
//
// 축소본도 타입마다 크기가 다르므로(4,273~7,199자), 24회를 다 돌리기 전에
// "가장 큰 축소본"이 통과하는지부터 1회로 확인한다.
//
// 실행:
//   node test-single-type.js                      기본: 가장 큰 축소본(code_generation)
//   node test-single-type.js concept_explanation  특정 타입 지정

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const { generate } = require("./claude-adapter");
const { listBodyTypes, buildTypeSchema } = require("../chatbot/schema-split");
const { flattenUnions } = require("../chatbot/flatten-unions");
const testCases = require("./test-cases");

const schemaPath = path.join(__dirname, "..", "chatbot", "schema.v1.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

// 인자로 타입을 받고, 없으면 축소본이 가장 큰 타입을 고른다(최악의 경우부터 확인).
const requested = process.argv[2];
const allTypes = listBodyTypes(schema).map((item) => item.type);
let targetType = requested;
if (!targetType) {
  targetType = allTypes
    .map((type) => ({ type, size: JSON.stringify(buildTypeSchema(schema, type)).length }))
    .sort((a, b) => b.size - a.size)[0].type;
} else if (!allTypes.includes(targetType)) {
  console.error(`알 수 없는 타입: ${targetType}\n사용 가능: ${allTypes.join(", ")}`);
  process.exit(1);
}

// 축소(타입 1종만)만 기본으로 적용한다.
// 평탄화(선택지 합치기)는 모양 가짓수를 1로 낮추지만, 라이브 테스트에서 거부를 못 막는 것이
// 확인됐다(code_generation 5,738자/모양 1 -> 여전히 거부). 오히려 속성 수를 늘려 측정을
// 왜곡하므로 기본은 끄고, 재확인이 필요할 때만 CLAUDE_FLATTEN=1 로 켠다.
const useFlatten = process.env.CLAUDE_FLATTEN === "1";
const reducedSchema = buildTypeSchema(schema, targetType);
const typeSchema = useFlatten ? flattenUnions(reducedSchema) : reducedSchema;
const testCase = testCases.find((item) => item.expectedType === targetType);
if (!testCase) {
  console.error(`${targetType} 에 해당하는 테스트 케이스가 test-cases.js에 없다.`);
  process.exit(1);
}

const stripForApi = process.env.CLAUDE_STRIP_UNSUPPORTED !== "0";
const { analyze } = require("../chatbot/analyze-grammar");
console.log(`대상 타입: ${targetType}${requested ? "" : " (축소본 중 가장 큼 = 최악의 경우)"}`);
console.log(
  `스키마: ${JSON.stringify(typeSchema).length.toLocaleString()}자, ` +
  `모양 가짓수 ${analyze(typeSchema, typeSchema).product.toExponential(1)} ` +
  `(원본 ${JSON.stringify(schema).length.toLocaleString()}자, 축소만 했을 때 모양 ${analyze(reducedSchema, reducedSchema).product.toExponential(1)})`
);
console.log(`평탄화(선택지 합치기): ${useFlatten ? "적용(CLAUDE_FLATTEN=1)" : "미적용 — 효과 없음이 확인된 방법"}`);
console.log(`미지원 키워드 제거: ${stripForApi ? "적용" : "미적용(CLAUDE_STRIP_UNSUPPORTED=0)"}`);
console.log("\n호출 1회 시도 중...\n");

async function main() {
  try {
    const response = await generate(testCase.prompt, typeSchema);
    console.log("=== 성공 ===");
    console.log("model:", response.meta.model);
    console.log("stop_reason:", response.meta.stopReason);
    console.log("응답 body.type:", response.json?.body?.type, response.json?.body?.type === targetType ? "(일치)" : "(불일치!)");
    console.log("응답 크기:", JSON.stringify(response.json).length.toLocaleString(), "자");

    // 판정은 언제나 원본 스키마로 한다.
    const valid = new Ajv2020({ allErrors: true, strict: true }).compile(schema)(response.json);
    console.log("\n원본 schema.v1.json 기준 AJV 판정:", valid ? "통과" : "실패");

    if (!valid) {
      // 원본은 body가 8종 anyOf라, 실패하면 8개 후보 전부의 오류가 쏟아져 원인이 안 보인다.
      // 해당 타입 하나로 좁힌(단, 미지원 키워드는 제거하지 않은) 스키마로 다시 대조해
      // 진짜 어긋난 곳만 뽑는다. reducedSchema는 maxLength/minItems를 그대로 갖고 있으므로,
      // 생성용 스키마에서 제거된 제약을 모델이 어겼는지도 여기서 드러난다.
      const diagnose = new Ajv2020({ allErrors: true, strict: true }).compile(reducedSchema);
      diagnose(response.json);
      console.log(`\n${targetType} 후보로만 좁혀서 본 실제 위반:`);
      for (const e of diagnose.errors || []) {
        console.log(`  ${e.instancePath || "(최상위)"}: ${e.message}` +
          (e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : ""));
      }

      // 나중에 눈으로 확인할 수 있게 응답 원문을 남긴다.
      const outPath = path.join(__dirname, "results", `diag-${targetType}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(response.json, null, 2));
      console.log(`\n응답 원문: ${outPath}`);
    }
  } catch (error) {
    console.log("=== 실패 ===");
    console.log("category:", error.category);
    console.log("status:", error.status);
    console.log("message:", error.message);
    if (error.rawError) console.log("원문:", JSON.stringify(error.rawError, null, 2));

    if (error.category === "schema_compilation_error" || error.category === "schema_request_error") {
      console.log("\n결론: 예상대로 거부. 8종 실측 결과 한계선은 4,492자(통과)~6,134자(거부) 사이다.");
      console.log("      작은 4종(safety_notice/concept_explanation/prompt_help/clarification_request)만 통과한다.");
      console.log("      → 큰 4종은 강제 구조화 출력을 포기하고 프롬프트+AJV+재시도로 간다(PROJECT.md 7절).");
    }
  }
}

main();
