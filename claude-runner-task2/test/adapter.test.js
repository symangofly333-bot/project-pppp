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

test("createRequestBody passes the exact original schema object", () => {
  const body = createRequestBody("AI가 뭐야?", schema);
  assert.equal(body.output_config.format.type, "json_schema");
  assert.strictEqual(body.output_config.format.schema, schema);
  assert.equal(body.output_config.format.schema.properties.one_line_answer.maxLength, 120);
  assert.equal(body.output_config.format.schema.properties.next_steps.minItems, 1);
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
    assert.deepEqual(sentBody.output_config.format.schema, schema);
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
