"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  arrayCardinalitySignature,
  normalizeViolation,
  shapeSignature,
} = require("../run-eval");

test("shape signature ignores values and array lengths", () => {
  const a = { body: { type: "x", items: [{ label: "a" }] } };
  const b = { body: { type: "y", items: [{ label: "b" }, { label: "c" }] } };
  assert.equal(shapeSignature(a), shapeSignature(b));
});

test("array cardinality signature detects repeated-run length differences", () => {
  const a = { body: { items: [1] } };
  const b = { body: { items: [1, 2] } };
  assert.notEqual(arrayCardinalitySignature(a), arrayCardinalitySignature(b));
});

test("legacy string semantic violations are normalized", () => {
  assert.deepEqual(normalizeViolation("규칙4: core가 너무 많다."), {
    rule: 4,
    severity: "block",
    message: "규칙4: core가 너무 많다.",
  });
});
