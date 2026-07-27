// 선택지(anyOf) 평탄화 — 생성 요청용 스키마 전용
//
// 배경: Claude 구조화 출력은 "이 스키마가 허용하는 문서 모양의 가짓수"가 크면 거부한다.
//   concept_explanation  모양 9   -> 통과
//   code_generation      모양 140 -> 거부 ("compiled grammar is too large")
// 모양 가짓수는 anyOf가 겹칠 때 곱셈으로 늘어난다.
//   reliability(3) x safety(3) = 9 가 모든 타입의 기본값이고,
//   여기에 배열 안의 action_step(3) / any_code(2) 가 또 곱해진다.
//
// 그래서 "A형|B형|C형 중 하나"를 "형식 표시 필드 + 나머지는 선택 필드" 하나로 합친다.
//   - properties: 모든 분기의 속성을 합집합
//   - required  : 모든 분기의 required 교집합 (어느 분기든 반드시 있는 것만 필수)
//   - 판별자 enum: 분기별 값을 합쳐서 나열 (예: stable | needs_current_check | uncertain)
//
// 중요: 평탄화본은 "생성 요청용"일 뿐이다. 원본보다 느슨하므로
//       판정(AJV)은 언제나 원본 schema.v1.json으로 한다.
//       조건부 필수("status가 uncertain이면 why_it_matters 필수")는
//       description으로 모델에 알리고, 최종 확인은 원본 스키마와 semantic_validator가 한다.

"use strict";

function resolveRef(root, ref) {
  const match = String(ref).match(/^#\/\$defs\/(.+)$/);
  return match ? root.$defs?.[match[1]] : null;
}

// $ref를 따라가 실제 스키마 노드를 얻는다
function deref(root, node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 20) return node;
  if (node.$ref) return deref(root, resolveRef(root, node.$ref), depth + 1);
  return node;
}

// anyOf 분기가 전부 객체면 하나로 합칠 수 있다
function canMerge(root, branches) {
  return branches.every((branch) => {
    const resolved = deref(root, branch);
    return resolved && resolved.type === "object" && resolved.properties;
  });
}

// 같은 이름의 속성이 분기마다 다른 enum을 가지면(판별자) 값을 합친다
function mergeProperty(existing, incoming) {
  if (!existing) return JSON.parse(JSON.stringify(incoming));
  const merged = JSON.parse(JSON.stringify(existing));
  if (Array.isArray(existing.enum) && Array.isArray(incoming.enum)) {
    merged.enum = [...new Set([...existing.enum, ...incoming.enum])];
  }
  return merged;
}

function mergeBranches(root, branches) {
  const resolved = branches.map((branch) => deref(root, branch));
  const properties = {};
  const requiredSets = [];

  for (const branch of resolved) {
    requiredSets.push(new Set(branch.required || []));
    for (const [name, subschema] of Object.entries(branch.properties || {})) {
      properties[name] = mergeProperty(properties[name], subschema);
    }
  }

  // 모든 분기에 공통으로 필수인 것만 필수로 남긴다
  const required = [...requiredSets[0]].filter((name) =>
    requiredSets.every((set) => set.has(name))
  );

  // 어떤 분기에서만 필수인 필드는 모델이 놓치기 쉬우므로 설명으로 알린다
  const conditional = [];
  for (const name of Object.keys(properties)) {
    if (required.includes(name)) continue;
    const neededBy = resolved.filter((branch) => (branch.required || []).includes(name));
    if (neededBy.length > 0) conditional.push(name);
  }

  const merged = {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
  if (conditional.length > 0) {
    merged.description =
      (resolved[0].description ? `${resolved[0].description} ` : "") +
      `선택한 형식에 해당하는 필드만 채운다. 형식별 필수 필드: ${conditional.join(", ")}.`;
  }
  return merged;
}

// 스키마 전체를 훑으며 합칠 수 있는 anyOf를 전부 합친다
function flattenUnions(schema) {
  const root = schema;

  function walk(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 40) return node;
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));

    if (Array.isArray(node.anyOf) && canMerge(root, node.anyOf)) {
      const merged = mergeBranches(root, node.anyOf);
      // 합친 결과 안에도 anyOf가 남아있을 수 있으므로 한 번 더 훑는다
      return walk(merged, depth + 1);
    }

    const out = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = walk(value, depth + 1);
    }
    return out;
  }

  const flattened = walk(JSON.parse(JSON.stringify(schema)));

  // 합쳐지면서 아무도 참조하지 않게 된 $defs는 정리한다
  const { pruneUnreachableDefs } = require("./schema-split");
  return pruneUnreachableDefs(flattened);
}

module.exports = { flattenUnions };
