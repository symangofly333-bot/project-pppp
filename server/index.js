"use strict";
// 확장 프로그램(chatbot.js)과 Claude API 사이의 중계 서버.
//
// 왜 필요한가: 브라우저 확장 코드는 사용자 컴퓨터에서 실행되므로, 거기에 ANTHROPIC_API_KEY를
// 넣으면 설치한 모든 사람의 브라우저에 키가 그대로 노출된다. 그래서 키는 이 서버(개발자가
// 운영)에만 두고, 확장 프로그램은 이 서버의 /ask 엔드포인트만 호출한다.
//
// 실행: ANTHROPIC_API_KEY를 환경변수로 설정한 뒤 `npm start` (기본 포트 8787).

const http = require("node:http");
const { askLearningAI } = require("./ask-claude");

const PORT = Number.parseInt(process.env.PORT || "8787", 10);

// 개발 중에는 로컬에서 로드한 확장 프로그램이 붙는다. 배포판 도메인이 생기면
// ALLOWED_ORIGIN 환경변수로 바꿔서 확장 프로그램 origin만 허용하면 된다.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGIN,
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// 외부(확장 프로그램)에서 오는 입력이라 느슨하게 두면 안 된다.
// Claude API 자체 요구사항: 첫 메시지는 user, role은 번갈아 나와야 한다.
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages must be a non-empty array";
  }
  for (const [i, m] of messages.entries()) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) {
      return `messages[${i}].role must be "user" or "assistant"`;
    }
    if (typeof m.content !== "string" || m.content.trim() === "") {
      return `messages[${i}].content must be a non-empty string`;
    }
  }
  if (messages[0].role !== "user") {
    return "messages[0].role must be \"user\"";
  }
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) {
      return `messages[${i}].role must differ from the previous message's role`;
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/ask") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "invalid_json_body" });
    return;
  }

  const validationError = validateMessages(payload?.messages);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }

  try {
    const result = await askLearningAI(payload.messages);
    sendJson(res, 200, { text: result.text });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${error.category || "error"}: ${error.message}`);
    sendJson(res, 502, {
      error: error.category || "generation_failed",
      message: "지금은 답을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`중계 서버 실행 중: http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("경고: ANTHROPIC_API_KEY가 설정되어 있지 않다. /ask 요청은 전부 실패한다.");
  }
});
