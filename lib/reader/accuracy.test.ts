// 오프라인 판독기 정확도 (DEC-048) — 무료 로컬 채점. 모델을 부르지 않는다.
// - 정답 묶음: evals/labels/eval-set.jsonl (직접 쓴 62문항, 정답은 사람이 붙임). 판독 규칙을 고칠 때 이 숫자가 떨어지면 안 된다.
// - 참고 묶음: evals/labels/labeled.jsonl (법제처 생활법령 질문 800개, Haiku가 붙인 라벨 — 정답이 아니라 일치율만 본다).
// - 개발 묶음: lib/reader/dev-cases.ts (낱말 사전을 고칠 때 쓰는 질문. 정답 묶음과 겹치지 않게 따로 썼다).
// pnpm reader:score(또는 READER_REPORT=1)면 틀린 문항을 evals/reader/report.txt로 쓴다 (gitignore). 커뮤니티 원문 경로는 READER_COMMUNITY.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { DEV_CASES } from "./dev-cases";
import { classifyCase } from "@/lib/procedure/policy";
import { readOffline } from "./read";

type Row = { id: string; question: string; gold: string[]; others: string[]; kind?: string };

const jsonl = (path: string) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().startsWith("{") && l.includes('"id"'))
    .map((l) => JSON.parse(l));

const label = (q: string) => {
  const r = readOffline({ question: q });
  return r.status === "read" ? { label: r.label, also: r.also as string[] } : { label: "none", also: [] };
};

function score(rows: Row[]) {
  let top = 0;
  let any = 0;
  const miss: string[] = [];
  for (const r of rows) {
    const { label: l, also } = label(r.question);
    const accept = [...r.gold, ...r.others];
    if (accept.includes(l)) top++;
    if (accept.includes(l) || also.some((a) => r.gold.includes(a))) any++;
    else miss.push(`${r.id}${r.kind ? ` ${r.kind}` : ""} got=${l}${also.length ? `(+${also.join(",")})` : ""} gold=${r.gold.join("/")} :: ${r.question}`);
  }
  return { n: rows.length, top, any, miss };
}

const report: string[] = [];
const done = () => {
  // pnpm reader:score 로 돌리거나 READER_REPORT=1 이면 보고서를 쓴다 (pnpm test 때는 쓰지 않는다)
  if (!process.env.READER_REPORT && process.env.npm_lifecycle_event !== "reader:score") return;
  mkdirSync("evals/reader", { recursive: true });
  writeFileSync("evals/reader/report.txt", report.join("\n") + "\n");
};

test("정답 묶음 (직접 쓴 62문항)", () => {
  const rows: Row[] = jsonl("evals/labels/eval-set.jsonl").map((r) => ({
    id: r.id, question: r.question, gold: r.gold, others: r.goldOthers ?? [], kind: r.kind,
  }));
  const s = score(rows);
  report.push(`GOLD top ${s.top}/${s.n} · 함께 걸린 것까지 ${s.any}/${s.n}`, ...s.miss, "");
  done();
  // 기존 낱말 규칙(lib/procedure/policy)만으로는 42/62, 판독기 첫 판은 61/62 (2026-11-20).
  // 낱말 사전을 만들 때 기존 규칙이 틀린 문항을 보았으므로 이 숫자는 보지 않은 성능이 아니다 — 커뮤니티 뒤 30건을 본다
  expect(s.top).toBeGreaterThanOrEqual(58);
});

test("개발 묶음", () => {
  const rows: Row[] = DEV_CASES.map((c, i) => ({ id: `dev-${i + 1}`, question: c.q, gold: [c.label], others: c.others ?? [] }));
  const s = score(rows);
  report.push(`DEV top ${s.top}/${s.n}`, ...s.miss, "");
  done();
  expect(s.top / s.n).toBeGreaterThanOrEqual(0.9);
});

test("참고 묶음 (생활법령 질문, Haiku 라벨과 일치율)", () => {
  const rows: Row[] = jsonl("evals/labels/labeled.jsonl")
    .filter((r) => typeof r.section === "string")
    .map((r) => ({ id: r.id, question: r.question, gold: [r.section], others: r.others ?? [] }));
  const s = score(rows);
  const none = rows.filter((r) => r.gold[0] === "none");
  const noneOk = none.filter((r) => label(r.question).label === "none").length;
  report.push(`SILVER 일치 ${s.top}/${s.n} · none 일치 ${noneOk}/${none.length}`, ...s.miss, "");
  done();
  expect(s.n).toBeGreaterThan(0);
});

// 커뮤니티 60건 (DEC-044): 원문은 이 PC의 evals/labels/community/에만 있다(gitignore). 없으면 건너뛴다.
// 낱말 사전을 만들 때 보지 않은 묶음이라 실제 성능에 가장 가깝다. 보고서에는 번호만 쓰고 원문은 옮기지 않는다.
const COMMUNITY = process.env.READER_COMMUNITY ?? "evals/labels/community/dc-law.jsonl";
const hasCommunity = (() => {
  try {
    readFileSync(COMMUNITY);
    return true;
  } catch {
    return false;
  }
})();

test.skipIf(!hasCommunity)("커뮤니티 묶음 (보지 않은 60건)", () => {
  const gold = new Map<string, { gold: string[]; kind: string }>(
    jsonl("evals/labels/community-gold.jsonl").map((r) => [r.id, { gold: [...r.gold, ...(r.goldOthers ?? [])], kind: r.kind }]),
  );
  const rows = jsonl(COMMUNITY).filter((r) => gold.has(r.id));
  let ok = 0;
  const miss: string[] = [];
  const byConf = new Map<string, number>();
  // 앞 30건은 낱말 사전을 고칠 때 틀린 글을 읽었고, 뒤 30건은 읽지 않은 시험용이다
  const first = { ok: 0, n: 0 };
  const second = { ok: 0, n: 0 };
  for (const r of rows) {
    const g = gold.get(r.id)!;
    const res = readOffline({ question: r.question });
    const l = res.status === "read" ? res.label : "none";
    const conf = res.status === "read" ? res.confidence : "too_short";
    const right = g.gold.includes(l);
    if (right) ok++;
    else miss.push(`${r.id} ${g.kind} got=${l} (${conf}) gold=${g.gold.join("/")}`);
    const half = Number(r.id.replace(/\D/g, "")) <= 30 ? first : second;
    half.n++;
    if (right) half.ok++;
    const key = `${right ? "맞음" : "틀림"}·${conf}`;
    byConf.set(key, (byConf.get(key) ?? 0) + 1);
  }
  // 비교: 기존 낱말 규칙(lib/procedure/policy)만 썼을 때
  const bare = { intent: { area: "", goal: "", laws: [], lawKeywords: [] }, articles: [] };
  const baseOk = (r: { id: string; question: string }) => {
    const c = classifyCase(bare as never, r.question);
    return gold.get(r.id)!.gold.includes(c === "other" || c === "defendant" ? "none" : c);
  };
  const baseSecond = rows.filter((r) => Number(r.id.replace(/\D/g, "")) > 30 && baseOk(r)).length;
  const base = rows.filter((r) => {
    const c = classifyCase(bare as never, r.question);
    return gold.get(r.id)!.gold.includes(c === "other" || c === "defendant" ? "none" : c);
  }).length;
  report.push(
    `COMMUNITY ${ok}/${rows.length} (기존 규칙 ${base}/${rows.length}) · 앞 30건(고칠 때 읽음) ${first.ok}/${first.n} · 뒤 30건(읽지 않음) ${second.ok}/${second.n} (기존 규칙 ${baseSecond}/${second.n})`,
    `확신 정도별: ${[...byConf.entries()].sort().map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    ...miss,
    "",
  );
  done();
  expect(ok).toBeGreaterThanOrEqual(44);
});
