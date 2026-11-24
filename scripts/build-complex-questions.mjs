// 복잡한 예시 사연(scenarios/*.json)을 답변 생성 입력(questions.json)으로 펼친다 (무료, 모델 호출 없음).
// 쪽마다 질문 1건: id = <예시 id>--<쪽>, text = 복잡한 상황(답변에 쓴다), summary = 화면에 보일 요약 질문.
// 사용: node scripts/build-complex-questions.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "evals/examples-complex";
const cats = readFileSync("lib/procedure/categories.ts", "utf8");
// 카테고리 키 ← 예시 id (categories.ts의 examples 목록)
const categoryOf = new Map();
for (const m of cats.matchAll(/\n {2}(\w+): \{[\s\S]*?examples: \[([^\]]*)\]/g))
  for (const id of m[2].match(/"([^"]+)"/g) ?? []) categoryOf.set(id.slice(1, -1), m[1]);

const questions = [];
for (const f of readdirSync(`${DIR}/scenarios`).sort()) {
  const s = JSON.parse(readFileSync(`${DIR}/scenarios/${f}`, "utf8"));
  for (const side of s.sides) {
    if (side.context.length < 300) throw new Error(`${s.id} ${side.key}: 상황이 300자 미만`);
    questions.push({
      id: `${s.id}--${side.key}`,
      example: s.id,
      kind: s.kind,
      side: side.key,
      label: side.label,
      summary: side.summary,
      document: side.document,
      category: categoryOf.get(s.id),
      deep: true,
      text: side.context,
    });
  }
}
writeFileSync(`${DIR}/questions.json`, `${JSON.stringify({ questions }, null, 2)}\n`);
console.log(
  JSON.stringify({
    questions: questions.length,
    noCategory: questions.filter((q) => !q.category).map((q) => q.id),
  }),
);
