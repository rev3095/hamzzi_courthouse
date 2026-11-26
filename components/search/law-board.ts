// 법령 쉬운 설명의 구조도 칸 (DEC-076) — 순수 계산. 재료는 이미 거른 쉬운 설명·법제처 판례 목록뿐이고 모델을 더 부르지 않는다.
// 법령 → 누구에게 → 핵심 내용(근거 조문) → 성립 요건 → 지키는 방법 → 사례(실제 판례, 없으면 가상 사례 점선).
import type { EasyLawView } from "@/lib/search/easy/types";
import type { BoardColumn } from "../result/diagram";

export function lawBoard(
  d: EasyLawView,
  virtual: EasyLawView["easy"]["virtualCases"],
): { columns: BoardColumn[]; links: [string, string][] } {
  const { easy } = d;
  const links: [string, string][] = [];
  const root = {
    id: "law",
    text: d.lawName,
    sub: `조문 ${d.articles.length}개`,
    tone: "ink" as const,
  };
  const who = easy.who.slice(0, 3).map((w, i) => {
    links.push(["law", `who${i}`]);
    return { id: `who${i}`, text: w, tone: "soft" as const };
  });
  const points = easy.keyPoints.slice(0, 5).map((k, i) => {
    links.push(["law", `kp${i}`]);
    return { id: `kp${i}`, text: k.title, sub: k.articleNo ?? undefined, tone: "gold" as const };
  });
  const from = points[0]?.id ?? "law";
  const reqs = easy.requirements.slice(0, 4).map((r, i) => {
    links.push([from, `rq${i}`]);
    return { id: `rq${i}`, text: r.text, sub: r.articleNo ?? undefined, tone: "white" as const };
  });
  const altFrom = reqs[0]?.id ?? from;
  const alts = easy.alternatives.slice(0, 4).map((a, i) => {
    links.push([altFrom, `al${i}`]);
    return { id: `al${i}`, text: a.title, sub: a.articleNo ?? undefined, tone: "cream" as const };
  });
  const real = d.realCases.slice(0, 3).map((c, i) => ({
    id: `rc${i}`,
    text: c.caseName || c.caseNo,
    sub: [c.court, c.caseNo].filter(Boolean).join(" · "),
    tone: "cream" as const,
  }));
  const cases =
    real.length > 0
      ? real
      : virtual.map((v, i) => ({
          id: `vc${i}`,
          text: v.title,
          sub: "AI가 만든 가상 사례",
          tone: "dash" as const,
        }));
  cases.forEach((c) => links.push([from, c.id]));
  return {
    columns: [
      { title: "법령", nodes: [root], width: 210 },
      { title: "누구에게", nodes: who },
      { title: "핵심 내용", nodes: points },
      { title: "성립 요건", nodes: reqs, width: 260 },
      { title: "지키는 방법", nodes: alts },
      { title: real.length > 0 ? "실제 판례" : "가상 사례", nodes: cases },
    ],
    links,
  };
}
