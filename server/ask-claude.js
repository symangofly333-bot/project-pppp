"use strict";
// 배우기용 AI 자연어 호출. JSON 파이프라인(generate-validated.js)을 대체한다 — PROJECT.md 4-1절.
//
// prompt-eval/run.js와 사실상 같은 호출이다. 프롬프트 텍스트는 복사해두지 않고
// PROMPTS.md에서 직접 뽑아 쓴다 — 그래야 PROMPTS.md를 고쳤을 때 여기가 조용히
// 옛날 걸로 남는 일이 없다.

const { loadPrompts } = require("../prompt-eval/load-prompts");

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 60_000;

class AskClaudeError extends Error {
  constructor(message, category) {
    super(message);
    this.category = category;
  }
}

async function askLearningAI(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AskClaudeError("ANTHROPIC_API_KEY is not set.", "configuration_error");
  }

  const { learning } = loadPrompts();

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: learning,
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new AskClaudeError(`Claude request failed: ${error.message}`, "network_error");
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new AskClaudeError(
      payload?.error?.message || `Claude API returned ${response.status}`,
      "provider_error"
    );
  }

  if (payload.stop_reason === "refusal") {
    throw new AskClaudeError("Claude declined to answer.", "refusal");
  }

  const text = (payload.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { text, usage: payload.usage };
}

module.exports = { askLearningAI, AskClaudeError };
