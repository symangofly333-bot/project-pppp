"use strict";
// PROMPTS.md의 자연어 프롬프트를 실제 Claude API에 붙여서 돌려보고, 사람이 읽고
// 채점할 수 있는 리포트를 만든다.
//
// 여기서 하지 않는 것: 자동 채점. "다독임이 한 문장 이하인가", "비유 4단계를 지켰는가"
// 같은 건 정규식으로 판정할 수 없다. 억지로 자동화하면 틀린 점수를 믿게 된다.
// 대신 (1) 객관적으로 셀 수 있는 것만 세고 (2) 나머지는 체크박스로 남겨 사람이 본다.
//
// 실행:
//   node prompt-eval/run.js              전체
//   node prompt-eval/run.js --dry        API 호출 없이 무엇을 보낼지만 확인
//   node prompt-eval/run.js --target=coding
//   node prompt-eval/run.js --case=11

const fs = require("node:fs");
const path = require("node:path");
const { loadPrompts } = require("./load-prompts");
const { CASES, BLOCKED } = require("./cases");

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 4096;
const TIMEOUT_MS = 120_000;
const DELAY_MS = 700; // 연속 호출 사이 간격

const RESULTS_DIR = path.join(__dirname, "results");

function parseArgs(argv) {
  const args = { dry: false, target: null, case: null };
  for (const raw of argv) {
    if (raw === "--dry") args.dry = true;
    else if (raw.startsWith("--target=")) args.target = raw.slice("--target=".length);
    else if (raw.startsWith("--case=")) args.case = raw.slice("--case=".length);
  }
  return args;
}

// 정규식으로 확실하게 셀 수 있는 것만. 톤·정확성은 여기서 판단하지 않는다.
function objectiveSignals(text) {
  const lines = text.split("\n");
  const outsideFence = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence) outsideFence.push(line);
  }
  return {
    chars: text.length,
    // 코드 블록 안의 #, - 등은 서식이 아니라 코드다. 밖에서만 센다.
    headings: outsideFence.filter((l) => /^#{1,6}\s/.test(l)).length,
    tableRows: outsideFence.filter((l) => /^\s*\|.*\|\s*$/.test(l)).length,
    bullets: outsideFence.filter((l) => /^\s*[-*]\s/.test(l)).length,
    numbered: outsideFence.filter((l) => /^\s*\d+[.)]\s/.test(l)).length,
    codeBlocks: (text.match(/^\s*```/gm) || []).length / 2,
  };
}

async function ask(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY가 설정돼 있지 않다. 환경변수로 넣어라. 코드나 채팅에 붙여넣지 말 것."
    );
  }

  const startedAt = Date.now();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      // 지금은 한 턴뿐이다. 배관이 고쳐지면 여기에 앞 턴들이 들어온다.
      messages: [{ role: "user", content: userMessage }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const latencyMs = Date.now() - startedAt;
  const payload = await response.json();

  if (!response.ok) {
    const detail = payload?.error?.message || JSON.stringify(payload);
    throw new Error(`API ${response.status}: ${detail}`);
  }

  const text = (payload.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  return { text, latencyMs, usage: payload.usage };
}

function renderReport(runs, meta) {
  const lines = [];
  lines.push(`# 프롬프트 시험 결과 — ${meta.startedAt}`);
  lines.push("");
  lines.push(`- 모델: \`${meta.model}\``);
  lines.push(`- 대화 기록: **없음 (한 턴)** — \`PROMPTS.md\` 0-1절`);
  lines.push(`- 실행: ${runs.length}건 (실패 ${runs.filter((r) => r.error).length}건)`);
  lines.push(`- 입력 토큰 합계: ${meta.inputTokens} / 출력 토큰 합계: ${meta.outputTokens}`);
  lines.push("");
  lines.push("> 통과 여부는 사람이 판단한다. 아래 체크박스를 직접 채워라.");
  lines.push("> 객관 신호(글자 수·헤더 수 등)는 참고용이고 그 자체가 판정이 아니다.");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const run of runs) {
    lines.push(`## ${run.id}. ${run.situation}  \`${run.target}\``);
    lines.push("");
    lines.push(`**통과 기준:** ${run.pass}`);
    lines.push("");
    lines.push("**보낸 문장**");
    lines.push("");
    lines.push("```");
    lines.push(run.message);
    lines.push("```");
    lines.push("");

    if (run.error) {
      lines.push(`**실패:** ${run.error}`);
      lines.push("");
      lines.push("---");
      lines.push("");
      continue;
    }

    lines.push("**답변**");
    lines.push("");
    lines.push(run.text.split("\n").map((l) => `> ${l}`).join("\n"));
    lines.push("");
    const s = run.signals;
    lines.push(
      `**객관 신호:** ${s.chars}자 · 헤더 ${s.headings} · 표 ${s.tableRows}줄 · ` +
      `불릿 ${s.bullets} · 번호목록 ${s.numbered} · 코드블록 ${s.codeBlocks} · ${run.latencyMs}ms`
    );
    lines.push("");
    lines.push("- [ ] 통과");
    lines.push("- [ ] 실패 — 이유:");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("## 이번에 못 돌린 항목");
  lines.push("");
  for (const b of BLOCKED) {
    lines.push(`- **${b.id}. ${b.situation}** (\`${b.target}\`) — ${b.why}`);
  }
  lines.push("");
  lines.push("## 8번(메타 교육 빈도) 보는 법");
  lines.push("");
  lines.push("자동으로 못 센다. 위 답변들을 훑으면서 \"AI한테 이렇게 물어보면 된다\" 류의");
  lines.push("조언이 몇 건에 붙었는지 직접 세라. **전부에 붙어 있으면 실패다.**");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompts = loadPrompts();

  let selected = CASES;
  if (args.target) selected = selected.filter((c) => c.target === args.target);
  if (args.case) selected = selected.filter((c) => String(c.id) === args.case);

  if (selected.length === 0) {
    console.error("조건에 맞는 시험 항목이 없다.");
    process.exit(1);
  }

  if (args.dry) {
    console.log(`[dry] 모델: ${MODEL} — API를 부르지 않는다.\n`);
    for (const [name, text] of Object.entries(prompts)) {
      console.log(`--- ${name} 시스템 프롬프트 (${text.length}자) ---`);
      console.log(text);
      console.log("");
    }
    console.log(`--- 보낼 문장 ${selected.length}건 ---`);
    for (const c of selected) {
      console.log(`[${c.id}] (${c.target}) ${c.message.split("\n")[0].slice(0, 80)}`);
    }
    return;
  }

  const startedAt = new Date();
  const runs = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const c of selected) {
    process.stdout.write(`[${c.id}] ${c.target} ... `);
    try {
      const result = await ask(prompts[c.target], c.message);
      inputTokens += result.usage?.input_tokens || 0;
      outputTokens += result.usage?.output_tokens || 0;
      runs.push({ ...c, text: result.text, latencyMs: result.latencyMs, signals: objectiveSignals(result.text) });
      console.log(`${result.text.length}자 (${result.latencyMs}ms)`);
    } catch (error) {
      // 한 건 실패했다고 나머지를 못 보면 손해다. 기록만 하고 계속 간다.
      runs.push({ ...c, error: error.message });
      console.log(`실패 — ${error.message}`);
    }
    if (c !== selected[selected.length - 1]) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `${stamp}.md`);
  fs.writeFileSync(
    outPath,
    renderReport(runs, {
      startedAt: startedAt.toISOString(),
      model: MODEL,
      inputTokens,
      outputTokens,
    }),
    "utf8"
  );

  console.log(`\n리포트: ${outPath}`);
  console.log(`토큰: 입력 ${inputTokens} / 출력 ${outputTokens}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
