// 검색 '물어보기' 답의 구조도 칸 만들기 (DEC-076) — 순수 계산. 그림 재료는 답에 이미 있는 값뿐이고 모델을 더 부르지 않는다.
// 분야 → 국내 법률 → 그 법률의 시행령·시행규칙 → 해외 대응 법령 → 쓰이는 곳 → 성립 조건 → 사례 순서로 칸을 둔다.
// 법령 칸은 lib/search/rank.ts 고정 규칙(자주 쓰는 법령 · 위계) 순서 그대로다. 사례 칸은 실제 판례가 있으면 판례, 없으면 가상 사례(점선).
import { lawTree, type SearchAnswer } from "@/lib/search/answer/policy";
import { COUNTRIES } from "@/lib/search/world/types";
import type { BoardColumn } from "../result/diagram";

const MAX_LAWS = 4;
const MAX_LOWER = 4;

export function answerBoard(a: SearchAnswer): {
  columns: BoardColumn[];
  links: [string, string][];
} {
  const links: [string, string][] = [];
  const tree = lawTree(a.laws.domestic).slice(0, MAX_LAWS);
  const root = {
    id: "field",
    text: a.field || a.query,
    sub: `검색어 · ${a.query}`,
    tone: "ink" as const,
  };

  const laws = tree.map((g, i) => ({
    id: `law${i}`,
    text: g.law.name,
    sub: [g.law.kind, g.law.core && "자주 쓰는 법령"].filter(Boolean).join(" · ") || undefined,
    tone: "gold" as const,
  }));
  const lower = tree
    .flatMap((g, i) =>
      g.lower.slice(0, 2).map((l, j) => {
        links.push([`law${i}`, `low${i}-${j}`]);
        return {
          id: `low${i}-${j}`,
          text: l.name,
          sub: l.kind ?? undefined,
          tone: "cream" as const,
        };
      }),
    )
    .slice(0, MAX_LOWER);
  laws.forEach((l) => links.push(["field", l.id]));

  const foreign = a.laws.foreign.slice(0, 3).map((l, i) => {
    links.push(["field", `fx${i}`]);
    return {
      id: `fx${i}`,
      text: l.titleKo ?? l.name,
      sub: COUNTRIES[l.country]?.name,
      tone: "white" as const,
    };
  });

  const usage = a.usage
    .slice(0, 3)
    .map((u, i) => ({ id: `use${i}`, text: u, tone: "soft" as const }));
  const firstLaw = laws[0]?.id ?? "field";
  usage.forEach((u) => links.push([firstLaw, u.id]));

  const conditions = a.conditions.slice(0, 4).map((c, i) => ({
    id: `cond${i}`,
    text: c.text,
    sub: c.confirmed ? `${c.confirmed.label} · 법제처 확인` : undefined,
    tone: "white" as const,
  }));
  if (usage.length > 0) conditions.forEach((c) => links.push([usage[0].id, c.id]));
  else conditions.forEach((c) => links.push([firstLaw, c.id]));

  const realCases = a.cases.slice(0, 3).map((c, i) => ({
    id: `case${i}`,
    text: c.caseName || c.caseNo,
    sub: [c.court, c.caseNo].filter(Boolean).join(" · "),
    tone: "cream" as const,
  }));
  const virtualCases =
    realCases.length > 0
      ? []
      : a.virtualCases.map((v, i) => ({
          id: `vc${i}`,
          text: v.title,
          sub: "AI가 만든 가상 사례",
          tone: "dash" as const,
        }));
  const caseNodes = realCases.length > 0 ? realCases : virtualCases;
  const caseFrom = conditions[0]?.id ?? usage[0]?.id ?? firstLaw;
  caseNodes.forEach((c) => links.push([caseFrom, c.id]));

  const columns: BoardColumn[] = [
    { title: "분야", nodes: [root], width: 200 },
    { title: "국내 법령", nodes: laws },
    { title: "시행령·시행규칙", nodes: lower },
    { title: "해외 대응 법령", nodes: foreign },
    { title: "어디서 쓰이나요", nodes: usage },
    { title: "성립 조건", nodes: conditions, width: 260 },
    { title: realCases.length > 0 ? "실제 판례" : "가상 사례", nodes: caseNodes },
  ];
  return { columns, links };
}
