// DEC-026 유료 분석 주간 상한 — tryAiQuota가 주간($80, DEC-031 임시) 전체 카운터 하나만 센다(하루 상한 없음). DB는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

const rateLimit = await import("@/lib/auth/rate-limit");
const { aiWeeklyRule, tryAiQuota } = rateLimit;

const PRO = { AI_MODE: "pro" };

beforeEach(() => db.rpc.mockReset());

describe("DEC-026 주간 상한만", () => {
  test("주간 창 7일(ai_weekly, 라이트 Sonnet 2,666건). 하루 규칙은 없다", () => {
    expect(aiWeeklyRule(PRO)).toEqual({ bucket: "ai_weekly", limit: 2666, windowSeconds: 604_800 });
    expect("aiDailyRule" in rateLimit).toBe(false);
  });

  test("남아 있으면 true — 사이트 전체 키 'global'로 주간 카운터 하나만 센다", async () => {
    db.rpc.mockResolvedValue({ data: true, error: null });
    expect(await tryAiQuota(PRO)).toBe(true);
    expect(db.rpc.mock.calls.map((c) => [c[1].p_bucket, c[1].p_key, c[1].p_window])).toEqual([
      ["ai_weekly", "global", "604800 seconds"],
    ]);
  });

  test("주간 상한을 넘으면 false", async () => {
    db.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await tryAiQuota(PRO)).toBe(false);
  });

  test("금액을 0으로 두면 DB를 부르지 않고 바로 막는다", async () => {
    expect(await tryAiQuota({ ...PRO, AI_WEEKLY_BUDGET_USD: "0" })).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
