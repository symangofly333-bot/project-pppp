"use strict";
// PROMPTS.md에서 시스템 프롬프트 두 벌을 뽑아낸다.
//
// 왜 복사본을 안 만드는가: 프롬프트를 별도 .txt로 복사해두면 PROMPTS.md를 고쳤을 때
// 시험은 옛날 것으로 계속 돌아간다. 그 어긋남은 눈에 안 보여서 제일 위험하다.
// PROMPTS.md 하나만 진실로 둔다.

const fs = require("node:fs");
const path = require("node:path");

const PROMPTS_MD = path.join(__dirname, "..", "PROMPTS.md");

// "## 1. 배우기용 AI" 다음에 오는 첫 번째 ```text 블록을 가져온다.
function extractBlock(markdown, headingText) {
  const headingIndex = markdown.indexOf(headingText);
  if (headingIndex === -1) {
    throw new Error(`PROMPTS.md에서 "${headingText}" 섹션을 못 찾았다.`);
  }
  const fenceStart = markdown.indexOf("```text", headingIndex);
  if (fenceStart === -1) {
    throw new Error(`"${headingText}" 뒤에 \`\`\`text 블록이 없다.`);
  }
  const bodyStart = markdown.indexOf("\n", fenceStart) + 1;
  const fenceEnd = markdown.indexOf("```", bodyStart);
  if (fenceEnd === -1) {
    throw new Error(`"${headingText}"의 \`\`\`text 블록이 안 닫혔다.`);
  }
  return markdown.slice(bodyStart, fenceEnd).trim();
}

// {{GUIDE_OUTLINE}} / {{CURRICULUM_OUTLINE}}은 아직 채울 내용이 없다.
// PROMPTS.md 3절의 지시대로 헤더째 들어낸다 — 빈 헤더만 남기면
// "COPEN에 대해 아는 게 있다"는 신호만 주고 내용은 없는 상태가 된다.
function dropEmptyKnowledgeSection(prompt) {
  const start = prompt.indexOf("## WHAT YOU KNOW ABOUT COPEN");
  if (start === -1) return prompt;
  const next = prompt.indexOf("\n## ", start + 1);
  const cleaned = next === -1 ? prompt.slice(0, start) : prompt.slice(0, start) + prompt.slice(next + 1);
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

// [DRAFT EXAMPLE — wording not final] / [END DRAFT]는 사람이 검토하라고 붙인 표시다.
// 그대로 보내면 모델이 "확정 아님"으로 읽고 예시를 참고하지 않을 수 있고,
// 대괄호 표기 자체를 흉내 낼 수도 있다. 예시 본문은 남기고 표시만 평범한 문장으로 바꾼다.
function normalizeDraftMarkers(prompt) {
  return prompt
    .replace(
      /^\[DRAFT EXAMPLE[^\]\n]*?Trigger:\s*([^\]\n]+)\]$/gm,
      (_match, trigger) => `Example (${trigger.trim()}):`
    )
    .replace(/^\[DRAFT EXAMPLE[^\]\n]*\]$/gm, "Example:")
    .replace(/^\[END DRAFT\]\n?/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function loadPrompts() {
  const markdown = fs.readFileSync(PROMPTS_MD, "utf8");

  const prepare = (text) => normalizeDraftMarkers(dropEmptyKnowledgeSection(text));
  const prompts = {
    learning: prepare(extractBlock(markdown, "## 1. 배우기용 AI")),
    coding: prepare(extractBlock(markdown, "## 2. 코딩 팝업 AI")),
  };

  // 채워지지 않은 자리가 남아 있으면 그대로 모델에게 가버린다. 조용히 넘어가면 안 된다.
  for (const [name, text] of Object.entries(prompts)) {
    const leftover = text.match(/\{\{[^}]+\}\}/g);
    if (leftover) {
      throw new Error(
        `${name} 프롬프트에 안 채워진 자리가 남았다: ${leftover.join(", ")}\n` +
        `load-prompts.js의 제거 규칙을 PROMPTS.md 구조에 맞게 고쳐야 한다.`
      );
    }
    if (text.length < 200) {
      throw new Error(`${name} 프롬프트가 비정상적으로 짧다(${text.length}자). 추출이 잘못됐다.`);
    }
    if (/\[(?:DRAFT|END DRAFT)/.test(text)) {
      throw new Error(
        `${name} 프롬프트에 검토용 표시가 남았다. normalizeDraftMarkers의 정규식을 확인해라.`
      );
    }
  }

  return prompts;
}

module.exports = { loadPrompts };
