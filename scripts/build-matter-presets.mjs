// 가상 사건 프리셋 반영 (DEC-061, 무료). evals/matter-presets/filled/*.json → lib/matters/presets.json
// 사건 번호는 DB 번호 대신 preset-1… 으로 바꾸고, 제목 순서대로 놓는다.
// 사용: node scripts/build-matter-presets.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "evals/matter-presets/filled";
const items = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")))
  .sort((a, b) => a.title.localeCompare(b.title, "ko"))
  .map((p, i) => ({ id: `preset-${i + 1}`, title: p.title, data: p.data }));
writeFileSync("lib/matters/presets.json", `${JSON.stringify(items, null, 2)}\n`);
console.log(JSON.stringify(items.map((p) => [p.id, p.title])));
