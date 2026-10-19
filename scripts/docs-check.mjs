// PRD·설계 문서 교차 검증. 사용: pnpm docs:check  (실패 항목이 있으면 exit 1)
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(`../docs/${f}`, import.meta.url), "utf8");
const prd = read("PRD.md");
const design = {
  ARCHITECTURE: read("ARCHITECTURE.md"),
  DATA_MODEL: read("DATA_MODEL.md"),
  API: read("API.md"),
};
const set = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1] ?? m[0]));
const minus = (a, b) => [...a].filter((x) => !b.has(x)).sort();

const problems = [];
const check = (label, list) => {
  if (list.length) problems.push(`${label}: ${list.join(", ")}`);
};

// PRD 구조
const sections = [...prd.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1]));
check("PRD 누락 섹션", [...Array(18).keys()].filter((i) => !sections.includes(i)).map(String));
const features = set(prd, /^\| (F-\d{3}) \|/gm);
const specs = set(prd, /^### (F-\d{3})/gm);
check("상세 명세 없는 기능", minus(features, specs));
check("표에 없는 기능 명세", minus(specs, features));
for (const f of specs) {
  const body = prd.split(`### ${f}`)[1].split(/\n##/)[0];
  if (!body.includes("AC1")) problems.push(`수용 기준 없음: ${f}`);
}
const prdOq = set(prd, /^\| (OQ-\d{3}) \|/gm);

// 문서 간 참조
for (const [name, text] of Object.entries(design)) {
  check(`${name}: PRD에 없는 F-ID`, minus(set(text, /F-\d{3}/g), features));
  check(`${name}: PRD에 없는 OQ`, minus(set(text, /OQ-\d{3}/g), prdOq));
}
check("API에 연결되지 않은 기능", minus(features, set(design.API, /F-\d{3}/g)));

// 문서별 OPEN QUESTION 정의
const allDesign = Object.values(design).join("\n");
for (const [name, prefix] of [
  ["ARCHITECTURE", "ARC"],
  ["DATA_MODEL", "DM"],
  ["API", "API"],
]) {
  const defined = set(design[name], new RegExp(`^\\| (?:~~)?(OQ-${prefix}-\\d{2})`, "gm"));
  check(
    `정의되지 않은 OQ-${prefix}`,
    minus(set(allDesign, new RegExp(`OQ-${prefix}-\\d{2}`, "g")), defined),
  );
}

// mermaid: subgraph와 노드 이름 충돌
for (const [i, block] of [
  ...design.ARCHITECTURE.matchAll(/```mermaid\n([\s\S]*?)```/g),
].entries()) {
  const subgraphs = [...block[1].matchAll(/subgraph (\w+)/g)].map((m) => m[1]);
  const nodes = new Set([...block[1].matchAll(/(\w+)\[/g)].map((m) => m[1]));
  check(
    `mermaid 블록 ${i} 이름 충돌`,
    subgraphs.filter((s) => nodes.has(s) && !block[1].includes(`subgraph ${s}[`)),
  );
}

if (problems.length) {
  console.error(`문서 검증 실패 ${problems.length}건\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`문서 검증 통과: PRD 섹션 18개, 기능 ${features.size}개, 설계 문서 3개 교차 참조 OK`);
