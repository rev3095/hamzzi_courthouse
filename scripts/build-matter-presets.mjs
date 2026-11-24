// 가상 사건 프리셋 반영 (DEC-061, 무료). evals/matter-presets/filled/*.json → lib/matters/presets.json
// 사건 번호는 DB 번호 대신 preset-1… 으로 바꾸고, 제목 순서대로 놓는다.
// 사용: node scripts/build-matter-presets.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "evals/matter-presets/filled";

// 처음 보는 사람에게 보이는 예시라 정리 도구의 결(판단하지 않음)과 어긋나는 단정적 문단은 뺀다 (legal-reviewer 권고).
// 로그인 사용자의 쟁점 정리 결과에는 영향이 없다
const NL = String.fromCharCode(10);
const JUDGING = [/보시는 것이 맞습니다/, /보시면 됩니다/, /책임을 집니다/, /효력이 없습니다/];
// 원래 사건 자료에 남은 가림 표시는 역할 이름으로
const tidy = (data) => ({
  ...data,
  issues: data.issues.map((i) => ({
    ...i,
    points: i.points.filter((pt) => !JUDGING.some((re) => re.test(pt.text))),
  })),
  notes: data.notes
    .map((n) => ({ ...n, body: n.body.replaceAll("[이름1]", "정") }))
    .map((n) =>
      n.kind === "search"
        ? {
            ...n,
            body: n.body
              .split(NL)
              .filter((l) => !JUDGING.some((re) => re.test(l)))
              .join(NL),
          }
        : n,
    )
    .filter((n) => n.body.trim()),
});
const items = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")))
  .sort((a, b) => a.title.localeCompare(b.title, "ko"))
  .map((p, i) => ({ id: `preset-${i + 1}`, title: p.title, data: tidy(p.data) }));
writeFileSync("lib/matters/presets.json", `${JSON.stringify(items, null, 2)}\n`);
console.log(JSON.stringify(items.map((p) => [p.id, p.title])));
