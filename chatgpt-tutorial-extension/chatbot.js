// Phase 2 — 전문화 챗봇 (팝업)
// 지금은 "껍데기"만: 떠있는 창 + 입력칸 + 대화 목록.
// 아직 진짜 AI 호출은 없습니다. send를 누르면 자리표시(stub) 답변만 나옵니다.
// 다음 단계(2번)에서 이 sendToAI() 안에서만 실제 API를 부르면 됩니다.

if (!window.__cgptChatbotInjected) {
  window.__cgptChatbotInjected = true;

  // ── 스타일 격리를 위해 별도의 Shadow DOM 호스트를 만듭니다.
  //    (가이드 오버레이 content.js와 겹치지 않도록 완전히 분리된 창입니다.)
  const host = document.createElement("div");
  host.id = "cgpt-chatbot-host";
  host.style.all = "initial";
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  // 챗봇 창 안에서 일어나는 클릭/키 입력이 ChatGPT 페이지로 새어나가지 않게 막습니다.
  ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "keydown", "touchstart"].forEach((type) => {
    host.addEventListener(type, (e) => e.stopPropagation());
  });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", sans-serif; }

      .panel {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 360px;
        height: 480px;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.18);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 2147483646;
      }
      .panel.minimized { height: 44px; }

      .header {
        height: 44px;
        flex: 0 0 44px;
        background: #10a37f;
        color: #fff;
        display: flex;
        align-items: center;
        padding: 0 8px 0 14px;
        cursor: move;
        user-select: none;
      }
      .title { font-size: 14px; font-weight: 600; flex: 1; }
      .hbtn {
        width: 28px; height: 28px;
        border: none; background: transparent; color: #fff;
        font-size: 16px; cursor: pointer; border-radius: 6px;
      }
      .hbtn:hover { background: rgba(255,255,255,0.2); }

      .messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: #f7f7f8;
      }
      .msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
      .msg.user { align-self: flex-end; background: #10a37f; color: #fff; border-bottom-right-radius: 3px; }
      .msg.ai   { align-self: flex-start; background: #fff; color: #202123; border: 1px solid #e5e5e5; border-bottom-left-radius: 3px; }

      /* AI 답변 소제목(칸) */
      .msg.ai .sec { margin-bottom: 8px; }
      .msg.ai .sec:last-child { margin-bottom: 0; }
      .msg.ai .sec-h { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #10a37f; margin-bottom: 2px; }
      .msg.ai .sec-b { font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
      .msg.ai .doclink { display: inline-block; margin-top: 4px; font-size: 12px; color: #10a37f; text-decoration: underline; }

      /* 대기 중 로딩 점 3개 */
      .loading span { display: inline-block; width: 6px; height: 6px; margin: 0 2px; border-radius: 50%; background: #999; animation: blink 1.2s infinite both; }
      .loading span:nth-child(2) { animation-delay: .2s; }
      .loading span:nth-child(3) { animation-delay: .4s; }
      @keyframes blink { 0%, 80%, 100% { opacity: .2; } 40% { opacity: 1; } }

      .composer {
        flex: 0 0 auto;
        display: flex;
        gap: 8px;
        padding: 10px;
        border-top: 1px solid #ececec;
        background: #fff;
      }
      textarea {
        flex: 1;
        resize: none;
        height: 40px;
        max-height: 120px;
        padding: 9px 11px;
        border: 1px solid #d0d0d0;
        border-radius: 8px;
        font-size: 13px;
        outline: none;
      }
      textarea:focus { border-color: #10a37f; }
      .send {
        flex: 0 0 auto;
        border: none;
        background: #10a37f;
        color: #fff;
        border-radius: 8px;
        padding: 0 14px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .send:hover { background: #0e8f6f; }

      .panel.minimized .messages,
      .panel.minimized .composer { display: none; }

      /* 최소화된 뒤 다시 열기 위한 동그란 버튼 */
      .launcher {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 52px; height: 52px;
        border-radius: 50%;
        background: #10a37f;
        color: #fff;
        border: none;
        font-size: 22px;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,0.22);
        z-index: 2147483646;
        display: none;
      }
    </style>

    <button class="launcher" title="도우미 챗봇 열기">💬</button>

    <div class="panel">
      <div class="header">
        <span class="title">도우미 챗봇</span>
        <button class="hbtn minBtn" title="최소화">—</button>
        <button class="hbtn closeBtn" title="닫기">×</button>
      </div>
      <div class="messages"></div>
      <div class="composer">
        <textarea placeholder="궁금한 걸 입력하세요…"></textarea>
        <button class="send">보내기</button>
      </div>
    </div>
  `;

  const panel = shadow.querySelector(".panel");
  const launcher = shadow.querySelector(".launcher");
  const header = shadow.querySelector(".header");
  const messagesEl = shadow.querySelector(".messages");
  const textarea = shadow.querySelector("textarea");
  const sendBtn = shadow.querySelector(".send");
  const minBtn = shadow.querySelector(".minBtn");
  const closeBtn = shadow.querySelector(".closeBtn");

  // ── 대화 한 줄을 화면에 추가합니다. role: "user" | "ai"
  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── AI 답변(JSON)을 소제목별 칸으로 그립니다. 빈 칸은 건너뜁니다. (스트리밍 없음)
  const SECTIONS = [
    ["topic", "Topic"],
    ["term_meaning", "Term meaning"],
    ["code_explanation", "Code explanation"],
    ["overall_structure", "Overall structure"],
  ];
  function addAiAnswer(data) {
    const div = document.createElement("div");
    div.className = "msg ai";
    for (const [key, label] of SECTIONS) {
      if (!data[key]) continue; // 빈 칸은 표시 안 함
      const sec = document.createElement("div");
      sec.className = "sec";
      const h = document.createElement("div");
      h.className = "sec-h";
      h.textContent = label;
      const b = document.createElement("div");
      b.className = "sec-b";
      b.textContent = data[key];
      sec.appendChild(h);
      sec.appendChild(b);
      div.appendChild(sec);
    }
    // confidence 필드 대신: 확실치 않은 답이면 공식 문서 링크를 붙입니다.
    if (data.doc_link) {
      const a = document.createElement("a");
      a.className = "doclink";
      a.href = data.doc_link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Official docs →";
      div.appendChild(a);
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // ── 답변 기다리는 동안 점 3개 로딩 표시. 지우는 함수를 돌려줍니다.
  function showLoading() {
    const div = document.createElement("div");
    div.className = "msg ai loading";
    div.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return () => div.remove();
  }

  // ── 나중에(2번 단계) 여기 안에서만 실제 AI API를 부르면 됩니다.
  //    반드시 아래 형태의 JSON을 "강제"로 받아서 그대로 돌려주세요:
  //      { topic, term_meaning, code_explanation, overall_structure, doc_link }
  //    - 코드 질문이 아니면 code_explanation / overall_structure 는 빈 문자열("")
  //    - doc_link: 확실치 않은 답이면 공식 문서 링크 (confidence 필드 대체)
  //    지금은 자리표시(stub) 답변만 돌려줍니다.
  async function sendToAI(userText) {
    return {
      topic: "AI not connected yet",
      term_meaning: "This is a UI preview. Your question: " + userText,
      code_explanation: "",
      overall_structure: "",
      doc_link: "",
    };
  }

  async function handleSend() {
    const text = textarea.value.trim();
    if (!text) return;
    addMessage("user", text);
    textarea.value = "";
    const done = showLoading();
    let data;
    try {
      data = await sendToAI(text);
    } catch (e) {
      done();
      addMessage("ai", "Something went wrong. Please try again.");
      return;
    }
    done();
    addAiAnswer(data);
  }

  sendBtn.addEventListener("click", handleSend);
  textarea.addEventListener("keydown", (e) => {
    // Enter = 전송, Shift+Enter = 줄바꿈
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // ── 최소화 / 닫기 / 다시 열기
  minBtn.addEventListener("click", () => {
    panel.style.display = "none";
    launcher.style.display = "block";
  });
  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
    launcher.style.display = "block";
  });
  launcher.addEventListener("click", () => {
    launcher.style.display = "none";
    panel.style.display = "flex";
  });

  // ── 헤더를 잡아 창을 드래그로 옮길 수 있게 합니다.
  let dragging = false, offsetX = 0, offsetY = 0;
  header.addEventListener("pointerdown", (e) => {
    // 헤더의 버튼(최소화/닫기)을 누른 경우는 드래그로 취급하지 않습니다.
    if (e.target.closest(".hbtn")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, e.clientX - offsetX));
    const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - offsetY));
    panel.style.left = x + "px";
    panel.style.top = y + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  });
  header.addEventListener("pointerup", (e) => {
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch (_) {}
  });

  // 첫 안내 메시지
  addMessage("ai", "안녕하세요! 궁금한 걸 물어보세요. (지금은 UI 미리보기라 AI 답변은 다음 단계에서 연결됩니다.)");
}
