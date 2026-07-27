"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  ClaudeAdapterError,
  createRequestBody,
  generate,
} = require("../claude-adapter");

const schema = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../chatbot/schema.v1.json"), "utf8")
);

// Claude는 구조화 출력에서 maxItems/maxLength/minItems를 거부한다
// ("For 'array' type, property 'maxItems' is not supported"), 그래서 제거가 기본값이다.
test("createRequestBody strips Claude-unsupported keywords by default", () => {
  const previous = process.env.CLAUDE_STRIP_UNSUPPORTED;
  delete process.env.CLAUDE_STRIP_UNSUPPORTED;
  try {
    const body = createRequestBody("AI가 뭐야?", schema);
    const sent = body.output_config.format.schema;
    assert.equal(body.output_config.format.type, "json_schema");
    assert.equal(sent.properties.one_line_answer.maxLength, undefined);
    assert.equal(sent.properties.next_steps.minItems, undefined);
    // 구조(필수 필드·판별자)는 그대로여야 한다
    assert.deepEqual(sent.required, schema.required);
    assert.equal(sent.properties.body.anyOf.length, 8);
    // 원본 객체를 변형하면 안 된다
    assert.equal(schema.properties.one_line_answer.maxLength, 120);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_STRIP_UNSUPPORTED;
    else process.env.CLAUDE_STRIP_UNSUPPORTED = previous;
  }
});

test("createRequestBody passes the original schema unchanged in diagnostic mode (=0)", () => {
  const previous = process.env.CLAUDE_STRIP_UNSUPPORTED;
  process.env.CLAUDE_STRIP_UNSUPPORTED = "0";
  try {
    const body = createRequestBody("AI가 뭐야?", schema);
    assert.strictEqual(body.output_config.format.schema, schema);
    assert.equal(body.output_config.format.schema.properties.one_line_answer.maxLength, 120);
    assert.equal(body.output_config.format.schema.properties.next_steps.minItems, 1);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_STRIP_UNSUPPORTED;
    else process.env.CLAUDE_STRIP_UNSUPPORTED = previous;
  }
});

test("createRequestBody uses output_config.format and no sampling parameters", () => {
  const body = createRequestBody("AI가 뭐야?", schema);
  assert.ok(body.output_config?.format);
  assert.equal("output_format" in body, false);
  assert.equal("temperature" in body, false);
  assert.equal("top_p" in body, false);
  assert.equal("top_k" in body, false);
});

test("generate refuses to run without ANTHROPIC_API_KEY", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(
      () => generate("AI가 뭐야?", schema),
      (error) =>
        error instanceof ClaudeAdapterError &&
        error.category === "configuration_error" &&
        /ANTHROPIC_API_KEY/.test(error.message)
    );
  } finally {
    if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
  }
});

test("generate normalizes a successful Claude JSON response", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key-not-sent";
  let sentBody;
  global.fetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        id: "msg_test",
        model: "claude-sonnet-5",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [
          {
            type: "text",
            text: JSON.stringify({
              schema_version: "1.0",
              body: { type: "concept_explanation" },
            }),
          },
        ],
      }),
      {
        status: 200,
        headers: { "request-id": "req_test", "content-type": "application/json" },
      }
    );
  };

  try {
    const response = await generate("AI가 뭐야?", schema);
    assert.equal(response.json.body.type, "concept_explanation");
    assert.equal(response.meta.provider, "anthropic");
    assert.equal(response.meta.model, "claude-sonnet-5");
    // 기본 모드라 미지원 키워드는 빠진 채로 전송된다. 구조(판별자)는 유지되어야 한다.
    assert.equal(sentBody.output_config.format.schema.properties.body.anyOf.length, 8);
    assert.equal(sentBody.output_config.format.schema.properties.one_line_answer.maxLength, undefined);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test("generate classifies Claude's schema compilation 400 separately", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key-not-sent";
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Schema is too complex for compilation",
        },
      }),
      {
        status: 400,
        headers: { "request-id": "req_schema", "content-type": "application/json" },
      }
    );

  try {
    await assert.rejects(
      () => generate("AI가 뭐야?", schema),
      (error) =>
        error instanceof ClaudeAdapterError &&
        error.category === "schema_compilation_error" &&
        error.status === 400 &&
        error.requestId === "req_schema"
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
