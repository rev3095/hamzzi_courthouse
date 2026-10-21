// 실제 Claude + 법제처 호출로 데모 분석 흐름을 확인한다 (PRD 8.2, DEC-009·013). 실행: pnpm test:live
// 과금된다(질문 1건에 Haiku 1회 + Opus 2~4회). 답변 내용은 출력하지 않고 형태·시간·토큰만 기록한다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runDemoAnalysis } = await import("@/lib/ai/orchestrator");
const { AI_NOTICE } = await import("@/lib/api/respond");

const QUESTIONS = [
  "전세 계약이 끝났는데 집주인이 새 세입자가 들어와야 보증금을 준다고 하면서 돌려주지 않아요. 어떻게 해야 하나요?",
  "아파트 매매 계약금을 보냈는데 매도인이 마음이 바뀌었다며 계약을 깨자고 합니다. 계약금은 어떻게 되나요?",
];

describe.skipIf(!process.env.OPEN_LAW_API_KEY || !process.env.ANTHROPIC_API_KEY)(
  "데모 분석 실호출 (PRD 8.2)",
  () => {
    test.each(QUESTIONS.map((q, i) => [i + 1, q] as const))(
      "질문 %i: 근거 키 안에서만 출처를 단 초안을 60초 안에 만든다",
      async (_i, question) => {
        const started = Date.now();
        const stages: string[] = [];
        const out = await runDemoAnalysis(
          { maskedText: question },
          { onStep: (e) => stages.push(e.stage) },
        );
        const elapsed = Date.now() - started;
        const { draft } = out;
        console.info(
          JSON.stringify({
            elapsedMs: elapsed,
            outcome: draft.outcome,
            points: draft.answer.points.length,
            dropped: out.dropped,
            articles: draft.articles.length,
            cases: draft.cases.length,
            agentRounds: new Set(draft.trace.map((t) => t.round)).size,
            usage: out.usage,
          }),
        );

        expect(draft.aiNotice).toBe(AI_NOTICE);
        expect(draft.outcome).toBe("grounded");
        expect(draft.answer.points.length).toBeGreaterThan(0);
        for (const p of draft.answer.points) {
          expect(out.evidence.has(p.source)).toBe(true);
          expect(p.text).not.toMatch(/반드시|무조건|100\s*%/);
        }
        expect(new Set(stages)).toEqual(new Set(["intent", "search", "agent", "answer"]));
        expect(elapsed).toBeLessThan(60_000);
      },
    );
  },
);
