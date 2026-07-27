# Claude API 러너

`schema.v1.json` 원본을 Claude API의 `output_config.format`에 그대로 넣고,
8개 `body.type` 프롬프트를 각각 3회 호출해 총 24회를 검증한다.

## 기본 모델

기본값은 `claude-sonnet-5`다. 2026-07-26 기준 Anthropic 공식 문서에서
속도와 성능의 균형형으로 안내되며, Claude API의 Claude 4.5 이상 모델은
Structured Outputs를 지원한다.

필요하면 환경변수로 바꿀 수 있다.

```bash
export CLAUDE_MODEL=claude-sonnet-5
```

## 설치와 실행

API 키를 코드나 채팅에 붙이지 말고 실행하는 터미널의 환경변수로만 설정한다.

```bash
cd claude-runner
npm install
npm test
npm run check

export ANTHROPIC_API_KEY='본인의 키'
npm run eval -- \
  --schema ../project_sources/07-schema.v1.json \
  --semantic '../upload/semantic_validator(1).js' \
  --out ./results/live
```

Windows PowerShell:

```powershell
cd claude-runner
npm install
npm test
npm run check

$env:ANTHROPIC_API_KEY = "본인의 키"
npm run eval -- `
  --schema ../project_sources/07-schema.v1.json `
  --semantic "../upload/semantic_validator(1).js" `
  --out ./results/live
```

결과:

- `results/live/report.md`: 사람이 읽는 요약 리포트
- `results/live/results.json`: 24개 응답, AJV 원문 오류, 의미 위반, API 오류 원문

## 어댑터 경계

외부 코드가 의존하는 함수는 이것 하나다.

```js
const { generate } = require("./claude-adapter");
const normalizedJsonResponse = await generate(prompt, schema);
```

반환값:

```js
{
  json: { /* schema.v1.json 응답 */ },
  meta: {
    provider: "anthropic",
    model: "claude-sonnet-5",
    requestId: "...",
    httpStatus: 200,
    stopReason: "end_turn",
    usage: { /* Anthropic usage */ },
    latencyMs: 1234
  }
}
```

나중에 OpenAI를 붙일 때는 같은 반환 모양을 유지하고
`claude-adapter.js` 내부 호출만 교체하면 된다.

## 판정 규칙

- 생성 요청: 원본 `schema.v1.json`
- AJV 판정: 원본 `schema.v1.json`
- 의미 판정: `semantic_validator.js`의 `check()`
- 유형 판정: `response.body.type === expectedType`
- strict 변환본: 사용하지 않음

첫 라이브 요청에서 스키마 관련 400이 나오면 나머지 호출을 즉시 중단한다.
특히 `Schema is too complex for compilation`은 별도 분류한다.
refusal, 토큰 잘림, JSON 파싱 실패는 프롬프트/모델 동작으로 분리한다.

## 원본 스키마 관련 사전 경고

직접 집계한 값:

- 속성 131개
- 선택 속성 0개
- literal `anyOf` 5곳
- `$ref` 재사용까지 펼친 union 배치 추정 10곳
- `minItems` 25곳
- `maxItems` 26곳
- `maxLength` 60곳

전달받은 “anyOf 9개”와 파일 직접 집계가 일치하지 않는다. 또한 Anthropic
공식 문서는 `maxLength`를 Structured Outputs에서 SDK가 제거하는 미지원
제약의 예로 든다. 이 러너는 원본 우선 검증 지시를 지켜 아무것도 제거하지
않으며, 실제 400 원문을 리포트에 남긴다.

공식 문서:

- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5
