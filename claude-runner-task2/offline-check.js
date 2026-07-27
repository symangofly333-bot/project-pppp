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

const requestBody = createRequestBody("AI가 뭐야?", schema);
assert.deepEqual(
  requestBody.output_config.format.schema,
  schema,
  "The adapter must pass the original schema without transformation."
);
assert.equal(requestBody.output_config.format.schema.$schema, schema.$schema);
assert.equal(requestBody.output_config.format.schema.properties.one_line_answer.maxLength, 120);
assert.equal(requestBody.output_config.format.schema.properties.next_steps.minItems, 1);

console.log("PASS  원본 schema.v1.json AJV 컴파일");
console.log(`PASS  대표 예시 AJV ${ajvPass}/8`);
console.log("PASS  대표 예시 semantic_validator 오탐 0");
console.log("PASS  Claude 요청에 원본 스키마를 변환 없이 전달");
