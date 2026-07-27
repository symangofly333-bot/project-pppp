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
      .msg.ai .lead { font-weight: 600; margin-bottom: 8px; }
      .msg.ai .sub-card { border-left: 2px solid #e5e5e5; padding-left: 8px; margin: 4px 0; }
      .msg.ai .list-item { margin: 2px 0; }
      .msg.ai .code-block {
        background: #f0f0f1; border-radius: 6px; padding: 8px 10px;
        font-family: ui-monospace, Consolas, monospace; font-size: 12px;
        white-space: pre-wrap; word-break: break-word; overflow-x: auto; margin-top: 2px;
      }
      .msg.ai .code-tag { font-size: 11px; color: #888; margin-top: 2px; }
      .msg.ai .code-hint { font-size: 12px; color: #555; margin-top: 4px; }
      .msg.ai .safety-banner {
        background: #fff4e5; border: 1px solid #f0c36d; color: #7a4a00;
        border-radius: 8px; padding: 8px 10px; font-size: 12px; margin-bottom: 8px;
      }
      .msg.ai .rel-note { font-size: 12px; color: #888; margin-top: 6px; }

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

  // ── AI 답변(JSON) 렌더링.
  //
  // 답변은 body.type에 따라 8가지로 모양이 다르다(schema.v1.json 참고). 타입마다 화면을
  // 따로 만드는 대신, 필드 이름을 한국어 라벨로 바꿔가며 일반적으로 그린다.
  const LABELS = {
    // concept_explanation / code_explanation 공용
    topic_domain: "주제 영역", analogy: "비유", explanation: "설명",
    glossary: "용어", comprehension_check: "확인 질문",
    subject_code: "분석한 코드", big_picture: "전체 그림", walkthrough: "한 줄씩 설명",
    execution_trace: "실행 흐름", concepts: "핵심 개념", predicted_output: "예상 결과",
    // prompt_help
    goal_restated: "목표 정리", principles: "핵심 원칙",
    prompt_samples: "프롬프트 예시", reusable_template: "재사용 템플릿",
    // procedure
    goal: "목표", assumptions: "전제", steps: "단계", success_check: "성공 확인",
    // code_generation
    requirement_restated: "요구사항 정리", files: "코드 파일", key_lines: "핵심 줄",
    run_steps: "실행 방법", expected_output: "예상 출력", limitations: "한계",
    // error_diagnosis
    failing_code: "문제가 된 코드", observed_error: "실제 오류", cause: "원인",
    minimal_fix: "최소 수정", verify: "확인 방법", prevention: "재발 방지",
    before: "수정 전", after: "수정 후",
    // clarification_request
    understood_so_far: "지금까지 이해한 것", blocking_reason: "막힌 이유",
    questions: "질문", copy_paste_template: "붙여넣기 틀", partial_help: "우선 도움",
    // safety_notice
    risk_type: "위험 종류", risk_explanation: "위험 설명",
    safer_alternative: "안전한 대안", still_available: "그래도 가능한 것", reason: "이유",
    // 코드/단계 조각에서 공용으로 쓰이는 키
    content: "코드", command: "명령어", action: "할 일", code: "코드",
    expected_result: "예상 결과", path: "파일 경로", purpose: "목적",
    term: "용어", plain_meaning: "의미", why_needed: "필요한 이유", answer_hint: "힌트",
    next_steps: "다음 단계",
  };
  // 화면에 굳이 안 보여줘도 되는 내부용 키(구분자, 사람이 읽을 텍스트가 아님).
  const HIDDEN_KEYS = new Set(["type", "step_type", "medium", "id", "language", "shell"]);
  const CODE_KEYS = ["content", "command", "action", "code"];
  const ORIGIN_LABEL = { user_provided: "사용자가 준 코드", assistant_authored: "AI가 새로 씀" };

  function labelFor(key) {
    return LABELS[key] || key;
  }

  function renderCodeBlock(container, obj) {
    const codeKey = CODE_KEYS.find((k) => typeof obj[k] === "string");
    const pre = document.createElement("pre");
    pre.className = "code-block";
    pre.textContent = obj[codeKey];
    container.appendChild(pre);
    if (obj.origin && ORIGIN_LABEL[obj.origin]) {
      const tag = document.createElement("div");
      tag.className = "code-tag";
      tag.textContent = ORIGIN_LABEL[obj.origin];
      container.appendChild(tag);
    }
    if (obj.expected_result) {
      const hint = document.createElement("div");
      hint.className = "code-hint";
      hint.textContent = "예상 결과: " + obj.expected_result;
      container.appendChild(hint);
    }
  }

  function isCodeLike(obj) {
    return CODE_KEYS.some((k) => typeof obj[k] === "string");
  }

  // value를 container 안에 재귀적으로 그린다. label이 있으면 소제목을 붙인다.
  function renderValue(container, label, value) {
    if (value === null || value === undefined || value === "") return;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const sec = document.createElement("div");
      sec.className = "sec";
      if (label) {
        const h = document.createElement("div");
        h.className = "sec-h";
        h.textContent = label;
        sec.appendChild(h);
      }
      const b = document.createElement("div");
      b.className = "sec-b";
      b.textContent = String(value);
      sec.appendChild(b);
      container.appendChild(sec);
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return;
      const sec = document.createElement("div");
      sec.className = "sec";
      if (label) {
        const h = document.createElement("div");
        h.className = "sec-h";
        h.textContent = label;
        sec.appendChild(h);
      }
      for (const item of value) {
        if (typeof item === "string") {
          const li = document.createElement("div");
          li.className = "sec-b list-item";
          li.textContent = "· " + item;
          sec.appendChild(li);
        } else if (item && typeof item === "object") {
          const card = document.createElement("div");
          card.className = "sub-card";
          renderObjectFields(card, item);
          sec.appendChild(card);
        }
      }
      container.appendChild(sec);
      return;
    }

    if (typeof value === "object") {
      if (isCodeLike(value)) {
        const sec = document.createElement("div");
        sec.className = "sec";
        if (label || value.title) {
          const h = document.createElement("div");
          h.className = "sec-h";
          h.textContent = value.title || label;
          sec.appendChild(h);
        }
        renderCodeBlock(sec, value);
        container.appendChild(sec);
        return;
      }
      const sec = document.createElement("div");
      sec.className = "sec";
      if (label) {
        const h = document.createElement("div");
        h.className = "sec-h";
        h.textContent = label;
        sec.appendChild(h);
      }
      renderObjectFields(sec, value);
      container.appendChild(sec);
    }
  }

  // 객체의 필드들을 라벨 없이(또는 각자 라벨을 달아) 순서대로 그린다.
  function renderObjectFields(container, obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (HIDDEN_KEYS.has(key)) continue;
      if (key === "term" && typeof obj.plain_meaning === "string") continue; // term+plain_meaning은 한 줄로
      if (key === "plain_meaning" && typeof obj.term === "string") {
        const line = document.createElement("div");
        line.className = "sec-b list-item";
        line.textContent = `· ${obj.term}: ${obj.plain_meaning}`;
        container.appendChild(line);
        continue;
      }
      renderValue(container, labelFor(key), value);
    }
  }

  function addAiAnswer(data) {
    const div = document.createElement("div");
    div.className = "msg ai";

    // 한 줄 요약은 항상 맨 위, 라벨 없이 굵게.
    if (data.one_line_answer) {
      const lead = document.createElement("div");
      lead.className = "sec-b lead";
      lead.textContent = data.one_line_answer;
      div.appendChild(lead);
    }

    // 안전 경고: standard가 아니면(caution/restricted) 눈에 띄게 보여준다.
    const safetyStatus = data.safety?.status;
    if (safetyStatus && safetyStatus !== "standard") {
      const banner = document.createElement("div");
      banner.className = "safety-banner";
      const parts = [
        data.safety.reason,
        ...(data.safety.notices || []),
        data.safety.safe_alternative ? `대안: ${data.safety.safe_alternative}` : null,
      ].filter(Boolean);
      banner.textContent = "⚠ " + parts.join(" · ");
      div.appendChild(banner);
    }

    // 본문: body.type별로 필드가 다르므로 일반 렌더러로 그린다.
    if (data.body && typeof data.body === "object") {
      renderObjectFields(div, data.body);
    }

    // 신뢰도가 stable이 아니면 짧게 안내(예전 doc_link 대신 실제 스키마 필드 사용).
    const rel = data.reliability;
    if (rel && rel.status && rel.status !== "stable") {
      const note = document.createElement("div");
      note.className = "sec-b rel-note";
      note.textContent = "ℹ " + (rel.how_to_check || rel.why_it_matters || "확인이 더 필요할 수 있습니다.");
      div.appendChild(note);
    }

    if (Array.isArray(data.next_steps) && data.next_steps.length) {
      renderValue(div, labelFor("next_steps"), data.next_steps);
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

  // ── 실제 AI 호출: background.js를 거쳐 우리 중계 서버(server/index.js)에 물어본다.
  //    API 키는 이 코드에도, background.js에도 없다 — 중계 서버에만 있다.
  //    중계 서버는 분류→생성→검증→(실패 시) 재생성 파이프라인(generate-validated.js)을 돌리고,
  //    schema.v1.json을 통과한 JSON만 돌려준다. 실패하면 이 함수가 에러를 던지고
  //    handleSend()가 안내 메시지를 보여준다.
  function sendToAI(userText) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "ask-ai", prompt: userText }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "알 수 없는 오류"));
          return;
        }
        resolve(response.data.json);
      });
    });
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
