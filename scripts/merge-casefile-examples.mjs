// 서류 분석 예시 반영 (F-015, DEC-052). **무료** — 모델을 부르지 않는다.
// evals/casefile-examples/out/<id>.json(scripts/gen-casefile-examples.mjs 결과) → lib/casefile/examples.json
// - 인용 검증을 통과한(verified) 문단만 남긴다 (예시 답변과 같은 기준, lib/demo README). 남은 문단이 2개 미만이면 넣지 않는다.
// - DeepSearch 사건 구조(deep)의 쟁점은 남은 문단의 새 순번으로 다시 잇는다.
// - 판독 결과(reading)는 서버가 이미 가린 것이다(개인 이름 없음). 서류 그림은 직접 쓴 가상 문서다.
// 사용: node scripts/merge-casefile-examples.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "evals/casefile-examples";
// PNG 머리(IHDR)에서 그림 크기를 읽는다 — 화면이 자리를 미리 잡게(next/image)
const pngSize = (path) => {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};
const MIN_POINTS = 2;
// 성 한 글자 + ○○(예: 박○○)도 ○○○로 — 가상 인물이지만 개인 이름 꼴을 화면에 남기지 않는다 (절대 규칙 4)
const maskSurname = (v) => JSON.parse(JSON.stringify(v).replace(/[가-힣]○○(?!○)/g, "○○○"));
const presets = JSON.parse(readFileSync(`${DIR}/questions.json`, "utf8")).questions;

const examples = [];
for (const p of presets) {
  const file = `${DIR}/out/${p.id}.json`;
  if (!existsSync(file)) {
    console.log(JSON.stringify({ id: p.id, missing: true }));
    continue;
  }
  const g = JSON.parse(readFileSync(file, "utf8"));
  const r = g.result;
  const keep = r.answer.points.flatMap((x, i) => (x.check === "verified" ? [i] : []));
  const points = keep.map((i) => r.answer.points[i]);
  if (r.mode !== "ai" || !r.deep || points.length < MIN_POINTS) {
    console.log(JSON.stringify({ id: p.id, skipped: true, mode: r.mode, points: points.length }));
    continue;
  }
  const dropped = r.answer.points.length - points.length;
  const sources = new Set(points.map((x) => x.source));
  const newIndex = new Map(keep.map((old, i) => [old, i]));
  examples.push({
    id: p.id,
    title: p.title,
    basis: p.basis,
    mySide: p.mySide,
    image: `/casefile-examples/${p.id}.png`,
    ...pngSize(`public/casefile-examples/${p.id}.png`),
    userQuestion: p.question,
    reading: maskSurname(g.reading),
    question: maskSurname(g.question),
    result: {
      outcome: r.outcome,
      aiNotice: r.aiNotice,
      intent: r.intent,
      answer: { points: maskSurname(points) },
      articles: r.articles.map((a) => ({ ...a, used: sources.has(a.id) })),
      cases: r.cases.map((c) => ({ ...c, used: sources.has(`case:${c.caseNo}`) })),
      searches: r.searches,
      trace: r.trace ?? [],
      searchScopeNote: r.searchScopeNote,
      recheck: { ...r.recheck, removed: r.recheck.removed + dropped },
      mode: "ai",
      ...(r.section && { section: r.section }),
      deep: {
        ...maskSurname(r.deep),
        issues: r.deep.issues
          .map((i) => ({
            title: i.title,
            points: i.points.filter((x) => newIndex.has(x)).map((x) => newIndex.get(x)),
          }))
          .filter((i) => i.points.length > 0),
      },
    },
  });
  console.log(JSON.stringify({ id: p.id, chars: g.question.length, kept: points.length, dropped }));
}

writeFileSync(
  "lib/casefile/examples.json",
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      source:
        "서류 분석 예시: 직접 쓴 가상 서류 그림 → 서류 판독(Haiku 비전) → DeepSearch(Pro Max = Opus 5.5 effort xhigh), 인용 검증 통과 문단만",
      examples,
    },
    null,
    2,
  )}\n`,
);
