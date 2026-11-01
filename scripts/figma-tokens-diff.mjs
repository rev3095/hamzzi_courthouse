// Figma 변수(get_variable_defs 결과 JSON)와 app/globals.css 토큰을 비교한다.
// 사용: pnpm figma:tokens <get_variable_defs 결과를 저장한 json 파일>   (차이가 있으면 exit 1)
// 키는 Figma 변수의 WEB code syntax인 "var(--이름)" 형식이다 (docs/07_Figma_연동.md 3절).
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("사용: pnpm figma:tokens <variable-defs.json>");
  process.exit(2);
}
const figmaDefs = JSON.parse(fs.readFileSync(file, "utf8"));
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const norm = (v) => String(v).trim().toLowerCase().replace(/px$/, "");
const code = new Map();
const root = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
for (const m of root.matchAll(/--([\w-]+):\s*([^;]+);/g)) code.set(m[1], norm(m[2]));
const theme = css.match(/@theme inline\s*\{([\s\S]*?)\}/)?.[1] ?? "";
for (const m of theme.matchAll(/--(radius-[\w-]+):\s*([^;]+);/g)) code.set(m[1], norm(m[2]));

const figma = new Map();
for (const [k, v] of Object.entries(figmaDefs)) {
  const m = k.match(/^var\(--([\w-]+)\)$/);
  if (m) figma.set(m[1], norm(v));
}

const changed = [];
const added = [];
for (const [name, value] of figma) {
  if (!code.has(name)) added.push(`--${name}: ${value}`);
  else if (code.get(name) !== value) changed.push(`--${name}: ${code.get(name)} → ${value}`);
}
const missing = [...code.keys()].filter((n) => !figma.has(n)).map((n) => `--${n}`);

const report = [
  ["값이 바뀜 (Figma → 코드에 반영 필요)", changed],
  ["Figma에만 있음 (globals.css에 추가 필요)", added],
  ["코드에만 있음 (Figma 견본 노드에 없음 — 노드 선택 확인)", missing],
];
let diff = false;
for (const [label, list] of report) {
  if (!list.length) continue;
  diff = true;
  console.log(`${label}:\n  ${list.join("\n  ")}`);
}
if (!diff) console.log(`토큰 일치: ${figma.size}개`);
process.exit(changed.length || added.length ? 1 : 0);
