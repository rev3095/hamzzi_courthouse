// 분석(P3) + 인용 검증(P4) 전체 흐름 실호출 (F-005 AC2, DEC-009·013). 실행: pnpm test:live
// 과금된다(질문 1건). 답변 내용은 출력하지 않고 단계별 시간·검증 통계만 기록한다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runDemoAnalysis } = await import("@/lib/ai/orchestrator");
const { verifyDraft } = await import("@/lib/citations/verify");

const QUESTION =
  "전세 계약이 끝났는데 집주인이 새 세입자가 들어와야 보증금을 준다고 하면서 돌려주지 않아요. 어떻게 해야 하나요?";

describe.skipIf(!process.env.OPEN_LAW_API_KEY || !process.env.ANTHROPIC_API_KEY)(
  "분석 + 인용 검증 실호출",
  () => {
    test("F-005 AC2 검증을 통과한 문단만 60초 안에 내보낸다", async () => {
      const started = Date.now();
      const analysis = await runDemoAnalysis({ maskedText: QUESTION });
      const analyzedAt = Date.now();
      const { result, citations, stats } = await verifyDraft(analysis.draft, analysis.evidence, {
        screened: analysis.dropped.length,
      });
      const done = Date.now();
      console.info(
        JSON.stringify({
          analysisMs: analyzedAt - started,
          verifyMs: done - analyzedAt,
          totalMs: done - started,
          outcome: result.outcome,
          points: result.answer.points.map((p) => p.check),
          recheck: result.recheck.items.map((i) => i.exists),
          stats,
        }),
      );

      expect(result.answer.points.length).toBeGreaterThan(0);
      for (const p of result.answer.points) {
        expect(citations.find((c) => c.sourceRef === p.source)?.status).not.toBe("removed");
      }
      expect(citations.every((c) => c.quote === null || c.quote.length <= 60)).toBe(true);
      expect(done - started).toBeLessThan(60_000);
    });
  },
);
