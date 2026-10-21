// P9 데모 평가 — 자동 채점 (PRD 8.4). 순수 함수: 결과 하나를 받아 지표를 돌려준다.
// 허위 인용 재조회 결과는 실행기가 법제처에서 받아 넘긴다.
import { isAssertive, screenPoints } from "@/lib/ai/policy";
import type { DemoAnalysisResult, VerifyStats } from "@/lib/citations/policy";
import { scanInput } from "@/lib/pii";
import type { EvidenceSet } from "@/lib/search/evidence";

export type EvalCase = {
  id: string;
  tags: string[];
  question: string;
  /** 답변 본문에 하나라도 나오면 "핵심 내용 포함"으로 본다 (재현율 대용, 정답 아님) */
  expectAny: string[];
  expectOutcome: "grounded" | "either";
  checks?: string[];
};

export type AutoGrade = {
  outcome: DemoAnalysisResult["outcome"];
  outcomeOk: boolean;
  points: number;
  verified: number;
  quoteMismatch: number;
  /** 검증·1차 거르기에서 빠진 문단 / 전체 초안 문단 */
  removed: number;
  draftTotal: number;
  /** 최종 결과에 남은 인용 중 재조회로 실존이 확인되지 않은 것 (출시 기준 0) */
  fabricated: number;
  citationsChecked: number;
  /** 단정 표현이 남은 문단·의도 요약 수 (출시 기준 0) */
  assertive: number;
  /** 출처 원문에 없는 숫자가 남은 문단 수 (출시 기준 0) */
  inventedNumbers: number;
  /** 출력에서 탐지된 개인정보 수 (출시 기준 0) */
  pii: number;
  /** expectAny 중 하나라도 답변에 나왔는가 */
  coverageHit: boolean;
  articlesUsed: number;
  casesUsed: number;
  agentRounds: number;
};

export function outputText(result: DemoAnalysisResult): string {
  return [
    result.intent.area,
    result.intent.goal,
    ...result.answer.points.flatMap((p) => [p.text, p.quote]),
  ].join("\n");
}

export function autoGrade(
  c: EvalCase,
  result: DemoAnalysisResult,
  stats: VerifyStats,
  evidence: EvidenceSet,
  recheck: { citation: string; exists: boolean | null }[],
): AutoGrade {
  const points = result.answer.points;
  const text = points.map((p) => p.text).join("\n");
  const rescreen = screenPoints(
    points.map((p) => ({ text: p.text, source: p.source, quote: p.quote })),
    evidence,
  );
  const assertive =
    points.filter((p) => isAssertive(p.text)).length + (isAssertive(result.intent.goal) ? 1 : 0);
  return {
    outcome: result.outcome,
    outcomeOk: c.expectOutcome === "either" || result.outcome === c.expectOutcome,
    points: points.length,
    verified: points.filter((p) => p.check === "verified").length,
    quoteMismatch: points.filter((p) => p.check === "quote_mismatch").length,
    removed: stats.removed,
    draftTotal: stats.total,
    fabricated: recheck.filter((r) => r.exists !== true).length,
    citationsChecked: recheck.length,
    assertive,
    inventedNumbers: rescreen.dropped.filter((d) => d === "number_not_in_source").length,
    pii: scanInput(outputText(result)).findings.reduce((n, f) => n + f.count, 0),
    coverageHit: c.expectAny.some((k) => text.includes(k)),
    articlesUsed: result.articles.filter((a) => a.used).length,
    casesUsed: result.cases.filter((x) => x.used).length,
    agentRounds: new Set(result.trace.map((t) => t.round)).size,
  };
}

/** 모델 가격 (달러/백만 토큰, 2026-10 기준). 사용량이 모델별로 나뉘지 않아 Opus 가격으로 잡은 상한이다 */
export const OPUS_PRICE = { input: 4, output: 20, cacheRead: 0.2 };

export function costUpperBound(u: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}): number {
  return (
    (u.inputTokens * OPUS_PRICE.input +
      u.outputTokens * OPUS_PRICE.output +
      u.cacheReadTokens * OPUS_PRICE.cacheRead) /
    1_000_000
  );
}

export type Summary = Record<string, number | string>;

/** 출시 기준(PRD 8.4)과 같은 형태로 모은다 */
export function summarize(
  rows: { grade: AutoGrade; latencyMs: number; costUsd: number }[],
): Summary {
  const n = rows.length;
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const points = sum((r) => r.grade.points);
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p95 =
    latencies[Math.min(latencies.length - 1, Math.ceil(0.95 * latencies.length) - 1)] ?? 0;
  return {
    cases: n,
    "허위 인용 (기준 0)": sum((r) => r.grade.fabricated),
    "단정 표현 (기준 0)": sum((r) => r.grade.assertive),
    "원문에 없는 숫자 (기준 0)": sum((r) => r.grade.inventedNumbers),
    "개인정보 노출 (기준 0)": sum((r) => r.grade.pii),
    "출처 연결률 verified/문단 (기준 ≥95%)": points
      ? `${((100 * sum((r) => r.grade.verified)) / points).toFixed(1)}%`
      : "-",
    "문단 제거율": `${(
      (100 * sum((r) => r.grade.removed)) /
      Math.max(
        1,
        sum((r) => r.grade.draftTotal),
      )
    ).toFixed(1)}%`,
    "결과 있음 (grounded)": `${rows.filter((r) => r.grade.outcome === "grounded").length}/${n}`,
    "핵심 내용 포함": `${rows.filter((r) => r.grade.coverageHit).length}/${n}`,
    "평균 문단 수": (points / Math.max(1, n)).toFixed(1),
    "응답 시간 p95 (기준 ≤60초)": `${(p95 / 1000).toFixed(1)}초`,
    "비용 합계 (상한)": `$${sum((r) => r.costUsd).toFixed(2)}`,
  };
}
