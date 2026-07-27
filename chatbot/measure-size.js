// 스키마에서 무엇이 크기를 차지하는지 측정 (오프라인, API 호출 없음)
//
// 라이브 실측:
//   4,493자 / 모양 9   -> 통과   (concept_explanation, 축소만)
//   5,738자 / 모양 1   -> 거부   (code_generation, 축소+평탄화)
//   7,199자 / 모양 140 -> 거부   (code_generation, 축소만)
// => 모양 가짓수는 무관해 보이고, 한계선은 4,493~5,738자 사이다.
//
// 그렇다면 줄일 수 있는 건 무엇인가:
//   - description / title  : 사람이 읽는 설명. grammar에 필요한가? (모델 유도에는 도움)
//   - 속성 개수            : 진짜 구조. 줄이면 계약이 바뀐다.
//
// 실행: node measure-size.js

"use strict";

const fs = require("fs");
const path = require("path");
const { listBodyTypes, buildTypeSchema } = require("./schema-split");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "schema.v1.json"), "utf8"));

// description/title 등 사람이 읽는 주석성 필드를 제거
function stripAnnotations(node) {
  if (Array.isArray(node)) return node.map(stripAnnotations);
  if (node && typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "description" || key === "title" || key === "$comment") continue;
      out[key] = stripAnnotations(value);
    }
    return out;
  }
  return node;
}

// 속성 개수 / enum 값 개수 세기
function countStructure(root, node, seen = { props: 0, enums: 0, enumValues: 0, objects: 0, arrays: 0 }, depth = 0) {
  if (!node || typeof node !== "object" || depth > 40) return seen;
  if (Array.isArray(node)) {
    for (const item of node) countStructure(root, item, seen, depth + 1);
    return seen;
  }
  if (node.$ref) {
    const match = String(node.$ref).match(/^#\/\$defs\/(.+)$/);
    const target = match ? root.$defs?.[match[1]] : null;
    if (target) countStructure(root, target, seen, depth + 1);
    return seen;
  }
  if (node.properties) {
    seen.objects += 1;
    seen.props += Object.keys(node.properties).length;
  }
  if (Array.isArray(node.enum)) {
    seen.enums += 1;
    seen.enumValues += node.enum.length;
  }
  if (node.type === "array") seen.arrays += 1;
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") countStructure(root, value, seen, depth + 1);
  }
  return seen;
}

const LIVE = { concept_explanation: "통과(4,493)", code_generation: "거부(7,199/5,738)" };

console.log("=== 타입별: 설명문 제거 시 크기 ===\n");
console.log(
  "타입".padEnd(23) + "원래".padStart(8) + "설명제거".padStart(9) + "절감".padStart(8) +
  "속성".padStart(6) + "펼친속성".padStart(9) + "  라이브"
);

const rows = [];
for (const { type } of listBodyTypes(schema)) {
  const reduced = buildTypeSchema(schema, type);
  const stripped = stripAnnotations(reduced);
  const before = JSON.stringify(reduced).length;
  const after = JSON.stringify(stripped).length;
  const structure = countStructure(reduced, reduced);

  rows.push({ type, before, after, structure });
  console.log(
    type.padEnd(23) +
      before.toLocaleString().padStart(8) +
      after.toLocaleString().padStart(9) +
      `-${Math.round((1 - after / before) * 100)}%`.padStart(8) +
      String(structure.objects).padStart(6) +
      String(structure.props).padStart(9) +
      "  " + (LIVE[type] || "")
  );
}

console.log("\n=== 한계선 분석 ===\n");
const pass = rows.find((r) => r.type === "concept_explanation");
const fail = rows.find((r) => r.type === "code_generation");
console.log(`통과 기준(concept_explanation): ${pass.before.toLocaleString()}자, 펼친 속성 ${pass.structure.props}개`);
console.log(`거부(code_generation)          : ${fail.before.toLocaleString()}자, 펼친 속성 ${fail.structure.props}개`);
console.log(`\n설명문 제거 시 code_generation: ${fail.before.toLocaleString()} -> ${fail.after.toLocaleString()}자`);
console.log(
  fail.after <= pass.before
    ? `=> 통과 기준(${pass.before.toLocaleString()}자) 아래로 내려간다. 설명문 제거만으로 통과할 가능성이 있다.`
    : `=> 그래도 통과 기준(${pass.before.toLocaleString()}자)보다 크다. 속성 자체를 줄여야 한다.`
);

console.log("\n주의: 설명문(description)은 모델에게 '이 필드에 뭘 넣어야 하는지' 알려주는 역할도 한다.");
console.log("      제거하면 grammar는 작아지지만 응답 품질이 떨어질 수 있으므로, 지우는 대신");
console.log("      시스템 프롬프트로 옮기는 방안을 함께 고려한다.");
