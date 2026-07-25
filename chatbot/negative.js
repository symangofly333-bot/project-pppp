// 반례 테스트: 아래는 모두 "거부되어야" 정상이다.
const fs = require("fs");
const base = JSON.parse(fs.readFileSync(__dirname + "/examples.json", "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const strip = (o) => { const c = clone(o); delete c._name; return c; };

const concept = strip(base[0]);
const codeExp = strip(base[2]);
const codeGen = strip(base[3]);
const errDiag = strip(base[4]);
const proc = strip(base[5]);
const clar = strip(base[6]);
const safe = strip(base[7]);

const cases = [];
const add = (name, obj) => cases.push({ name, obj });

// --- 상대 AI가 제안한 반례 4종 ---
add("N1 유형만 바꾸고 본문 유지", (() => {
  const o = clone(codeExp); o.body.type = "concept_explanation"; return o;
})());

add("N2 code 블록인데 실제 코드 없음", (() => {
  const o = clone(codeExp); delete o.body.subject_code.content; return o;
})());

add("N3 정보 부족 응답인데 질문 없음", (() => {
  const o = clone(clar); o.body.questions = []; return o;
})());

add("N4 코드 생성인데 파일 목록이 비어 있음", (() => {
  const o = clone(codeGen); o.body.files = []; return o;
})());

// --- 내가 추가한 반례 ---
add("N5 코드 설명인데 사용자 코드를 assistant_authored로 표기 (의미 검증 대상, 스키마는 통과 예상)", (() => {
  const o = clone(codeExp); o.body.subject_code.origin = "assistant_authored"; return o;
})());

add("N6 오류 출처를 허용되지 않은 observed로 표기", (() => {
  const o = clone(errDiag); o.body.observed_error.origin = "observed"; return o;
})());

add("N7 reliability 상태 혼합 (stable인데 이유 필드 추가)", (() => {
  const o = clone(concept); o.reliability = { status: "stable", what_changes: "x" }; return o;
})());

add("N8 safety.caution인데 notices 빈 배열", (() => {
  const o = clone(clar); o.safety = { status: "caution", notices: [] }; return o;
})());

add("N9 GUI 단계에 코드 슬롯을 억지로 넣음", (() => {
  const o = clone(proc);
  o.body.steps[1].code = { medium: "source_code", language: "text", origin: "assistant_authored", content: "" };
  return o;
})());

add("N10 단계에 expected_result 없음", (() => {
  const o = clone(proc); delete o.body.steps[0].expected_result; return o;
})());

add("N11 one_line_answer 길이 초과 (120자)", (() => {
  const o = clone(concept); o.one_line_answer = "가".repeat(121); return o;
})());

add("N12 explanation_block text 길이 초과 (300자)", (() => {
  const o = clone(concept); o.body.explanation[0].text = "가".repeat(301); return o;
})());

add("N13 next_steps 빈 배열", (() => {
  const o = clone(concept); o.next_steps = []; return o;
})());

add("N14 루트에 알 수 없는 필드 추가", (() => {
  const o = clone(concept); o.confidence_score = 0.7; return o;
})());

add("N15 body에 알 수 없는 필드 추가", (() => {
  const o = clone(concept); o.body.extra_note = "x"; return o;
})());

add("N16 concept_explanation에서 analogy 누락", (() => {
  const o = clone(concept); delete o.body.analogy; return o;
})());

add("N17 code_generation에서 key_lines 누락 (복붙 방지 장치 제거)", (() => {
  const o = clone(codeGen); delete o.body.key_lines; return o;
})());

add("N18 safety_notice인데 still_available 비어 있음", (() => {
  const o = clone(safe); o.body.still_available = []; return o;
})());

add("N19 walkthrough 개수 초과 (max 8)", (() => {
  const o = clone(codeExp);
  const w = o.body.walkthrough[0];
  o.body.walkthrough = Array.from({ length: 9 }, () => clone(w));
  return o;
})());

add("N20 알 수 없는 body.type", (() => {
  const o = clone(concept); o.body.type = "multi_part"; return o;
})());

module.exports = cases;
