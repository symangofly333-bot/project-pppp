# ChatGPT 교차검증용 프롬프트

아래를 그대로 ChatGPT에 붙여넣고, `schema.v1.json` 파일도 같이 첨부하세요.

---

너는 이 프로젝트의 JSON Schema(`schema.v1.json`)를 처음 설계한 AI다. 실제로 Claude API(Anthropic)에 이 스키마를 구조화 출력(`output_config.format`, JSON Schema strict 모드)으로 붙여서 라이브 테스트를 해봤다. 결과를 알려줄 테니 원인 분석과 수정안을 달라.

## 확정된 라이브 실측 결과 (추측 아님, 실제 API 호출로 확인됨)

| 시도 | 크기(문자) | 펼친 속성 개수 | anyOf 모양 가짓수 | 결과 |
|---|---|---|---|---|
| 통짜 원본 (body.type 8종 anyOf 전부) | 14,291 | — | — | 거부 |
| body.type 1종만 남김: concept_explanation | 4,493 | 76 | 9 | **통과** |
| body.type 1종만 남김: code_generation | 7,199 | 223 | 140 | 거부 |
| 위와 동일 + anyOf 전부 평탄화(모양 가짓수 1로) | 5,738 | (평탄화로 속성 늘어남) | **1** | 거부 |

거부 메시지는 매번 동일: `"The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools."`

## 이미 기각한 가설 (다시 제안하지 말 것)

1. **"anyOf 조합 폭발이 원인"** — 기각됨. 모양 가짓수를 140 → 1로 없앴는데도 여전히 거부됨.
2. **"description/title 같은 설명문이 크기를 차지한다"** — 기각됨. 전부 제거해도 크기가 8%만 줄어듦.
3. **미지원 키워드(`maxLength`/`minItems`/`maxItems`) 문제** — 이건 이미 해결. Claude 구조화 출력에서 이 키워드들을 지원 안 해서 별도로 제거하고 보낸다. 지금 남은 문제는 그것과 무관하게, 제거한 뒤에도 여전히 거부된다는 것.

## 현재 파악한 것

한계선은 **펼친 속성 개수 76(통과) ~ 223(거부) 사이**로 보인다. `body.type` 8종의 속성 수:

| body.type | 펼친 속성 수 | 라이브 |
|---|---|---|
| safety_notice | 68 | 미확인 |
| concept_explanation | 76 | **통과** |
| prompt_help | 77 | 미확인 |
| clarification_request | 82 | 미확인 |
| code_explanation | 145 | 미확인(추정 거부) |
| procedure | 186 | 미확인(추정 거부) |
| error_diagnosis | 195 | 미확인(추정 거부) |
| code_generation | 223 | **거부** |

## 질문

1. 이 데이터를 보면 진짜 원인이 뭐라고 생각하는가? ("펼친 속성 개수"가 진짜 지표가 맞는지, 아니면 다른 요인(중첩 깊이, `$ref` 재사용 횟수, 배열 안의 객체 개수 등)이 더 정확한 지표인지)
2. `code_generation`, `procedure`, `error_diagnosis`, `code_explanation` — 이 4개 큰 타입을 어떻게 줄일 수 있는가? 구체적으로 어떤 필드를 빼거나 합칠지 제안해달라. 단, 다음은 지키면서:
   - 초보자에게 필요한 핵심 정보(무엇을 왜 하는지, 안전 여부, 다음 행동)는 유지
   - `origin`(user_provided vs assistant_authored) 필드는 유지 — 프롬프트 인젝션 방어 장치라 뺄 수 없음
   - `reliability`/`safety` 최상위 선언은 유지
3. 아니면 스키마를 줄이는 대신, 구조화 출력 강제를 포기하고 "프롬프트로 형식 요청 + 받은 후 AJV로 검증 + 실패 시 재생성" 방식으로 가는 게 더 나은가? 두 방식의 트레이드오프를 비교해달라.

## 제약 조건 (반드시 지킬 것)

- 판정 기준은 항상 원본 `schema.v1.json` 구조를 최대한 보존하는 방향으로 — 완전히 새로 설계하지 말고 **기존 필드/의도를 최대한 살리면서 줄이는** 안을 우선 제시할 것
- 이 스키마는 실제 사용자가 아직 한 명도 안 써봤다. 지금 시점에 과설계를 줄이는 게 맞는지, 아니면 실사용자 테스트 후에 정하는 게 맞는지에 대한 의견도 짧게 달라
