// 의미 검증기 (semantic validator)
// JSON Schema(ajv)가 "구조"는 잡지만 "의미"는 못 잡는 규칙들을 후처리로 검사한다.
// 판정 기준 스키마는 항상 원본 schema.v1.json이며, 이 파일은 그 위에 얹는 2차 관문이다.
//
// 사용법:
//   const { check } = require("./semantic_validator");
//   const violations = check(response, context); // 위반 사유 배열, []면 통과
//
// context 예시: { userSuppliedCode: true, userSuppliedError: "TypeError: ..." }

// ── 공용 헬퍼: 응답 트리 전체를 훑어 문자열/특정 속성을 모은다 ──────────────

// 트리 안의 모든 문자열 값을 모은다 (규칙 6에서 사용).
function collectStrings(node, out) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
  else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) collectStrings(node[k], out);
  }
  return out;
}

// 트리 안에서 tier === "core" 인 블록 개수를 센다 (규칙 4에서 사용).
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

// 파괴적 명령 패턴 (규칙 5).
const DESTRUCTIVE = /rm\s+-rf|curl.*\|.*sh|sudo/;

// 최신성 판단이 필요한데 놓쳤을 가능성을 시사하는 시제 표현 (규칙 6).
const TIME_SENSITIVE = /최신|현재 버전|요즘/;

// ── 본체 ────────────────────────────────────────────────────────────────

function check(response, context) {
  const v = [];
  const body = response.body || {};
  const safety = response.safety || {};
  const audience = response.audience || {};
  const reliability = response.reliability || {};
  const ctx = context || {};

  // 1) safety_notice 인데 안전 상태가 standard → 위험을 알리면서 "문제 없음"이라 선언
  if (body.type === "safety_notice" && safety.status === "standard") {
    v.push("규칙1: body.type이 safety_notice인데 safety.status가 standard이다.");
  }

  // 2) 사용자가 코드를 줬는데, 응답이 그 코드를 user_provided로 표시하지 않음
  //    (subject_code = 코드 설명, failing_code = 오류 진단)
  if (ctx.userSuppliedCode) {
    const codeBlock = body.subject_code || body.failing_code;
    if (codeBlock && codeBlock.origin !== "user_provided") {
      v.push(
        "규칙2: 사용자가 코드를 제공했는데 code.origin이 user_provided가 아니다 (" +
          codeBlock.origin +
          ")."
      );
    }
  }

  // 3) 사용자가 실제 오류를 줬는데, 응답이 지어낸 대표 오류(representative)로 처리
  if (ctx.userSuppliedError && body.observed_error &&
      body.observed_error.origin === "representative") {
    v.push("규칙3: 사용자가 실제 오류를 제공했는데 observed_error.origin이 representative이다.");
  }

  // 4) 완전 초보 대상인데 core tier 블록이 4개를 초과 → 한 번에 너무 많이 노출
  if (audience.level === "absolute_beginner") {
    const coreCount = countCoreTiers(body);
    if (coreCount > 4) {
      v.push("규칙4: audience.level이 absolute_beginner인데 core tier 블록이 " + coreCount + "개(>4)이다.");
    }
  }

  // 5) 절차 안내인데 파괴적 명령을 담으면서 안전 상태가 standard
  if (body.type === "procedure" && Array.isArray(body.steps)) {
    for (const step of body.steps) {
      if (step && step.step_type === "command" && step.command &&
          typeof step.command.command === "string" &&
          DESTRUCTIVE.test(step.command.command) &&
          safety.status === "standard") {
        v.push('규칙5: 파괴적 명령("' + step.command.command + '")이 있는데 safety.status가 standard이다.');
        break; // 한 번만 보고
      }
    }
  }

  // 6) 안정(stable)이라 선언했는데 텍스트에 시제 표현이 있음 → 최신성 판단 누락 의심
  if (reliability.status === "stable") {
    const strings = collectStrings(response, []);
    const hit = strings.find((s) => TIME_SENSITIVE.test(s));
    if (hit) {
      v.push('규칙6: reliability.status가 stable인데 시제 표현이 있다 ("' + hit.slice(0, 40) + '").');
    }
  }

  return v;
}

module.exports = { check };

// ── 내장 유닛 테스트: `node semantic_validator.js` 로 실행 ──────────────────
// 규칙마다 위반 1개 + 통과 1개로 커버리지를 확인한다.
if (require.main === module) {
  let pass = 0;
  let fail = 0;

  // expectViolated: rule 번호 문자열이 위반 배열에 포함되어야 통과
  function expect(label, response, context, ruleTag, shouldViolate) {
    const violations = check(response, context);
    const hit = violations.some((x) => x.startsWith(ruleTag));
    const ok = shouldViolate ? hit : !hit;
    if (ok) pass++; else fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) console.log("      실제 위반:", JSON.stringify(violations));
  }

  // 규칙 1
  expect("규칙1 위반: safety_notice + standard",
    { body: { type: "safety_notice" }, safety: { status: "standard" } }, {}, "규칙1", true);
  expect("규칙1 통과: safety_notice + restricted",
    { body: { type: "safety_notice" }, safety: { status: "restricted" } }, {}, "규칙1", false);

  // 규칙 2
  expect("규칙2 위반: 사용자 코드인데 assistant_authored",
    { body: { type: "code_explanation", subject_code: { origin: "assistant_authored" } }, safety: {} },
    { userSuppliedCode: true }, "규칙2", true);
  expect("규칙2 통과: 사용자 코드이고 user_provided",
    { body: { type: "code_explanation", subject_code: { origin: "user_provided" } }, safety: {} },
    { userSuppliedCode: true }, "규칙2", false);

  // 규칙 3
  expect("규칙3 위반: 실제 오류인데 representative",
    { body: { type: "error_diagnosis", observed_error: { origin: "representative" } }, safety: {} },
    { userSuppliedError: "TypeError" }, "규칙3", true);
  expect("규칙3 통과: 실제 오류이고 user_provided",
    { body: { type: "error_diagnosis", observed_error: { origin: "user_provided" } }, safety: {} },
    { userSuppliedError: "TypeError" }, "규칙3", false);

  // 규칙 4
  const fiveCore = { type: "concept_explanation", explanation: [
    { tier: "core" }, { tier: "core" }, { tier: "core" }, { tier: "core" }, { tier: "core" },
  ] };
  const twoCore = { type: "concept_explanation", explanation: [{ tier: "core" }, { tier: "more" }] };
  expect("규칙4 위반: 초보 + core 5개",
    { body: fiveCore, audience: { level: "absolute_beginner" }, safety: {} }, {}, "규칙4", true);
  expect("규칙4 통과: 초보 + core 1개",
    { body: twoCore, audience: { level: "absolute_beginner" }, safety: {} }, {}, "규칙4", false);

  // 규칙 5
  const destructiveStep = { type: "procedure", steps: [
    { step_type: "command", command: { command: "sudo rm -rf /tmp/x" } },
  ] };
  expect("규칙5 위반: 파괴적 명령 + standard",
    { body: destructiveStep, safety: { status: "standard" } }, {}, "규칙5", true);
  expect("규칙5 통과: 파괴적 명령이지만 caution",
    { body: destructiveStep, safety: { status: "caution" } }, {}, "규칙5", false);

  // 규칙 6
  expect("규칙6 위반: stable + 시제 표현",
    { body: { type: "concept_explanation" }, reliability: { status: "stable" },
      one_line_answer: "이것이 최신 방식입니다.", safety: {} }, {}, "규칙6", true);
  expect("규칙6 통과: stable + 시제 표현 없음",
    { body: { type: "concept_explanation" }, reliability: { status: "stable" },
      one_line_answer: "리스트는 값을 순서대로 담는 상자입니다.", safety: {} }, {}, "규칙6", false);

  console.log(`\n결과: ${pass} 통과 / ${fail} 실패 (총 ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}
