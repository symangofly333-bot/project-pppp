"use strict";
// 파이프라인(분류 → 생성 → 검증 → 재생성) 라이브 확인.
//
//   node test-pipeline.js                    8종 전부 (질문당 최소 2회 호출)
//   node test-pipeline.js code_generation    한 종류만
//
// 정식 24회 측정은 run-eval.js가 한다. 이건 "파이프라인이 도는가"만 본다.

const { generateValidated } = require("./generate-validated");
const testCases = require("./test-cases");

const requested = process.argv[2];
const cases = requested
  ? testCases.filter((c) => c.expectedType === requested)
  : testCases;

if (cases.length === 0) {
  console.error(`알 수 없는 타입: ${requested}`);
  console.error(`사용 가능: ${testCases.map((c) => c.expectedType).join(", ")}`);
  process.exit(1);
}

async function main() {
  let passed = 0;

  for (const testCase of cases) {
    console.log(`\n########## ${testCase.expectedType} ##########`);
    console.log(`질문: ${testCase.prompt.split("\n")[0].slice(0, 60)}`);

    try {
      const result = await generateValidated(testCase.prompt, testCase.context);
      const typeMatch = result.meta.bodyType === testCase.expectedType;

      console.log(`분류: ${result.meta.bodyType} ${typeMatch ? "(일치)" : `(불일치! 기대: ${testCase.expectedType})`}`);
      console.log(`방식: ${result.meta.mode === "strict" ? "구조화 출력 강제" : "프롬프트 + 검증"}`);
      console.log(`시도 횟수: ${result.attempts.length}${result.attempts.length > 1 ? " (재생성 발생)" : ""}`);
      result.attempts.filter((a) => a.violations.length).forEach((a) => {
        console.log(`  ${a.attempt}차 실패 사유: ${a.violations.join(" / ")}`);
      });

      const warnings = result.violations.filter((v) => v.severity === "warn");
      console.log(`판정: 통과${warnings.length ? ` (경고 ${warnings.length}건: ${warnings.map((w) => w.rule).join(", ")})` : ""}`);
      passed += 1;
    } catch (error) {
      console.log(`판정: 실패 [${error.category}] ${error.message}`);
    }
  }

  console.log(`\n=== ${passed}/${cases.length} 통과 ===`);
  if (passed < cases.length) process.exitCode = 1;
}

main();
