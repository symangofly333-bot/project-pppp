"use strict";
// 진단용 1회 호출 스크립트. Task 2 라이브 실행이 "compiled grammar too large"로
// 실패한 원인이 body.type 8종을 한 anyOf에 다 때려넣은 것 때문인지 확인한다.
//
// body 속성을 8종 anyOf 대신 concept_explanation 1종의 $ref로만 바꾼 축소 스키마로
// 딱 1번 호출한다. 다른 조건(audience/reliability/safety, 미지원 키워드 제거)은
// 실제 라이브 실행과 동일하게 유지한다.
//
// 실행: node test-single-type.js  (ANTHROPIC_API_KEY, 선택: CLAUDE_STRIP_UNSUPPORTED=1)

const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const { generate, stripUnsupportedKeywords } = require("./claude-adapter");

const schemaPath = path.join(__dirname, "..", "chatbot", "schema.v1.json");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

// body를 8종 anyOf → concept_explanation 1종 $ref로 축소.
// 1차 시도에서는 여기서 멈췄었는데, 그러면 $defs 안에 안 쓰는 나머지 7종
// 정의가 그대로 남아있어서 "진짜 축소"가 아니었다. 이번엔 실제로 도달 가능한
// $defs만 남기고 나머지는 잘라낸다(tree-shaking) — 그래야 순수하게
// "1종만 있으면 성공하는지"를 확인할 수 있다.
const reduced = JSON.parse(JSON.stringify(schema));
reduced.properties.body = { $ref: "#/$defs/body_concept_explanation" };

function collectRefs(node, found) {
  if (Array.isArray(node)) { node.forEach((n) => collectRefs(n, found)); return; }
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") {
      const m = node.$ref.match(/^#\/\$defs\/(.+)$/);
      if (m) found.add(m[1]);
    }
    for (const v of Object.values(node)) collectRefs(v, found);
  }
}

function pruneUnreachableDefs(fullSchema) {
  const rootWithoutDefs = { ...fullSchema };
  delete rootWithoutDefs.$defs;
  const found = new Set();
  collectRefs(rootWithoutDefs, found); // properties(body 포함)에서 직접 참조하는 def부터 시작

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...found]) {
      const def = fullSchema.$defs[name];
      if (!def) continue;
      const before = found.size;
      collectRefs(def, found); // 그 def가 또 참조하는 def까지 재귀적으로 확장
      if (found.size !== before) changed = true;
    }
  }

  const prunedDefs = {};
  for (const name of found) if (fullSchema.$defs[name]) prunedDefs[name] = fullSchema.$defs[name];
  return { ...fullSchema, $defs: prunedDefs, __prunedDefCount: Object.keys(prunedDefs).length };
}

const beforeDefCount = Object.keys(schema.$defs).length;
const prunedSchema = pruneUnreachableDefs(reduced);
delete prunedSchema.__prunedDefCount;
const afterDefCount = Object.keys(prunedSchema.$defs).length;
console.log(`$defs 개수: 원본 ${beforeDefCount}개 → 도달 가능한 것만 남긴 뒤 ${afterDefCount}개`);

const stripForApi = process.env.CLAUDE_STRIP_UNSUPPORTED === "1";
console.log(`CLAUDE_STRIP_UNSUPPORTED=${stripForApi ? "1 (미지원 키워드 제거 적용)" : "미설정 (원본 그대로)"}`);

async function main() {
  console.log("\n요청 스키마: body 8종 → concept_explanation 1종으로 축소");
  console.log("호출 1회 시도 중...\n");

  try {
    const response = await generate("AI가 뭐야?", prunedSchema);
    console.log("=== 성공 ===");
    console.log("model:", response.meta.model);
    console.log("stop_reason:", response.meta.stopReason);
    console.log("응답 body.type:", response.json?.body?.type);

    // 원본 스키마 기준으로 형식만 참고 확인 (축소 스키마라 그대로는 통과 못 할 수 있음 — 정보용)
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);
    console.log("\n(참고) 원본 schema.v1.json 기준 AJV:", validate(response.json) ? "통과" : "실패 (축소판이라 예상됨)");

    console.log("\n결론: body 8종을 1종으로 줄이니 성공했다면, '8종 한 번에'가 grammar too large의 원인이다.");
    console.log("      → 다음 단계: 스키마를 body.type별로 쪼개고, 분류 후 해당 타입 스키마로 생성하는 2단계 방식으로 간다.");
  } catch (error) {
    console.log("=== 실패 ===");
    console.log("category:", error.category);
    console.log("status:", error.status);
    console.log("message:", error.message);
    if (error.rawError) console.log("원문:", JSON.stringify(error.rawError, null, 2));

    if (error.category === "schema_compilation_error" || error.category === "schema_request_error") {
      console.log("\n결론: 1종으로 줄여도 여전히 실패했다면, 원인이 '8종 스위치'가 아니라");
      console.log("      더 깊은 중첩 구조(action_step/explanation_block 등 재사용 $ref) 자체에 있다.");
      console.log("      → 다음 단계: 스키마 구조 자체를 단순화해야 한다 (B 방식).");
    }
  }
}

main();
