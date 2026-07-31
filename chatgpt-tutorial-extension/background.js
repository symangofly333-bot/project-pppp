// 확장 아이콘을 클릭하면, 현재 탭의 가이드(content.js)에 "다시 시작" 신호를 보냅니다.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "restart-tutorial" }, () => {
    // ChatGPT 탭이 아니면 받을 곳이 없어 오류가 나는데, 무시해도 됩니다.
    void chrome.runtime.lastError;
  });
});

// 챗봇(content script)을 대신해 중계 서버에 질문을 전달합니다.
//
// 왜 background에서 fetch하는가: content script는 열려 있는 ChatGPT 페이지의 CSP를
// 그대로 적용받아, 우리 서버로의 요청이 페이지 정책에 막힐 수 있습니다. background는
// 페이지와 분리된 확장 프로그램 자체 컨텍스트라 이 제약이 없습니다.
// API 키는 여기 코드에 없습니다 — 중계 서버(server/index.js)만 갖고 있습니다.
const RELAY_SERVER_URL = "http://localhost:8787/ask";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ask-ai") return false;

  fetch(RELAY_SERVER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: message.messages }),
  })
    .then(async (res) => {
      const body = await res.json();
      if (!res.ok) {
        sendResponse({ ok: false, error: body.message || body.error || "요청이 실패했습니다." });
        return;
      }
      sendResponse({ ok: true, data: body });
    })
    .catch((error) => {
      sendResponse({ ok: false, error: `중계 서버에 연결할 수 없습니다: ${error.message}` });
    });

  return true; // fetch가 비동기이므로 sendResponse를 나중에 부른다는 신호
});
