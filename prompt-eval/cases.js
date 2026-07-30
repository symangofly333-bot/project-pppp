"use strict";
// PROMPTS.md 4절의 "상황"에 실제로 보낼 문장을 붙인 것.
//
// ⚠️ 이 문장들은 초안이다. 상황(what)은 PROMPTS.md에서 확정된 것이지만,
//    문장(how)은 여기서 처음 쓴 것이라 마음에 안 들면 갈아끼우면 된다.
//    번호는 PROMPTS.md 4절 표와 일치시켰다.
//
// 답변 언어가 영어로 확정돼 있어서(PROJECT.md 4절) 시험 문장도 영어로 쓴다.
// 한국어로 물으면 프롬프트의 LANGUAGE 규칙 때문에 한국어로 답해서 딴 걸 시험하게 된다.

const CASES = [
  {
    id: 1,
    target: "learning",
    situation: "한 줄짜리 단순 질문",
    pass: "답도 짧다",
    message: "Is ChatGPT free?",
  },
  {
    id: 2,
    target: "learning",
    situation: "한 번에 여러 개 물어봄",
    pass: "전부 답하고, 안 물어본 걸 덧붙이지 않는다",
    message: "Is ChatGPT free, can I use it on my phone, and does it save my old chats?",
  },
  {
    id: 3,
    target: "learning",
    situation: "복잡한 개념 질문",
    pass: "이해에 필요한 만큼 길어진다",
    message: "Why does ChatGPT sometimes say things that are completely wrong, but say them so confidently?",
  },
  {
    id: 4,
    target: "learning",
    situation: "헷갈린다고 표현함",
    pass: "다독이는 문장이 1개 이하. 그 다음 바로 답",
    message:
      "I'm so confused. There's ChatGPT, ChatGPT Plus, GPT-4, the API, and I saw something " +
      "called a GPT too. I have no idea which one I'm supposed to be using.",
  },
  {
    id: 5,
    target: "learning",
    situation: "헷갈린다는 표현 없음",
    pass: "공감 문구 없이 바로 답한다",
    message: "How do I start a new chat?",
  },
  {
    id: 6,
    target: "learning",
    situation: "비유가 나올 만한 질문",
    pass: "비유를 쓴다면 4단계(비유·대응·한계·복귀)를 다 지킨다. 안 써도 됨",
    message: "What does it actually mean when people say an AI was 'trained'?",
  },
  {
    id: "7a",
    target: "learning",
    situation: "창작 질문",
    pass: "경고·면책 문구가 붙지 않는다",
    message: "Give me some fun name ideas for an orange cat.",
  },
  {
    id: "7b",
    target: "learning",
    situation: "사실 + 시점 의존 질문",
    pass: "모르면 모른다고 한다. 가격·기능을 지어내지 않는다",
    message: "How much does ChatGPT Plus cost right now, and what do I get for it?",
  },
  {
    id: "7c",
    target: "learning",
    situation: "고위험 질문 (돈·세금)",
    pass: "주의가 본문 안에 있다. 끝에 붙이는 일반 면책이 아니다",
    message:
      "ChatGPT told me I can deduct my home office and gave me the exact amount. " +
      "Can I just put that number on my tax return?",
  },
  {
    id: 13,
    target: "learning",
    situation: "단순 질문 — 서식 확인",
    pass: "헤더·표가 붙지 않는다",
    message: "What's the pencil icon next to my chat name for?",
  },
  {
    id: "14a",
    target: "learning",
    situation: "\"저 다 했어요\"라고만 말함",
    pass: "보여달라고 하거나 뭐가 필요한지 말한다. 말만 듣고 인정하지 않는다",
    message: "Okay I finished it!",
  },
  {
    id: 15,
    target: "learning",
    situation: "사용자가 미션 얘기를 꺼냄",
    pass: "진행도를 아는 척하지 않는다. 그렇다고 쌀쌀맞게 굴지도 않는다",
    message: "I'm on the mission where you practice asking follow-up questions. Am I on track?",
  },

  {
    id: 9,
    target: "coding",
    situation: "라이브러리/빌드 파일을 붙여넣음",
    pass: "설명보다 먼저 \"이건 고칠 파일이 아니다\"를 말한다",
    message:
      "Can you explain what this does? I found it in my project folder.\n\n" +
      "```\n" +
      "/*! jQuery v3.6.0 | (c) OpenJS Foundation | jquery.org/license */\n" +
      "!function(e,t){\"use strict\";\"object\"==typeof module&&\"object\"==typeof module.exports?" +
      "module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error(" +
      "\"jQuery requires a window\");return t(e)}:t(e)}(\"undefined\"!=typeof window?window:this," +
      "function(g,e){\"use strict\";var t=[],r=Object.getPrototypeOf,s=t.slice\n" +
      "```",
  },
  {
    id: 10,
    target: "coding",
    situation: "에러 메시지만 있고 코드는 없음",
    pass: "수정 코드를 확정하지 않고, 무엇이 더 필요한지 말한다",
    message: "I'm getting this: Uncaught ReferenceError: sayHello is not defined",
  },
  {
    id: 11,
    target: "coding",
    situation: "\"그냥 고쳐줘\"",
    pass: "먼저 고치고, 바로 뒤에 <details> 접힌 블록으로 뭐가 바뀌었는지 설명한다. 선택지를 안 낸다",
    message:
      "Just fix this for me, the button does nothing when I click it.\n\n" +
      "```html\n" +
      "<button id=\"closeBtn\">Close</button>\n" +
      "<script>\n" +
      "  document.getElementById(\"close-btn\").addEventListener(\"click\", function () {\n" +
      "    document.getElementById(\"box\").style.display = \"none\";\n" +
      "  });\n" +
      "</script>\n" +
      "```",
  },
  {
    id: "14b",
    target: "coding",
    situation: "\"저 다 했어요\"라고만 말함",
    pass: "보여달라고 하거나 뭐가 필요한지 말한다",
    message: "The popup is done, I finished it.",
  },
];

// 여러 턴이 있어야만 성립해서 지금은 못 돌리는 항목.
// 지우지 않고 남겨둔다 — 배관을 고치면 바로 켤 수 있어야 한다.
const BLOCKED = [
  {
    id: 12,
    target: "coding",
    situation: "선택지에서 1번(바로 고치기) 선택",
    why: "앞 턴이 전달되지 않아 \"1\"이 뭘 가리키는지 모델이 알 수 없다. PROMPTS.md 0-1절 참고",
  },
  {
    id: 8,
    target: "both",
    situation: "메타 교육 문구가 매번 나오지는 않는가",
    why: "정규식으로 못 센다. 이번 실행의 답변 전체를 사람이 훑어서 빈도를 본다. " +
      "그리고 프롬프트의 \"최근에 했으면 생략\"은 대화 기록이 없으면 채점 자체가 불가능하다",
  },
];

module.exports = { CASES, BLOCKED };
