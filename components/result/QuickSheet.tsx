"use client";
// 일반 질문(100자 이하)의 한 장 요약 그림 (DEC-062). 답변 첫 문장과 그 문단이 쓴 근거를 이어 한 장으로 그린다.
// 결과에 이미 있는 값만 쓰고 모델을 부르지 않는다. 100자를 넘는 질문은 CaseBoard(7개 탭)가 대신 보인다.
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { leadSentence } from "./CaseBoard";
import { BoardDiagram, type BoardColumn } from "./diagram";
import { resultTitle, sourceRef } from "./labels";

export function QuickSheet({ result }: { result: DemoAnalysisResult }) {
  const points = result.answer.points.slice(0, 3);
  const columns: BoardColumn[] = [];
  const links: [string, string][] = [];
  if (points.length > 0) {
    const labels: string[] = [];
    const pointSrc = points.map((p) => {
      if (p.check === "model") return -1;
      const l = sourceRef(p.source, result).label;
      if (!labels.includes(l)) labels.push(l);
      return labels.indexOf(l);
    });
    columns.push(
      { title: "질문", width: 170, nodes: [{ id: "q", text: resultTitle(result), tone: "ink" }] },
      {
        title: "핵심 답변",
        width: 360,
        nodes: points.map((p, i) => ({ id: `a${i}`, text: leadSentence(p.text), tone: "cream" })),
      },
      {
        title: "근거",
        width: 210,
        nodes: labels.slice(0, 4).map((l, i) => ({ id: `s${i}`, text: l, tone: "gold" })),
      },
    );
    points.forEach((_, i) => {
      links.push(["q", `a${i}`]);
      if (pointSrc[i] >= 0 && pointSrc[i] < 4) links.push([`a${i}`, `s${pointSrc[i]}`]);
    });
  } else {
    const arts = result.articles.slice(0, 4);
    const cases = result.cases.slice(0, 3);
    if (arts.length + cases.length === 0) return null;
    columns.push(
      { title: "질문", width: 170, nodes: [{ id: "q", text: resultTitle(result), tone: "ink" }] },
      {
        title: "찾은 법령",
        width: 230,
        nodes: arts.map((a, i) => ({
          id: `l${i}`,
          text: `${a.lawName} ${a.articleNo}`,
          tone: "gold",
        })),
      },
      {
        title: "찾은 판례",
        width: 230,
        nodes: cases.map((c, i) => ({
          id: `c${i}`,
          text: `${c.court} ${c.caseNo}`,
          tone: "white",
        })),
      },
    );
    arts.forEach((_, i) => links.push(["q", `l${i}`]));
  }
  return (
    <section aria-label="한 장 요약" className="mt-5">
      <BoardDiagram
        title="한 장 요약"
        columns={columns}
        links={links}
        footer={`${result.aiNotice} · 답변 문단의 첫 문장과 그 근거를 이은 그림이에요`}
        label="한 장 요약: 질문, 핵심 답변, 근거"
        fileName="hamzzi-summary"
      />
    </section>
  );
}
