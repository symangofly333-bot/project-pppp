// 평탄화 효과 확인 (오프라인, API 호출 없음)
//
// 확인하는 것:
//   1) 평탄화로 "모양 가짓수"가 얼마나 줄어드는가 (grammar 폭발의 직접 지표)
//   2) 평탄화본이 AJV로 컴파일되는가
//   3) 평탄화본이 정답 예시를 여전히 받아들이는가
//      (평탄화는 느슨해지는 방향이므로 통과해야 정상. 실패하면 평탄화가 뭔가 망가뜨린 것)
//   4) 원본 스키마는 그대로다 — 판정 기준은 안 바뀐다는 확인
//
// 실행: node check-flatten.js

"use strict";

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { listBodyTypes, buildTypeSchema } = require("./schema-split");
const { flattenUnions } = require("./flatten-unions");
const { analyze } = require("./analyze-grammar");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "schema.v1.json"), "utf8"));
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, "examples.json"), "utf8"));

// 라이브에서 실제로 확인된 결과
const LIVE = { concept_explanation: "통과", code_generation: "거부" };

console.log("=== 평탄화 전후 비교 ===\n");
console.log(
  "타입".padEnd(23) + "모양(전)".padStart(10) + "모양(후)".padStart(10) +
  "크기(전)".padStart(10) + "크기(후)".padStart(10) + "  컴파일 예시  라이브(전)"
);

let allOk = true;
const results = [];

for (const { type } of listBodyTypes(schema)) {
  const original = buildTypeSchema(schema, type);
  const flat = flattenUnions(original);

  const before = analyze(original, original).product;
  const after = analyze(flat, flat).product;
  const sizeBefore = JSON.stringify(original).length;
  const sizeAfter = JSON.stringify(flat).length;

  let compileOk = false;
  let validate = null;
  try {
    validate = new Ajv2020({ allErrors: true, strict: false }).compile(flat);
    compileOk = true;
  } catch (error) {
    console.log(`  [${type}] 평탄화본 컴파일 실패: ${error.message}`);
  }

  // 평탄화본은 원본보다 느슨하므로 정답 예시를 반드시 받아들여야 한다
  const example = examples.find((item) => item.body?.type === type);
  let exampleOk = null;
  if (example && validate) {
    const candidate = JSON.parse(JSON.stringify(example));
    delete candidate._name;
    exampleOk = validate(candidate);
    if (!exampleOk) {
      console.log(`  [${type}] 예시 거부됨:`, new Ajv2020({ strict: false }).errorsText(validate.errors, { separator: "; " }).slice(0, 300));
    }
  }

  if (!compileOk || exampleOk === false) allOk = false;
  results.push({ type, before, after, sizeBefore, sizeAfter });

  console.log(
    type.padEnd(23) +
      before.toExponential(1).padStart(10) +
      after.toExponential(1).padStart(10) +
      sizeBefore.toLocaleString().padStart(10) +
      sizeAfter.toLocaleString().padStart(10) +
      (compileOk ? "     OK" : "   FAIL") +
      (exampleOk === null ? "  없음" : exampleOk ? "   OK" : " FAIL") +
      "  " + (LIVE[type] || "")
  );
}

// 원본이 훼손되지 않았는지 확인 (판정 기준은 그대로여야 한다)
const reread = JSON.parse(fs.readFileSync(path.join(__dirname, "schema.v1.json"), "utf8"));
const untouched = JSON.stringify(reread) === JSON.stringify(schema);

console.log("\n=== 요약 ===\n");
const worst = results.reduce((a, b) => (b.after > a.after ? b : a));
const passRef = results.find((r) => r.type === "concept_explanation");
console.log(`평탄화 후 가장 무거운 타입: ${worst.type} (모양 ${worst.after.toExponential(1)}, ${worst.sizeAfter.toLocaleString()}자)`);
console.log(`라이브 통과 확인된 기준선  : concept_explanation (평탄화 전 모양 ${passRef.before.toExponential(1)})`);
console.log(`원본 schema.v1.json 무손상 : ${untouched ? "확인" : "훼손됨!"}`);
if (!untouched) allOk = false;

console.log(
  worst.after <= passRef.before
    ? "\n=> 가장 무거운 타입도 이미 통과한 기준선 이하다. 라이브 1회로 검증할 만하다."
    : "\n=> 아직 기준선보다 무겁다. 추가 축소가 필요할 수 있다."
);
console.log(`\n결과: ${allOk ? "전부 통과" : "실패 있음"}`);
process.exit(allOk ? 0 : 1);
