// 스키마 분리기 (schema splitter)
//
// 배경: schema.v1.json은 body.type 8종을 anyOf로 한 번에 담고 있는데,
// 이걸 통째로 Claude 구조화 출력에 넘기면 거부된다.
//   "The compiled grammar is too large, which would cause performance issues."
// 8종 중 1종만 남기고 안 쓰는 $defs까지 잘라내면(33개 -> 11개) 통과한다.
//
// 그래서 생성은 2단계로 간다:
//   1단계(분류) 질문이 어떤 body.type인지 먼저 판단
//   2단계(생성) 그 타입 하나짜리 축소 스키마로 실제 답변 생성
//
// 이 파일은 그 축소 스키마를 만드는 순수 함수 모음이다. API 호출 없음.
// 판정(AJV)은 언제나 원본 schema.v1.json으로 한다 — 축소본은 생성 요청용일 뿐이다.

"use strict";

// 노드 트리에서 참조하는 "#/$defs/<이름>" 을 전부 모은다.
function collectRefs(node, found) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
    return found;
  }
  if (node && typeof node === "object") {
    if (typeof node.$ref === "string") {
      const match = node.$ref.match(/^#\/\$defs\/(.+)$/);
      if (match) found.add(match[1]);
    }
    for (const value of Object.values(node)) collectRefs(value, found);
  }
  return found;
}

// 실제로 도달 가능한 $defs만 남기고 나머지는 잘라낸다.
// (루트에서 시작해, 참조가 더 안 늘어날 때까지 재귀적으로 확장)
function pruneUnreachableDefs(schema) {
  const defs = schema.$defs || {};
  const rootWithoutDefs = { ...schema };
  delete rootWithoutDefs.$defs;

  const reachable = collectRefs(rootWithoutDefs, new Set());
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...reachable]) {
      const def = defs[name];
      if (!def) continue;
      const before = reachable.size;
      collectRefs(def, reachable);
      if (reachable.size !== before) grew = true;
    }
  }

  const kept = {};
  for (const name of reachable) {
    if (defs[name]) kept[name] = defs[name];
  }
  return { ...schema, $defs: kept };
}

// 원본 스키마에서 body.type 8종의 목록을 뽑는다.
// 각 항목: { type: "concept_explanation", defName: "body_concept_explanation" }
function listBodyTypes(schema) {
  const variants = schema?.properties?.body?.anyOf;
  if (!Array.isArray(variants)) {
    throw new Error("schema.properties.body.anyOf 를 찾을 수 없다. 스키마 구조가 바뀌었는지 확인할 것.");
  }
  return variants.map((variant) => {
    const match = String(variant.$ref || "").match(/^#\/\$defs\/(.+)$/);
    if (!match) throw new Error(`body.anyOf 항목이 $ref 형태가 아니다: ${JSON.stringify(variant)}`);
    const defName = match[1];
    const def = schema.$defs?.[defName];
    const typeValue = def?.properties?.type?.enum?.[0];
    if (!typeValue) throw new Error(`${defName} 에서 type enum 값을 못 찾았다.`);
    return { type: typeValue, defName };
  });
}

// body.type 하나짜리 축소 스키마를 만든다.
// body의 8종 anyOf를 해당 타입 1개 $ref로 바꾸고, 안 쓰는 $defs를 잘라낸다.
function buildTypeSchema(schema, bodyType) {
  const entry = listBodyTypes(schema).find((item) => item.type === bodyType);
  if (!entry) {
    throw new Error(`알 수 없는 body.type: ${bodyType}`);
  }
  const reduced = JSON.parse(JSON.stringify(schema));
  reduced.properties.body = { $ref: `#/$defs/${entry.defName}` };
  // 축소본 8종은 서로 다른 스키마이므로 원본의 $id를 물려받으면 안 된다.
  // (참조가 전부 로컬 "#/$defs/..." 라서 $id 없이도 해석에 문제없다.)
  delete reduced.$id;
  return pruneUnreachableDefs(reduced);
}

// 8종 전부를 한 번에 만들어 { [type]: schema } 로 돌려준다.
function buildAllTypeSchemas(schema) {
  const out = {};
  for (const { type } of listBodyTypes(schema)) {
    out[type] = buildTypeSchema(schema, type);
  }
  return out;
}

// 1단계(분류)용 초소형 스키마. body.type 8종 중 하나만 고르게 한다.
// 이 스키마는 매우 작아서 grammar 크기 문제를 일으키지 않는다.
function buildClassifierSchema(schema) {
  const types = listBodyTypes(schema).map((item) => item.type);
  return {
    type: "object",
    additionalProperties: false,
    required: ["body_type"],
    properties: {
      body_type: {
        type: "string",
        enum: types,
        description: "사용자 질문에 가장 알맞은 답변 유형 하나",
      },
    },
  };
}

module.exports = {
  collectRefs,
  pruneUnreachableDefs,
  listBodyTypes,
  buildTypeSchema,
  buildAllTypeSchemas,
  buildClassifierSchema,
};
