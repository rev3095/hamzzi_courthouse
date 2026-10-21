// P9 평가 자동 채점 (PRD 8.4) — 출시 기준 지표가 제대로 세어지는지.
import { describe, expect, test } from "vitest";
import { autoGrade, costUpperBound, summarize, type EvalCase } from "@/evals/demo/grade";
import { AI_NOTICE } from "@/lib/api/respond";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { EvidenceSet } from "@/lib/search/evidence";

const ev = new EvidenceSet();
ev.addArticle({
  id: "law:주택임대차보호법:제3조의3",
  lawName: "주택임대차보호법",
  articleNo: "제3조의3",
  title: "임차권등기명령",
  text: "임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차권등기명령을 신청할 수 있다.",
  effectiveFrom: null,
  sourceUrl: "https://www.law.go.kr",
});

function result(texts: string[]): DemoAnalysisResult {
  return {
    outcome: texts.length ? "grounded" : "no_result_in_scope",
    aiNotice: AI_NOTICE,
    intent: { area: "주택임대차", goal: "보증금 반환", laws: [], lawKeywords: [] },
    answer: {
      points: texts.map((text) => ({
        text,
        source: "law:주택임대차보호법:제3조의3",
        quote: "임차인은 임차권등기명령을 신청할 수 있다",
        check: "verified" as const,
      })),
    },
    articles: [],
    cases: [],
    searches: [],
    trace: [],
    searchScopeNote: "",
    recheck: { ok: true, items: [], removed: 0 },
  };
}

const CASE: EvalCase = {
  id: "t",
  tags: [],
  question: "q",
  expectAny: ["임차권등기명령"],
  expectOutcome: "grounded",
};
const stats = {
  total: 2,
  removed: 0,
  quoteMismatch: 0,
  removedBy: { not_in_evidence: 0, not_confirmed: 0, screened: 0 },
};

describe("P9 자동 채점", () => {
  test("8.4 깨끗한 결과는 허위·단정·숫자·PII 모두 0, 핵심 내용 포함", () => {
    const g = autoGrade(CASE, result(["임차권등기명령을 신청할 수 있습니다."]), stats, ev, [
      { citation: "주택임대차보호법 제3조의3", exists: true },
    ]);
    expect(g).toMatchObject({
      fabricated: 0,
      assertive: 0,
      inventedNumbers: 0,
      pii: 0,
      coverageHit: true,
      outcomeOk: true,
    });
  });

  test("8.4 남은 단정 표현·지어낸 숫자·미확인 인용·개인정보를 센다", () => {
    const g = autoGrade(
      CASE,
      result(["반드시 돌려받습니다.", "보통 37일 걸립니다.", "010-1234-5678로 연락하세요."]),
      stats,
      ev,
      [{ citation: "민법 제9999조", exists: false }],
    );
    expect(g.assertive).toBe(1);
    expect(g.inventedNumbers).toBeGreaterThanOrEqual(1);
    expect(g.fabricated).toBe(1);
    expect(g.pii).toBeGreaterThan(0);
    expect(g.coverageHit).toBe(false);
  });

  test("비용 상한과 요약", () => {
    expect(costUpperBound({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 })).toBe(4);
    const g = autoGrade(CASE, result(["임차권등기명령을 신청할 수 있습니다."]), stats, ev, []);
    const s = summarize([{ grade: g, latencyMs: 40_000, costUsd: 0.25 }]);
    expect(s["허위 인용 (기준 0)"]).toBe(0);
    expect(s["응답 시간 p95 (기준 ≤60초)"]).toBe("40.0초");
  });
});
