// grammar 폭발 원인 분석 (오프라인, API 호출 없음)
//
// Claude 거부 메시지는 "compiled grammar is too large"인데, 이건 JSON 글자 수가 아니라
// "이 스키마가 허용하는 문서 모양의 가짓수"에 가깝다. anyOf(선택지)가 겹치면 곱셈으로 늘어난다.
//
// 실측:
//   concept_explanation 4,493자 -> 통과
//   code_generation     7,199자 -> 거부
// 글자 수만으로는 왜 그런지 설명이 안 되므로, 아래 두 지표를 같이 본다.
//
//   - branchProduct: 선택지들이 곱해져 만들어지는 "모양 가짓수" (조합 폭발의 직접 지표)
//   - inlinedCost  : $ref를 매번 펼쳐서 계산한 노드 수 (재사용이 많을수록 커진다)
//
// 실행: node analyze-grammar.js

"use strict";

const fs = require("fs");
const path = require("path");
const { listBodyTypes, buildTypeSchema } = require("./schema-split");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "schema.v1.json"), "utf8"));

function resolveRef(root, ref) {
  const match = String(ref).match(/^#\/\$defs\/(.+)$/);
  return match ? root.$defs?.[match[1]] : null;
}

// $ref를 매번 펼쳐서(inline) 계산한다. grammar 컴파일러는 재사용을 공유하지 않고
// 펼치는 경우가 많아, 이 쪽이 실제 폭발 규모에 더 가깝다.
function analyze(root, node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 40) {
    return { cost: 1, product: 1 };
  }

  if (node.$ref) {
    const target = resolveRef(root, node.$ref);
    return target ? analyze(root, target, depth + 1) : { cost: 1, product: 1 };
  }

  if (Array.isArray(node.anyOf)) {
    // 선택지: 비용은 합, "모양 가짓수"도 합
    let cost = 1;
    let product = 0;
    for (const branch of node.anyOf) {
      const sub = analyze(root, branch, depth + 1);
      cost += sub.cost;
      product += sub.product;
    }
    return { cost, product };
  }

  if (node.type === "array" && node.items) {
    const sub = analyze(root, node.items, depth + 1);
    // 배열 원소가 선택지면 자리마다 갈라진다. maxItems가 제거된 뒤라 길이 상한도 없어
    // 폭발이 더 심해진다 — 원소 가짓수를 제곱 정도로 본다(보수적 근사).
    return { cost: 1 + sub.cost, product: Math.max(1, sub.product * sub.product) };
  }

  if (node.properties) {
    let cost = 1;
    let product = 1;
    for (const value of Object.values(node.properties)) {
      const sub = analyze(root, value, depth + 1);
      cost += sub.cost;
      product *= sub.product; // 필드끼리는 곱해진다
    }
    return { cost, product };
  }

  return { cost: 1, product: 1 };
}

// 어떤 def가 몇 번 펼쳐지는지 (재사용 비용의 범인 찾기)
function countInlineExpansions(root, node, counts = {}, depth = 0) {
  if (!node || typeof node !== "object" || depth > 40) return counts;
  if (node.$ref) {
    const match = String(node.$ref).match(/^#\/\$defs\/(.+)$/);
    if (match) {
      counts[match[1]] = (counts[match[1]] || 0) + 1;
      const target = root.$defs?.[match[1]];
      if (target) countInlineExpansions(root, target, counts, depth + 1);
    }
    return counts;
  }
  if (Array.isArray(node)) {
    for (const item of node) countInlineExpansions(root, item, counts, depth + 1);
    return counts;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") countInlineExpansions(root, value, counts, depth + 1);
  }
  return counts;
}

module.exports = { analyze, countInlineExpansions };

// 아래는 CLI로 직접 실행했을 때만 동작한다
if (require.main !== module) return;

const LIVE_RESULT = {
  concept_explanation: "통과",
  code_generation: "거부",
};

const rows = [];
for (const { type } of listBodyTypes(schema)) {
  const reduced = buildTypeSchema(schema, type);
  const size = JSON.stringify(reduced).length;
  const { cost, product } = analyze(reduced, reduced);
  rows.push({ type, size, defs: Object.keys(reduced.$defs).length, cost, product });
}
rows.sort((a, b) => a.product - b.product);

console.log("=== 타입별 grammar 부담 (모양 가짓수 오름차순) ===\n");
console.log(
  "타입".padEnd(23) + "크기".padStart(9) + "펼친노드".padStart(9) + "모양가짓수".padStart(16) + "  라이브"
);
for (const row of rows) {
  console.log(
    row.type.padEnd(23) +
      `${row.size.toLocaleString()}`.padStart(9) +
      `${row.cost}`.padStart(9) +
      `${row.product.toExponential(1)}`.padStart(16) +
      "  " +
      (LIVE_RESULT[row.type] || "-")
  );
}

console.log("\n=== 가장 큰 타입(code_generation)에서 def가 몇 번 펼쳐지나 ===\n");
const worst = buildTypeSchema(schema, "code_generation");
const counts = countInlineExpansions(worst, worst);
const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [name, n] of top) {
  console.log(`${String(n).padStart(3)}회  ${name}`);
}

console.log("\n=== 통과/거부 사이의 차이 ===\n");
const pass = rows.find((r) => r.type === "concept_explanation");
const fail = rows.find((r) => r.type === "code_generation");
console.log(`통과 concept_explanation : 크기 ${pass.size.toLocaleString()}, 모양 ${pass.product.toExponential(1)}`);
console.log(`거부 code_generation     : 크기 ${fail.size.toLocaleString()}, 모양 ${fail.product.toExponential(1)}`);
console.log(`크기 비율 ${(fail.size / pass.size).toFixed(1)}배 vs 모양 비율 ${(fail.product / pass.product).toExponential(1)}배`);
console.log("\n=> 크기보다 '모양 가짓수'가 훨씬 크게 벌어진다면, 줄여야 할 건 글자 수가 아니라 선택지(anyOf)다.");
