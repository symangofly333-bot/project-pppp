// 확장 아이콘을 클릭하면, 현재 탭의 가이드(content.js)에 "다시 시작" 신호를 보냅니다.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "restart-tutorial" }, () => {
    // ChatGPT 탭이 아니면 받을 곳이 없어 오류가 나는데, 무시해도 됩니다.
    void chrome.runtime.lastError;
  });
});
