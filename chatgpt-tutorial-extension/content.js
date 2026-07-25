// 이 확장 프로그램이 한 페이지에 두 번 실행되는 걸 막는 안전장치입니다.
if (!window.__cgptTutorialInjected) {
  window.__cgptTutorialInjected = true;

  // 같은 tick(한 번의 updateOverlay 호출) 안에서 같은 요소를 여러 번 검사하는 걸 피하기 위한 캐시입니다.
  // find/advanceWhen/waitHint가 각각 겹치는 DOM 조회를 하므로, elementFromPoint(강제 리플로우)를
  // 요소당 한 번만 하도록 결과를 재사용합니다. 매 tick 새 Map으로 교체돼 이전 것은 회수됩니다.
  let visCache = null;

  // 요소가 실제로 화면(뷰포트) 안에 보이는지 확인합니다.
  function isVisibleInViewport(el) {
    if (visCache) {
      const cached = visCache.get(el);
      if (cached !== undefined) return cached;
    }
    const result = computeVisibleInViewport(el);
    if (visCache) visCache.set(el, result);
    return result;
  }

  function computeVisibleInViewport(el) {
    const rect = el.getBoundingClientRect();
    const inViewport =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
    if (!inViewport) return false;
    // 좌표는 있지만 실제로는 안 보이는 요소(접힌 사이드바 안에 가려진 항목 등)를 걸러냅니다.
    // 요소의 중심점 위에 실제로 어떤 요소가 있는지 확인합니다.
    // 이때 우리 오버레이(말풍선)가 위를 덮고 있으면 검사를 방해하므로 잠시 무시합니다.
    tt.style.pointerEvents = "none";
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    tt.style.pointerEvents = "auto";
    if (!hit) return false;
    if (el.contains(hit) || hit.contains(el)) return true;
    // 입력창 위의 투명 장식처럼, 가까운 친척 요소가 겹쳐있는 경우는 보이는 것으로 인정합니다.
    // (3단계 위 조상까지만 확인 — 멀리 떨어진 요소가 덮은 경우는 "가려짐"으로 판정)
    let parent = el.parentElement;
    for (let i = 0; i < 3 && parent; i++, parent = parent.parentElement) {
      if (parent.contains(hit)) return true;
    }
    return false;
  }

  // 후보 선택자 목록 중, 화면에 실제로 보이는 첫 번째 요소를 찾습니다.
  // (같은 선택자에 해당하는 요소가 여러 개일 때, 숨겨진 것은 건너뜁니다)
  function queryFirstVisible(selectors) {
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (isVisibleInViewport(el)) return el;
      }
    }
    return null;
  }

  // 왼쪽 사이드바 "Recents" 아래의 첫 번째 대화 항목을 찾습니다.
  // 실제 대화 링크는 href가 "/c/..." 형태로 시작합니다 (New chat 같은 메뉴는 제외됨).
  function findFirstHistoryItem() {
    return queryFirstVisible(['a[data-sidebar-item="true"][href^="/c/"]']);
  }

  // "점 3개" 버튼이 나타날 위치(항목의 오른쪽 끝)를 가상 사각형으로 반환합니다.
  // 실제 버튼은 마우스를 올려야만 보이는 숨김 요소라, 직접 찾으면 크기가 0이라
  // 위치 계산이 불가능합니다. 그래서 항목 자체의 오른쪽 끝 좌표를 대신 씁니다.
  function findHistoryItemOptionsButton() {
    const item = findFirstHistoryItem();
    if (!item) return null;
    const rect = item.getBoundingClientRect();
    // 높이가 지나치게 작은(4px 이하) 항목은 비정상이므로 대상으로 쓰지 않습니다.
    if (rect.width === 0 || rect.height <= 4) return null;
    const size = Math.min(rect.height - 4, 28);
    const virtualRect = {
      top: rect.top + (rect.height - size) / 2,
      left: rect.right - size - 6,
      right: rect.right - 6,
      bottom: rect.top + (rect.height + size) / 2,
      width: size,
      height: size
    };
    return { getBoundingClientRect: () => virtualRect };
  }

  // 점 3개 버튼 위치와 가장 가까운 팝업 메뉴를 찾습니다.
  // (계정 메뉴 등 다른 [role="menu"]가 열려 있어도 엉뚱한 메뉴를 가리키지 않도록)
  function findHistoryOptionsMenu() {
    const anchor = findHistoryItemOptionsButton();
    if (!anchor) return null;

    const anchorRect = anchor.getBoundingClientRect();
    const anchorX = anchorRect.left + anchorRect.width / 2;
    const anchorY = anchorRect.top + anchorRect.height / 2;

    let closestMenu = null;
    let closestGap = Infinity;

    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (!isVisibleInViewport(menu)) continue;

      // 메뉴 상자와 점 3개 버튼 사이의 실제 간격을 계산합니다.
      // 충분히 가까운(48px 이내) 메뉴만 인정 — 멀리 있는 다른 메뉴(계정 메뉴 등)를 배제합니다.
      const rect = menu.getBoundingClientRect();
      const dx = Math.max(rect.left - anchorX, 0, anchorX - rect.right);
      const dy = Math.max(rect.top - anchorY, 0, anchorY - rect.bottom);
      const gap = Math.hypot(dx, dy);

      if (gap <= 48 && gap < closestGap) {
        closestGap = gap;
        closestMenu = menu;
      }
    }

    return closestMenu;
  }

  // 검색창 바로 오른쪽에 붙어 있는 버튼(New 등)을 찾습니다.
  // 버튼이 글자(New)로만 구분되어 안정적인 선택자가 없어서, 위치 관계로 찾습니다.
  function findButtonRightOfSearch() {
    const input = queryFirstVisible(['input[placeholder*="Search" i]']);
    if (!input) return null;
    const inRect = input.getBoundingClientRect();
    let scope = input.parentElement;
    for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
      for (const btn of scope.querySelectorAll("button")) {
        if (!isVisibleInViewport(btn)) continue;
        const r = btn.getBoundingClientRect();
        const sameRow = Math.abs((r.top + r.height / 2) - (inRect.top + inRect.height / 2)) < inRect.height;
        if (r.left >= inRect.right - 4 && sameRow) return btn;
      }
    }
    return null;
  }

  // 왼쪽 아래 계정(프로필) 버튼을 찾습니다.
  function findAccountButton() {
    return queryFirstVisible([
      '[data-testid="accounts-profile-button"]',
      'button[aria-label*="profile" i]',
      'button[aria-label*="account" i]'
    ]);
  }

  // 계정 메뉴 안의 "Settings" 항목을 찾습니다. (메뉴가 닫혀 있으면 null)
  function findSettingsMenuItem() {
    const menu = queryFirstVisible(['[role="menu"]']);
    if (!menu) return null;
    for (const item of menu.querySelectorAll('[role="menuitem"]')) {
      if (/settings/i.test(item.textContent)) return item;
    }
    // Settings 항목을 못 찾으면 메뉴 자체를 반환합니다.
    return menu;
  }

  // 프롬프트 입력창 옆의 + 버튼을 찾습니다.
  function findComposerPlusButton() {
    return queryFirstVisible([
      '[data-testid="composer-plus-btn"]',
      'button[aria-label*="Add" i]',
      'form button[aria-haspopup]'
    ]);
  }

  // 사이드바 링크 finder들. 같은 선택자를 여러 단계의 find와 waitHint에서 공유합니다.
  function findNewChatLink() {
    return queryFirstVisible(['a[data-sidebar-item="true"][href="/"]', 'a[href="/"]']);
  }
  function findImagesLink() {
    return queryFirstVisible(['a[href^="/images"]']);
  }
  function findLibraryLink() {
    return queryFirstVisible(['a[href^="/library"]']);
  }
  function findProjectsLink() {
    return queryFirstVisible(['a[href^="/projects"]', '[data-testid="sidebar-item-projects"]']);
  }
  function findPluginsLink() {
    return queryFirstVisible(['a[href^="/plugins"]', 'a[href^="/apps"]', '[data-testid="sidebar-item-plugins"]']);
  }

  // 해당 페이지에 있을 때만, 검색창 옆 New 버튼(없으면 검색창)을 가리킵니다.
  function findNewButtonOnPage(prefix) {
    if (!location.pathname.startsWith(prefix)) return null;
    return findButtonRightOfSearch() || queryFirstVisible(['input[placeholder*="Search" i]']);
  }

  // 설정 섹션에서 창이 닫혔을 때 다시 여는 길(메뉴의 Settings 항목 → 없으면 계정 버튼)을 가리킵니다.
  function settingsReentryHint() {
    return findSettingsMenuItem() || findAccountButton();
  }

  // 튜토리얼을 3개 섹션으로 나눕니다. 시작할 때 원하는 섹션을 골라 진행합니다.
  // 각 단계 — find: 가리킬 요소를 찾는 함수 / text: 설명 문구
  const SECTIONS = [
    { title: "Basics — chat, history, new chat", steps: [
    {
      // 시작 화면이 아니면 먼저 New chat으로 돌아가게 안내합니다. (이미 시작 화면이면 자동으로 건너뜀)
      find: findNewChatLink,
      text: "First, click New chat to go to the start screen.",
      advanceWhen: () => location.pathname === "/"
    },
    {
      // 입력창과 전송을 한 단계로 안내합니다.
      // (전송 버튼은 글을 입력해야 나타나므로, 단계를 나누면 입력 없이 Next를 눌렀을 때 막힙니다)
      // Images 페이지의 이미지 입력창도 모양이 같아서, 시작 화면/채팅 화면에서만 찾습니다.
      find: () => {
        if (location.pathname !== "/" && !location.pathname.startsWith("/c/")) return null;
        return queryFirstVisible(['#prompt-textarea', 'div[contenteditable="true"]']);
      },
      text: "Type what you want help with in your own words. When you're ready, select the arrow to send it.",
      // 시작 화면이 아니라 입력창이 없으면, New chat 옆에 점 배지를 띄우고 기다립니다.
      waitWhenMissing: true,
      waitHint: findNewChatLink,
      noBack: true
    },
    {
      find: findComposerPlusButton,
      text: "Use + to attach a photo or file and open the tools available to you. Try clicking it.",
      // + 버튼이 나타날 때까지 숨어서 기다립니다.
      waitWhenMissing: true,
      // 사용자가 + 버튼을 실제로 클릭하는 순간 다음 단계로 넘어갑니다.
      advanceOnClick: true
    },
    {
      find: findFirstHistoryItem,
      text: "Your previous chats appear here. Select one to continue where you left off."
    },
    {
      find: findHistoryItemOptionsButton,
      text: "Hover over a chat and select the three dots to rename, archive, or manage it.",
      // 점 3개를 눌러 메뉴가 실제로 열리면(우리 오버레이가 메뉴를 감지하면) 자동으로 다음 단계로 넘어갑니다.
      advanceWhen: () => !!findHistoryOptionsMenu()
    },
    {
      find: findHistoryOptionsMenu,
      text: "From here, you can pin a chat or rename its title.",
      // 메뉴가 아직 안 열려 있으면 중앙에 뜨지 않고, 숨은 채로 메뉴가 열리기를 기다립니다.
      waitWhenMissing: true,
      // 기다리는 동안 점 3개 위치에 점 배지를 표시합니다.
      waitHint: findHistoryItemOptionsButton,
      // 직전 단계는 "메뉴가 열리면 자동 진행" 조건이 이미 충족된 상태라 Back을 잠급니다.
      noBack: true,
      // 메뉴가 열려 있다가 닫히면(아무 곳이나 클릭 등) 자동으로 다음 단계로 넘어갑니다.
      // ChatGPT 메뉴가 열려 있는 동안은 바깥 클릭을 메뉴 닫기에 먼저 써버려서,
      // Next 버튼 첫 클릭이 전달되지 않는 문제를 이렇게 해결합니다.
      advanceWhen: () => {
        const open = !!findHistoryOptionsMenu();
        if (open) menuWasOpenInStep = true;
        return menuWasOpenInStep && !open;
      }
    },
    {
      find: findNewChatLink,
      text: "Start a new chat when you want to switch to a different topic."
    }
    ] },
    { title: "Explore — Images, Library, Projects", steps: [
    {
      // 사이드바 Images 클릭 → 페이지 주소가 /images가 되면 자동 진행
      find: findImagesLink,
      text: "Click Images in the sidebar to open it.",
      advanceWhen: () => location.pathname.startsWith("/images"),
      // Next를 누르면 페이지 안 설명(다음 단계)을 건너뛰고 그다음 항목으로 갑니다.
      nextJump: 2
    },
    {
      // Images 페이지의 이미지 설명 입력창 (Images 페이지에서만 찾음)
      find: () => {
        if (!location.pathname.startsWith("/images")) return null;
        return queryFirstVisible([
          'input[placeholder*="Describe" i]',
          'textarea[placeholder*="Describe" i]',
          '[data-placeholder*="Describe" i]',
          'div[contenteditable="true"]',
          'main textarea',
          'main input[type="text"]',
          'main input:not([type])'
        ]);
      },
      text: "Describe the image you want to create. You can include the subject, style, colors, and size.",
      waitWhenMissing: true,
      // 기다리는 동안 사이드바 Images 옆에 점 배지를 표시합니다.
      waitHint: findImagesLink,
      noBack: true
    },
    {
      find: findLibraryLink,
      text: "Next, click Library in the sidebar.",
      advanceWhen: () => location.pathname.startsWith("/library"),
      nextJump: 2,
      // Back은 숨어 있는 Images 설명 단계를 건너뛰고 이전 안내 단계로 갑니다.
      backJump: 2
    },
    {
      // Library 페이지의 New 버튼 (못 찾으면 검색창으로 대체)
      find: () => findNewButtonOnPage("/library"),
      text: "Files you upload or create are saved here. Click New to add files, or use Search to find them.",
      waitWhenMissing: true,
      waitHint: findLibraryLink,
      noBack: true
    },
    {
      find: findProjectsLink,
      text: "Next, click Projects in the sidebar.",
      advanceWhen: () => location.pathname.startsWith("/projects"),
      nextJump: 2,
      backJump: 2
    },
    {
      // Projects 페이지의 New 버튼 (못 찾으면 검색창으로 대체)
      find: () => findNewButtonOnPage("/projects"),
      text: "Click New to create a project that keeps chats, files, and instructions for one goal together.",
      waitWhenMissing: true,
      waitHint: findProjectsLink,
      noBack: true
    },
    {
      find: findPluginsLink,
      text: "Optional: click Plugins in the sidebar.",
      advanceWhen: () => location.pathname.startsWith("/plugins") || location.pathname.startsWith("/apps"),
      nextJump: 2,
      backJump: 2
    },
    {
      // Plugins 페이지의 검색창 (Plugins 페이지에서만 찾음)
      find: () => {
        if (!location.pathname.startsWith("/plugins") && !location.pathname.startsWith("/apps")) return null;
        return queryFirstVisible(['input[placeholder*="Search" i]']);
      },
      text: "Search for tools you want to add. Review what a plugin can access before connecting it.",
      waitWhenMissing: true,
      waitHint: findPluginsLink,
      noBack: true
    },
    {
      find: () => queryFirstVisible(['a[href^="/codex"]', '[data-testid="sidebar-item-codex"]']),
      text: "Optional: Codex is for coding work such as writing and fixing code. You can skip it if you don't code.",
      backJump: 2
    }
    ] },
    { title: "Settings & privacy", steps: [
    {
      // 왼쪽 아래 계정(Upgrade) 영역
      find: findAccountButton,
      text: "Click your account area at the bottom left. The menu has Settings, Help, plan details, and sign-out.",
      // 직전 단계에서 열려있던 팝업이 먼저 닫힌 뒤, 새로 메뉴가 열리면 다음으로 넘어갑니다.
      advanceWhen: () => {
        const open = !!queryFirstVisible(['[role="menu"]']);
        if (!open) menuWasClosedInStep = true;
        return menuWasClosedInStep && open;
      }
    },
    {
      // 계정 메뉴에서 Settings 클릭 안내
      find: () => queryFirstVisible(['[role="menu"]']),
      text: "Select \"Settings\" to manage how ChatGPT looks, behaves, and protects your account.",
      waitWhenMissing: true,
      // 메뉴가 아직 안 열려 있으면 계정 버튼 옆에 점 배지를 표시합니다.
      waitHint: findAccountButton,
      // 설정 창(dialog)이 열리면 자동으로 다음 단계로 넘어갑니다.
      advanceWhen: () => !!queryFirstVisible(['[role="dialog"]'])
    },
    {
      // Personalization 설명
      find: () => queryFirstVisible([
        '[role="dialog"] [data-testid*="personalization" i]',
        '[role="dialog"] button[aria-label*="Personalization" i]'
      ]),
      text: "Use Personalization to adjust how ChatGPT responds and what it remembers about you.",
      // 설정 창이 아직 안 열려 있으면 중앙에 뜨지 않고, 열릴 때까지 숨어서 기다립니다.
      waitWhenMissing: true,
      // 설정 창이 닫혀 있으면: 계정 메뉴가 열려 있으면 Settings 항목 옆에(클릭 유도),
      // 아니면 계정 버튼 옆에 점 배지를 표시해 다시 여는 길을 안내합니다.
      waitHint: settingsReentryHint,
      // 직전 단계는 "설정 창이 열리면 자동 진행" 조건이 이미 충족된 상태라,
      // Back으로 돌아가도 즉시 다시 이 단계로 튕겨 돌아옵니다. 그래서 Back을 잠급니다.
      noBack: true
    },
    {
      // Data controls 설명
      find: () => queryFirstVisible([
        '[role="dialog"] [data-testid*="data-control" i]',
        '[role="dialog"] button[aria-label*="Data controls" i]'
      ]),
      text: "Use Data controls to choose how your conversations are used, export your data, or delete your account.",
      waitWhenMissing: true,
      waitHint: settingsReentryHint
    }
    ] }
  ];

  // 현재 진행 중인 섹션과 그 단계 목록입니다. (섹션을 고르면 채워집니다)
  let currentSectionIndex = -1;
  let STEPS = [];
  const sectionDone = [false, false, false];
  // 화면 상태: "menu"(섹션 선택) / "steps"(단계 진행 중) / "done"(완료 화면)
  let mode = "menu";

  let currentStepIndex = 0;
  let timerId = null;
  // 현재 단계에서 메뉴가 한 번이라도 열렸는지/닫혔는지 기억합니다. (단계가 바뀌면 초기화)
  let menuWasOpenInStep = false;
  let menuWasClosedInStep = false;

  // ChatGPT 페이지 스타일과 우리 UI 스타일이 서로 섞이지 않도록,
  // 별도의 격리된 공간(Shadow DOM)을 만들어서 그 안에만 그림을 그립니다.
  const host = document.createElement("div");
  host.style.cssText = "position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      .hl {
        position: fixed;
        border: 3px solid #10a37f;
        border-radius: 10px;
        pointer-events: none;
      }
      .tt {
        position: fixed;
        box-sizing: border-box;
        width: min(260px, calc(100vw - 16px));
        background: #202123;
        color: #fff;
        padding: 14px 16px;
        border-radius: 10px;
        font-family: -apple-system, "Segoe UI", sans-serif;
        font-size: 14px;
        line-height: 1.5;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        pointer-events: auto;
      }
      .arrow {
        position: absolute;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
      }
      .arrow.up { border-bottom: 8px solid #202123; top: -8px; }
      .arrow.down { border-top: 8px solid #202123; bottom: -8px; }
      .indicator { font-size: 11px; opacity: 0.6; margin-bottom: 6px; }
      .text { margin-bottom: 12px; }
      .controls { display: flex; justify-content: flex-end; gap: 8px; }
      .btn {
        background: #10a37f;
        color: #fff;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      .btn:hover { background: #0d8c6d; }
      .btn.secondary { background: transparent; color: #ccc; border: 1px solid #555; }
      .btn:disabled { opacity: 0.4; cursor: default; }
      .close {
        position: absolute;
        top: 6px;
        right: 8px;
        background: none;
        border: none;
        color: #888;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 6px;
      }
      .close:hover { color: #fff; }
      .sections {
        display: none;
        flex-direction: column;
        gap: 8px;
      }
      .section-btn {
        background: #343541;
        color: #fff;
        border: 1px solid #555;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        text-align: left;
        cursor: pointer;
      }
      .section-btn:hover { border-color: #10a37f; }
      .hint {
        position: fixed;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #10a37f;
        box-shadow: 0 0 0 0 rgba(16, 163, 127, 0.6);
        animation: pulse 1.5s infinite;
        display: none;
        pointer-events: none;
      }
      @keyframes pulse {
        to { box-shadow: 0 0 0 10px rgba(16, 163, 127, 0); }
      }
    </style>
    <div class="hl" id="hl"></div>
    <div class="hint" id="hint"></div>
    <div class="tt" id="tt">
      <div class="arrow" id="arrow"></div>
      <button class="close" id="close" title="Skip tour">&times;</button>
      <div class="indicator" id="indicator"></div>
      <div class="text" id="text"></div>
      <div class="sections" id="sections">
        <button class="section-btn" data-section="0"></button>
        <button class="section-btn" data-section="1"></button>
        <button class="section-btn" data-section="2"></button>
      </div>
      <div class="controls" id="controls">
        <button class="btn secondary" id="prev">Back</button>
        <button class="btn" id="next">Next</button>
      </div>
    </div>
  `;

  const hl = shadow.getElementById("hl");
  const hint = shadow.getElementById("hint");
  const tt = shadow.getElementById("tt");
  const arrow = shadow.getElementById("arrow");
  const indicatorEl = shadow.getElementById("indicator");
  const textEl = shadow.getElementById("text");
  const prevBtn = shadow.getElementById("prev");
  const nextBtn = shadow.getElementById("next");
  const closeBtn = shadow.getElementById("close");
  const sectionsEl = shadow.getElementById("sections");
  const controlsEl = shadow.getElementById("controls");
  const sectionBtns = Array.from(sectionsEl.querySelectorAll(".section-btn"));

  // 저장된 완료 여부를 확인하는 동안 빈 말풍선이 잠깐 보이지 않도록 숨겨둡니다.
  tt.style.display = "none";
  hl.style.display = "none";

  // 대상을 못 찾았을 때, 설명창을 화면 중앙에 띄웁니다. (화살표/테두리는 숨김)
  // 대상이 없어도 Next/Back 버튼이 사라지지 않아 진행이 막히지 않습니다.
  function positionFallback() {
    tt.style.top = "50%";
    tt.style.left = "50%";
    tt.style.transform = "translate(-50%, -50%)";
    arrow.style.display = "none";
  }

  // 대상 버튼의 화면 좌표를 기준으로 화살표 + 설명 박스 위치를 다시 계산합니다.
  function positionOverlay(rect) {
    tt.style.transform = "";
    arrow.style.display = "block";

    const pad = 4;
    hl.style.top = rect.top - pad + "px";
    hl.style.left = rect.left - pad + "px";
    hl.style.width = rect.width + pad * 2 + "px";
    hl.style.height = rect.height + pad * 2 + "px";

    const ttRect = tt.getBoundingClientRect();
    const ttW = ttRect.width || 260;
    const ttH = ttRect.height || 100;
    const margin = 12;

    let top, placeBelow;
    if (rect.bottom + margin + ttH <= window.innerHeight) {
      top = rect.bottom + margin;
      placeBelow = true;
    } else if (rect.top - margin - ttH >= 0) {
      top = rect.top - margin - ttH;
      placeBelow = false;
    } else {
      top = Math.min(Math.max(rect.bottom + margin, 8), window.innerHeight - ttH - 8);
      placeBelow = true;
    }

    const maxLeft = Math.max(8, window.innerWidth - ttW - 8);
    let left = rect.left + rect.width / 2 - ttW / 2;
    left = Math.min(Math.max(left, 8), maxLeft);

    tt.style.top = top + "px";
    tt.style.left = left + "px";

    const targetCenterX = rect.left + rect.width / 2;
    let arrowLeft = targetCenterX - left - 8;
    arrowLeft = Math.min(Math.max(arrowLeft, 12), ttW - 28);
    arrow.style.left = arrowLeft + "px";
    arrow.className = "arrow " + (placeBelow ? "up" : "down");
  }

  // [확인 버튼 없이] 현재 단계 내용을 화면 문구에 반영합니다.
  function renderStep() {
    menuWasOpenInStep = false;
    menuWasClosedInStep = false;
    const step = STEPS[currentStepIndex];
    textEl.textContent = step.text;
    indicatorEl.textContent = `${currentStepIndex + 1} / ${STEPS.length}`;
    prevBtn.disabled = currentStepIndex === 0 || !!step.noBack;
    nextBtn.textContent = currentStepIndex === STEPS.length - 1 ? "Done" : "Next";
  }

  let finished = false;

  function finishTutorial() {
    finished = true;
    clearTimeout(timerId);
    // 지우는 대신 숨겨둡니다. (확장 아이콘 클릭으로 다시 열 수 있도록)
    host.style.display = "none";
    // 다음 방문부터는 자동으로 뜨지 않도록 완료 여부를 저장합니다.
    chrome.storage.local.set({ tutorialDone: true });
  }

  // 섹션 선택 화면을 중앙에 보여줍니다. (완료한 섹션에는 ✓ 표시)
  function showMenu(message) {
    mode = "menu";
    hl.style.display = "none";
    hint.style.display = "none";
    tt.style.display = "block";
    indicatorEl.textContent = "ChatGPT Tour";
    textEl.textContent = message || "Choose what you'd like to learn. You can take the tour one part at a time.";
    controlsEl.style.display = "none";
    sectionsEl.style.display = "flex";
    for (let i = 0; i < sectionBtns.length; i++) {
      sectionBtns[i].textContent = (sectionDone[i] ? "✓ " : "") + SECTIONS[i].title;
    }
    positionFallback();
  }

  // 선택한 섹션의 첫 단계부터 진행을 시작합니다.
  function startSection(i) {
    mode = "steps";
    currentSectionIndex = i;
    STEPS = SECTIONS[i].steps;
    currentStepIndex = 0;
    sectionsEl.style.display = "none";
    controlsEl.style.display = "flex";
    prevBtn.style.display = "";
    renderStep();
    updateOverlay();
  }

  // 섹션 하나를 끝냈을 때: 전부 끝났으면 완료 화면, 아니면 선택 화면으로 돌아갑니다.
  function completeSection() {
    sectionDone[currentSectionIndex] = true;
    if (sectionDone.every(Boolean)) {
      showCompletion();
    } else {
      showMenu("Nice work! Pick another part whenever you're ready.");
    }
  }

  // 갑자기 사라지는 대신, 짧은 완료 화면을 중앙에 보여줍니다.
  function showCompletion() {
    mode = "done";
    hl.style.display = "none";
    hint.style.display = "none";
    tt.style.display = "block";
    sectionsEl.style.display = "none";
    controlsEl.style.display = "flex";
    indicatorEl.textContent = "";
    textEl.textContent = "That's the end of the tour. You're ready to use ChatGPT — enjoy!";
    prevBtn.style.display = "none";
    nextBtn.textContent = "Finish";
    positionFallback();
  }

  for (const btn of sectionBtns) {
    btn.addEventListener("click", () => startSection(Number(btn.dataset.section)));
  }

  // 지정한 칸 수만큼 단계를 이동합니다. 끝을 넘어가면 섹션을 완료 처리합니다.
  // 이동했으면 true, 완료됐으면 false를 반환합니다. (Next/Back/자동진행/클릭 감지가 공유)
  function goToStep(by) {
    if (currentStepIndex + by <= STEPS.length - 1) {
      currentStepIndex += by;
      renderStep();
      return true;
    }
    completeSection();
    return false;
  }

  nextBtn.addEventListener("click", () => {
    if (mode === "done") {
      finishTutorial();
      return;
    }
    // nextJump가 있는 단계(사이드바 클릭 안내)는 Next가 "이 페이지 건너뛰기"로 동작합니다.
    if (goToStep(STEPS[currentStepIndex].nextJump || 1)) {
      updateOverlay(); // 다음 tick(최대 0.1초)을 기다리지 않고 즉시 새 위치로 이동
    }
  });

  // × 버튼: 언제든 가이드를 건너뛰고 종료합니다.
  closeBtn.addEventListener("click", finishTutorial);

  prevBtn.addEventListener("click", () => {
    // backJump가 있는 단계는 Back이 숨어 있는 설명 단계를 건너뛰고 이전 안내 단계로 갑니다.
    const jump = STEPS[currentStepIndex].backJump || 1;
    if (currentStepIndex - jump >= 0) {
      currentStepIndex -= jump;
      renderStep();
      updateOverlay();
    }
  });

  // 현재 단계에서 한 칸 앞으로 진행합니다. (클릭 감지·자동 진행이 공유하는 헬퍼)
  function advanceOne() {
    goToStep(1);
  }

  // 우리 말풍선을 클릭했을 때 그 클릭이 ChatGPT 페이지에도 전달되면,
  // 열려있는 메뉴/설정 창이 "바깥 클릭"으로 오해하고 닫혀버립니다. 그래서 전달을 차단합니다.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "touchstart"]) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  // 사용자가 대상(예: + 버튼)을 실제로 클릭하는 순간을 감지해 다음 단계로 넘어갑니다.
  // (클릭으로 열리는 팝업의 모양이 제각각이라, 팝업 감지 대신 클릭 자체를 감지합니다)
  document.addEventListener("pointerdown", (e) => {
    if (finished || mode !== "steps") return;
    const step = STEPS[currentStepIndex];
    if (!step.advanceOnClick) return;
    const target = step.find();
    if (!target) return;
    const r = target.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      advanceOne();
    }
  }, true);

  // 현재 단계의 대상을 찾아 오버레이 위치를 갱신합니다. (자동 진행 조건도 여기서 확인)
  function updateOverlay() {
    // 섹션 선택 화면이나 완료 화면에서는 위치 갱신이 필요 없습니다.
    if (mode !== "steps") return;
    // 이 tick 동안의 가시성 검사 결과를 캐시할 새 Map을 준비합니다. (이전 tick 것은 회수됨)
    visCache = new Map();
    let step = STEPS[currentStepIndex];
    // 이 단계에 자동 진행 조건이 있고 그 조건이 충족되면(예: 메뉴가 열림), 다음 단계로 넘어갑니다.
    // 마지막 단계라면 튜토리얼을 종료합니다.
    if (step.advanceWhen && step.advanceWhen()) {
      if (goToStep(1)) step = STEPS[currentStepIndex];
      else return;
    }
    const target = step.find();
    if (target) {
      hint.style.display = "none";
      tt.style.display = "block";
      hl.style.display = "block";
      positionOverlay(target.getBoundingClientRect());
    } else if (step.waitWhenMissing) {
      // 대상이 나타날 때까지 설명창을 숨기고 기다립니다. (예: 메뉴가 열릴 때까지)
      tt.style.display = "none";
      hl.style.display = "none";
      // 기다리는 동안, 어디로 가야 계속되는지 알려주는 작은 점 배지를 표시합니다.
      const hintTarget = step.waitHint ? step.waitHint() : null;
      if (hintTarget) {
        const r = hintTarget.getBoundingClientRect();
        hint.style.display = "block";
        hint.style.top = r.top + r.height / 2 - 5 + "px";
        hint.style.left = r.right + 6 + "px";
      } else {
        hint.style.display = "none";
      }
    } else {
      hint.style.display = "none";
      // 설명창(문구 + Next/Back 버튼)은 유지하고 중앙에 띄웁니다.
      tt.style.display = "block";
      hl.style.display = "none";
      positionFallback();
    }
  }

  // 0.1초마다 오버레이를 갱신합니다. 튜토리얼이 끝나면 반복을 멈춥니다.
  function tick() {
    if (finished) return;
    updateOverlay();
    timerId = setTimeout(tick, 100);
  }

  // 확장 아이콘을 클릭하면 가이드를 다시 엽니다. (background.js가 신호를 보냄)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "restart-tutorial") {
      finished = false;
      clearTimeout(timerId); // 이미 돌고 있던 갱신 루프가 있으면 멈추고 새로 시작 (중복 방지)
      host.style.display = "";
      showMenu();
      tick();
    }
  });

  // 처음 방문일 때만 자동으로 가이드를 띄웁니다.
  // (완료했거나 ×로 건너뛴 적이 있으면, 확장 아이콘을 눌러야 다시 열립니다)
  chrome.storage.local.get("tutorialDone", (res) => {
    if (res && res.tutorialDone) {
      finished = true;
      host.style.display = "none";
    } else {
      showMenu();
      tick();
    }
  });
}
