// 무료 모드 실호출 (DEC-015). 법제처 Open API(무료)만 부른다 — Claude 호출 없음, 과금 없음. 실행: pnpm test:live
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runFreeAnalysis } = await import("@/lib/demo/free");
const { demoExamples } = await import("@/lib/demo/policy");

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("무료 모드 법제처 실호출", () => {
  test("자유 질문은 법제처에서 관련 조문·판례 목록을 찾는다 (답변 문단 없음)", async () => {
    const out = await runFreeAnalysis(
      "월세 계약 중에 집주인이 집을 팔았는데 새 집주인이 나가라고 합니다. 계속 살 수 있나요?",
    );
    console.info(
      JSON.stringify({
        mode: out.result.mode,
        outcome: out.result.outcome,
        articles: out.result.articles.map((a) => `${a.lawName} ${a.articleNo}`),
        cases: out.result.cases.length,
        searches: out.result.searches,
      }),
    );
    expect(out.result.mode).toBe("search_only");
    expect(out.result.answer.points).toEqual([]);
    expect(out.result.articles.length).toBeGreaterThan(0);
  });

  test("예시 질문은 법제처도 부르지 않고 재생한다", async () => {
    const out = await runFreeAnalysis(demoExamples()[0].question);
    expect(out.result.mode).toBe("replay");
  });
});
