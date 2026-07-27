"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const { createRequestBody } = require("./claude-adapter");

const root = path.resolve(__dirname, "..");
const chatbotDir = path.join(root, "chatbot");
const schemaPath = path.join(chatbotDir, "schema.v1.json");
const examplesPath = path.join(chatbotDir, "examples.json");
const semanticPath = path.join(chatbotDir, "semantic_validator.js");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const examples = JSON.parse(fs.readFileSync(examplesPath, "utf8"));
const { check } = require(semanticPath);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
let ajvPass = 0;
let semanticViolations = 0;

for (const example of examples) {
  const response = structuredClone(example);
  delete response._name;
  if (validate(response)) ajvPass += 1;
  else console.error(example._name, validate.errors);
  semanticViolations += check(response, {}).length;
}

assert.equal(ajvPass, 8, "All eight examples must pass the original schema.");
assert.equal(semanticViolations, 0, "Examples must not trigger semantic violations.");

// 라이브 진단 결과 Claude는 maxItems/maxLength/minItems를 거부하므로,
// 어댑터는 기본적으로 이 미지원 키워드를 제거해서 보낸다.
const previousStrip = process.env.CLAUDE_STRIP_UNSUPPORTED;
delete process.env.CLAUDE_STRIP_UNSUPPORTED;
const strippedBody = createRequestBody("AI가 뭐야?", schema);
const strippedSchema = strippedBody.output_config.format.schema;
assert.equal(
  strippedSchema.properties.one_line_answer.maxLength,
  undefined,
  "기본 모드에서는 maxLength가 제거되어야 한다."
);
assert.equal(
  strippedSchema.properties.next_steps.minItems,
  undefined,
  "기본 모드에서는 minItems가 제거되어야 한다."
);
// 구조 자체(필수 필드, 판별자)는 보존되어야 한다 — 계약이 바뀌면 안 된다.
assert.deepEqual(strippedSchema.required, schema.required);
assert.equal(strippedSchema.properties.body.anyOf.length, 8);

// 진단 모드(=0)에서는 원본을 손대지 않고 그대로 보낸다.
process.env.CLAUDE_STRIP_UNSUPPORTED = "0";
const rawSchema = createRequestBody("AI가 뭐야?", schema).output_config.format.schema;
assert.deepEqual(rawSchema, schema, "진단 모드에서는 원본 스키마를 그대로 전달해야 한다.");
assert.equal(rawSchema.properties.one_line_answer.maxLength, 120);
if (previousStrip === undefined) delete process.env.CLAUDE_STRIP_UNSUPPORTED;
else process.env.CLAUDE_STRIP_UNSUPPORTED = previousStrip;

console.log("PASS  원본 schema.v1.json AJV 컴파일");
console.log(`PASS  대표 예시 AJV ${ajvPass}/8`);
console.log("PASS  대표 예시 semantic_validator 오탐 0");
console.log("PASS  기본 모드: Claude 미지원 키워드 제거, 구조는 보존");
console.log("PASS  진단 모드(=0): 원본 스키마를 변환 없이 전달");
