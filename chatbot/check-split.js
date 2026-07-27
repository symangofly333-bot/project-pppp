// 축소 스키마 8종 오프라인 검증. API 호출 없음(비용 0).
//
// 확인하는 것:
//   1) 8종 각각이 AJV로 컴파일되는가
//   2) 각 타입의 정답 예시가 그 타입 축소본으로도 여전히 통과하는가
//      (축소하다가 멀쩡한 데이터를 거부하게 만들면 안 된다)
//   3) 축소 후 크기 (Claude가 받아줄 만한 규모인지 가늠)
//   4) 분류용 초소형 스키마도 정상인가
//
// 실행: node check-split.js

"use strict";

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const {
  listBodyTypes,
  buildTypeSchema,
  buildClassifierSchema,
} = require("./schema-split");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "schema.v1.json"), "utf8"));
const examples = JSON.parse(fs.readFileSync(path.join(__dirname, "examples.json"), "utf8"));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const originalSize = JSON.stringify(schema).length;
const originalDefs = Object.keys(schema.$defs).length;

console.log("=== 원본 ===");
console.log(`$defs ${originalDefs}개, ${originalSize.toLocaleString()}자\n`);

console.log("=== 타입별 축소 스키마 ===");
console.log("타입".padEnd(24) + "$defs".padStart(7) + "크기".padStart(10) + "  컴파일  예시통과");

let allOk = true;
for (const { type } of listBodyTypes(schema)) {
  const reduced = buildTypeSchema(schema, type);
  const defCount = Object.keys(reduced.$defs).length;
  const size = JSON.stringify(reduced).length;

  let compileOk = false;
  let validate = null;
  try {
    // 타입마다 새 인스턴스로 컴파일해 서로 간섭하지 않게 한다
    validate = new Ajv2020({ allErrors: true, strict: true }).compile(reduced);
    compileOk = true;
  } catch (error) {
    console.log(`  ${type} 컴파일 실패: ${error.message}`);
  }

  // 이 타입의 정답 예시가 축소본으로도 통과해야 한다
  const example = examples.find((item) => item.body?.type === type);
  let exampleOk = null;
  if (example && validate) {
    const candidate = JSON.parse(JSON.stringify(example));
    delete candidate._name;
    exampleOk = validate(candidate);
    if (!exampleOk) {
      console.log(`  ${type} 예시 실패:`, ajv.errorsText(validate.errors, { separator: "; " }));
    }
  }

  if (!compileOk || exampleOk === false) allOk = false;

  console.log(
    type.padEnd(24) +
      String(defCount).padStart(7) +
      `${size.toLocaleString()}자`.padStart(10) +
      (compileOk ? "     OK " : "   FAIL ") +
      (exampleOk === null ? "   예시없음" : exampleOk ? "     OK" : "   FAIL")
  );
}

console.log("\n=== 분류용 초소형 스키마 ===");
const classifier = buildClassifierSchema(schema);
try {
  ajv.compile(classifier);
  console.log(`컴파일 OK, ${JSON.stringify(classifier).length}자, 선택지 ${classifier.properties.body_type.enum.length}종`);
  console.log("선택지:", classifier.properties.body_type.enum.join(", "));
} catch (error) {
  allOk = false;
  console.log("분류용 스키마 컴파일 실패:", error.message);
}

console.log(`\n결과: ${allOk ? "전부 통과" : "실패 있음"}`);
process.exit(allOk ? 0 : 1);
