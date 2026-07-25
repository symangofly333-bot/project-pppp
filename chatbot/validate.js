const fs = require("fs");
const Ajv = require("ajv/dist/2020");

const schema = JSON.parse(fs.readFileSync(__dirname + "/schema.v1.json", "utf8"));
const examples = JSON.parse(fs.readFileSync(__dirname + "/examples.json", "utf8"));
const negatives = require("./negative.js");

const ajv = new Ajv({ allErrors: true, strict: true });
let validate;
try {
  validate = ajv.compile(schema);
  console.log("[컴파일] Draft 2020-12 메타스키마 컴파일 성공\n");
} catch (e) {
  console.log("[컴파일] 실패:", e.message);
  process.exit(1);
}

console.log("=== 1. 대표 예시 8종 (통과해야 정상) ===");
let posPass = 0;
for (const ex of examples) {
  const name = ex._name;
  const obj = JSON.parse(JSON.stringify(ex));
  delete obj._name;
  const ok = validate(obj);
  if (ok) posPass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log("   ", ajv.errorsText(validate.errors, { separator: "\n    " }));
}
console.log(`\n결과: ${posPass}/${examples.length} 통과\n`);

console.log("=== 2. 반례 20종 (거부되어야 정상) ===");
let negPass = 0;
for (const c of negatives) {
  const ok = validate(c.obj);
  const expectedReject = !c.name.includes("스키마는 통과 예상");
  const good = expectedReject ? !ok : ok;
  if (good) negPass++;
  console.log(`${good ? "OK  " : "MISS"}  ${c.name}  → ${ok ? "허용" : "거부"}`);
}
console.log(`\n결과: ${negPass}/${negatives.length} 기대대로 동작\n`);

console.log("=== 3. 응답 크기 (간결성 확인) ===");
for (const ex of examples) {
  const obj = JSON.parse(JSON.stringify(ex));
  delete obj._name;
  const bytes = Buffer.byteLength(JSON.stringify(obj), "utf8");
  const chars = JSON.stringify(obj).length;
  console.log(`${String(chars).padStart(5)}자 / ~${Math.round(chars / 2.2)}토큰(추정)  ${ex._name}`);
}

console.log("\n=== 4. null / 빈 배열 검사 ===");
function scan(node, path, out) {
  if (node === null) out.nulls.push(path);
  else if (Array.isArray(node)) {
    if (node.length === 0) out.empties.push(path);
    node.forEach((v, i) => scan(v, `${path}[${i}]`, out));
  } else if (typeof node === "object") {
    for (const k of Object.keys(node)) scan(node[k], `${path}.${k}`, out);
  }
}
const out = { nulls: [], empties: [] };
for (const ex of examples) {
  const obj = JSON.parse(JSON.stringify(ex));
  delete obj._name;
  scan(obj, ex._name.split(" ")[0], out);
}
console.log("null 개수:", out.nulls.length, out.nulls);
console.log("빈 배열 개수:", out.empties.length, out.empties);

console.log("\n=== 5. 스키마 규모 ===");
const defs = Object.keys(schema.$defs).length;
let props = 0, maxDepth = 0;
(function walk(n, d) {
  maxDepth = Math.max(maxDepth, d);
  if (n && typeof n === "object") {
    if (n.properties) props += Object.keys(n.properties).length;
    for (const k of Object.keys(n)) walk(n[k], k === "properties" ? d + 1 : d);
  }
})(schema, 0);
console.log(`$defs: ${defs}개, 속성 총합: ${props}개, 중첩 깊이(추정): ${maxDepth}`);
console.log("스키마 문자 수:", JSON.stringify(schema).length);

console.log("\n=== 6. OpenAI strict 모드 변환 검사 ===");
const UNSUPPORTED = ["minItems", "maxItems", "maxLength", "minLength", "pattern", "format", "minimum", "maximum", "uniqueItems", "default"];
const found = {};
(function scanKw(n) {
  if (n && typeof n === "object") {
    for (const k of Object.keys(n)) {
      if (UNSUPPORTED.includes(k)) found[k] = (found[k] || 0) + 1;
      scanKw(n[k]);
    }
  }
})(schema);
console.log("strict 모드에서 지원 여부 확인이 필요한 키워드 사용 횟수:", found);

// strict 변환본 생성
function toStrict(n) {
  if (Array.isArray(n)) return n.map(toStrict);
  if (n && typeof n === "object") {
    const o = {};
    for (const k of Object.keys(n)) {
      if (UNSUPPORTED.includes(k)) continue;
      o[k] = toStrict(n[k]);
    }
    if (o.type === "object" && o.properties) {
      o.required = Object.keys(o.properties);
      o.additionalProperties = false;
    }
    return o;
  }
  return n;
}
const strict = toStrict(schema);
delete strict.$schema;
fs.writeFileSync(__dirname + "/schema.v1.openai-strict.json", JSON.stringify(strict, null, 2));

// strict 변환본이 여전히 예시를 통과하는지
const ajv2 = new Ajv({ allErrors: true, strict: false });
const v2 = ajv2.compile({ ...strict, $schema: "https://json-schema.org/draft/2020-12/schema" });
let sp = 0;
for (const ex of examples) {
  const obj = JSON.parse(JSON.stringify(ex));
  delete obj._name;
  if (v2(obj)) sp++;
}
console.log(`strict 변환본 예시 통과: ${sp}/${examples.length}`);
console.log("strict 변환본 문자 수:", JSON.stringify(strict).length);

// strict 변환 후 어떤 반례가 통과해버리는지
let leak = [];
for (const c of negatives) {
  const expectedReject = !c.name.includes("스키마는 통과 예상");
  if (expectedReject && v2(c.obj)) leak.push(c.name);
}
console.log(`strict 변환 후 새어나가는 반례 ${leak.length}건:`);
leak.forEach((l) => console.log("  -", l));
