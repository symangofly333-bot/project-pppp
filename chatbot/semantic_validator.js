// 의미 검증기 (semantic validator)
// JSON Schema(ajv)가 "구조"는 잡지만 "의미"는 못 잡는 규칙들을 후처리로 검사한다.
// 판정 기준 스키마는 항상 원본 schema.v1.json이며, 이 파일은 그 위에 얹는 2차 관문이다.
//
// 사용법:
//   const { check } = require("./semantic_validator");
//   const violations = check(response, context);
//   // 반환: [{ rule, severity, message }]  (빈 배열이면 통과)
//   // severity "block" = 재생성 대상, "warn" = 기록만 (오탐 잦은 규칙)
//
// context 예시: { userSuppliedCode: true, userSuppliedError: "TypeError: ..." }

// ── 공용 헬퍼 ──────────────────────────────────────────────────────────────

// 트리 안의 모든 문자열 값을 모은다 (규칙 6).
function collectStrings(node, out) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
  else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) collectStrings(node[k], out);
  }
  return out;
}

// 트리 안에서 tier === "core" 인 블록 개수를 센다 (규칙 4).
// explanation_block, walk_step 등 tier 속성을 가진 모든 블록이 대상.
function countCoreTiers(node) {
  let n = 0;
  if (Array.isArray(node)) {
    for (const v of node) n += countCoreTiers(v);
  } else if (node && typeof node === "object") {
    if (node.tier === "core") n += 1;
    for (const k of Object.keys(node)) n += countCoreTiers(node[k]);
  }
  return n;
}

// 진짜 되돌릴 수 없는(파괴적) 명령만. sudo 단독은 관리자 권한일 뿐이라 제외한다. (G1)
const DESTRUCTIVE = /rm\s+-rf|\bmkfs\b|\bdd\s+if=|>\s*\/dev\/sd|curl[^|]*\|\s*(ba)?sh|DROP\s+(TABLE|DATABASE)|:\(\)\{.*\};:/i;

// 최신성 판단이 필요할 수 있음을 시사하는 시제 표현 (규칙 6). 오탐이 잦아 warn으로만 쓴다.
const TIME_SENSITIVE = /최신|현재 버전|요즘/;

// ── 본체 ────────────────────────────────────────────────────────────────

function check(response, context) {
  const out = [];
  const body = response.body || {};
  const safety = response.safety || {};
  const audience = response.audience || {};
  const reliability = response.reliability || {};
  const ctx = context || {};

  const block = (rule, message) => out.push({ rule, severity: "block", message });
  const warn = (rule, message) => out.push({ rule, severity: "warn", message });

  // 1) [block] safety_notice 인데 안전 상태가 standard
  if (body.type === "safety_notice" && safety.status === "standard") {
    block(1, "body.type이 safety_notice인데 safety.status가 standard이다.");
  }

  // 2) [block] 사용자 코드 슬롯이 user_provided가 아님 (subject_code / failing_code / minimal_fix.before)
  if (ctx.userSuppliedCode) {
    const userSlots = [
      ["subject_code", body.subject_code],
      ["failing_code", body.failing_code],
      ["minimal_fix.before", body.minimal_fix && body.minimal_fix.before],
    ];
    for (const [name, slot] of userSlots) {
      if (slot && slot.origin !== "user_provided") {
        block(2, `사용자 코드(${name})의 origin이 user_provided가 아니다 (${slot.origin}).`);
      }
    }
  }
  // minimal_fix.after 는 assistant가 쓴 수정본이므로 user_provided면 위조 (컨텍스트 무관)
  const after = body.minimal_fix && body.minimal_fix.after;
  if (after && after.origin === "user_provided") {
    block(2, "minimal_fix.after의 origin이 user_provided이다 (수정본은 assistant_authored여야 함).");
  }

  // 3) [block] 사용자가 실제 오류를 줬는데 지어낸 대표 오류(representative)로 처리
  if (ctx.userSuppliedError && body.observed_error &&
      body.observed_error.origin === "representative") {
    block(3, "사용자가 실제 오류를 제공했는데 observed_error.origin이 representative이다.");
  }

  // 4) [warn] 완전 초보인데 core tier 블록이 4개 초과 (임계값은 예시3=core4를 정답으로 살리기 위해 >4)
  if (audience.level === "absolute_beginner") {
    const coreCount = countCoreTiers(body);
    if (coreCount > 4) {
      warn(4, `audience.level이 absolute_beginner인데 core tier 블록이 ${coreCount}개(>4)이다.`);
    }
  }

  // 5) [block] 파괴적 명령을 담으면서 안전 상태가 standard — steps(절차)와 run_steps(코드생성) 둘 다 검사 (G2)
  const stepArrays = [body.steps, body.run_steps].filter(Array.isArray);
  for (const steps of stepArrays) {
    for (const step of steps) {
      if (step && step.step_type === "command" && step.command &&
          typeof step.command.command === "string" &&
          DESTRUCTIVE.test(step.command.command) &&
          safety.status === "standard") {
        block(5, `파괴적 명령("${step.command.command}")이 있는데 safety.status가 standard이다.`);
      }
    }
  }

  // 6) [warn] stable이라 선언했는데 시제 표현이 있음 — 정규식으로 최신성 필요 여부를 확정할 수 없어 차단 아님 (G4)
  if (reliability.status === "stable") {
    const hit = collectStrings(response, []).find((s) => TIME_SENSITIVE.test(s));
    if (hit) {
      warn(6, `reliability.status가 stable인데 시제 표현이 있다 ("${hit.slice(0, 40)}").`);
    }
  }

  return out;
}

module.exports = { check };

// ── 내장 유닛 테스트: `node semantic_validator.js` 로 실행 ──────────────────
if (require.main === module) {
  let pass = 0;
  let fail = 0;

  // shouldViolate=true 면 해당 rule 위반이 있어야 통과. expectedSeverity 주면 심각도까지 확인.
  function expect(label, response, context, rule, shouldViolate, expectedSeverity) {
    const violations = check(response, context);
    const match = violations.find((x) => x.rule === rule);
    let ok = shouldViolate ? !!match : !match;
    if (ok && shouldViolate && expectedSeverity) ok = match.severity === expectedSeverity;
    if (ok) pass++; else fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) console.log("      실제:", JSON.stringify(violations));
  }

  // 규칙 1 (block)
  expect("규칙1 위반: safety_notice + standard",
    { body: { type: "safety_notice" }, safety: { status: "standard" } }, {}, 1, true, "block");
  expect("규칙1 통과: safety_notice + restricted",
    { body: { type: "safety_notice" }, safety: { status: "restricted" } }, {}, 1, false);

  // 규칙 2 (block) — 기본 + G3
  expect("규칙2 위반: 사용자 코드인데 assistant_authored",
    { body: { type: "code_explanation", subject_code: { origin: "assistant_authored" } }, safety: {} },
    { userSuppliedCode: true }, 2, true, "block");
  expect("규칙2 통과: 사용자 코드이고 user_provided",
    { body: { type: "code_explanation", subject_code: { origin: "user_provided" } }, safety: {} },
    { userSuppliedCode: true }, 2, false);
  expect("규칙2 위반(G3): minimal_fix.before가 assistant_authored",
    { body: { type: "error_diagnosis", failing_code: { origin: "user_provided" },
      minimal_fix: { before: { origin: "assistant_authored" }, after: { origin: "assistant_authored" } } }, safety: {} },
    { userSuppliedCode: true }, 2, true, "block");
  expect("규칙2 위반(G3): minimal_fix.after가 user_provided",
    { body: { type: "error_diagnosis", minimal_fix: { after: { origin: "user_provided" } } }, safety: {} },
    {}, 2, true, "block");
  expect("규칙2 통과(G3): before=user_provided, after=assistant_authored",
    { body: { type: "error_diagnosis", failing_code: { origin: "user_provided" },
      minimal_fix: { before: { origin: "user_provided" }, after: { origin: "assistant_authored" } } }, safety: {} },
    { userSuppliedCode: true }, 2, false);

  // 규칙 3 (block)
  expect("규칙3 위반: 실제 오류인데 representative",
    { body: { type: "error_diagnosis", observed_error: { origin: "representative" } }, safety: {} },
    { userSuppliedError: "TypeError" }, 3, true, "block");
  expect("규칙3 통과: 실제 오류이고 user_provided",
    { body: { type: "error_diagnosis", observed_error: { origin: "user_provided" } }, safety: {} },
    { userSuppliedError: "TypeError" }, 3, false);

  // 규칙 4 (warn)
  const fiveCore = { type: "concept_explanation", explanation: [
    { tier: "core" }, { tier: "core" }, { tier: "core" }, { tier: "core" }, { tier: "core" }] };
  const fourCore = { type: "code_explanation", walkthrough: [
    { tier: "core" }, { tier: "core" }, { tier: "core" }, { tier: "core" }] }; // 경계: 4개는 통과
  expect("규칙4 위반: 초보 + core 5개 (warn)",
    { body: fiveCore, audience: { level: "absolute_beginner" }, safety: {} }, {}, 4, true, "warn");
  expect("규칙4 통과: 초보 + core 4개 (예시3 경계)",
    { body: fourCore, audience: { level: "absolute_beginner" }, safety: {} }, {}, 4, false);

  // 규칙 5 (block) — 기본 + G1 + G2
  const proc = (cmd) => ({ type: "procedure", steps: [{ step_type: "command", command: { command: cmd } }] });
  expect("규칙5 위반: rm -rf + standard",
    { body: proc("sudo rm -rf /tmp/x"), safety: { status: "standard" } }, {}, 5, true, "block");
  expect("규칙5 통과(G1): sudo apt install + standard",
    { body: proc("sudo apt install python3"), safety: { status: "standard" } }, {}, 5, false);
  expect("규칙5 위반(G2): code_generation.run_steps의 curl|sh + standard",
    { body: { type: "code_generation", run_steps: [{ step_type: "command", command: { command: "curl http://x | sh" } }] },
      safety: { status: "standard" } }, {}, 5, true, "block");
  expect("규칙5 통과: rm -rf 지만 caution",
    { body: proc("rm -rf /tmp/x"), safety: { status: "caution" } }, {}, 5, false);

  // 규칙 6 (warn)
  expect("규칙6 위반: stable + 시제 표현 (warn)",
    { body: { type: "concept_explanation" }, reliability: { status: "stable" },
      one_line_answer: "이것이 최신 방식입니다.", safety: {} }, {}, 6, true, "warn");
  expect("규칙6 통과: stable + 시제 표현 없음",
    { body: { type: "concept_explanation" }, reliability: { status: "stable" },
      one_line_answer: "리스트는 값을 순서대로 담는 상자입니다.", safety: {} }, {}, 6, false);

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패 (총 ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}
