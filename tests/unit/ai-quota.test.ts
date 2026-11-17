// DEC-026 유료 분석 주간·하루 상한 — tryAiQuota가 주간($21) → 하루($5) 순서로 전체 카운터를 센다. DB는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

const { aiDailyRule, aiWeeklyRule, tryAiQuota } = await import("@/lib/auth/rate-limit");

const PRO = { AI_MODE: "pro" };

beforeEach(() => db.rpc.mockReset());

describe("DEC-026 주간·하루 상한", () => {
  test("주간 창 7일(ai_weekly, Sonnet 700건)과 하루 창(ai_daily, 166건)", () => {
    expect(aiWeeklyRule(PRO)).toEqual({ bucket: "ai_weekly", limit: 700, windowSeconds: 604_800 });
    expect(aiDailyRule(PRO)).toEqual({ bucket: "ai_daily", limit: 166, windowSeconds: 86_400 });
  });

  test("둘 다 남아 있으면 true — 주간을 먼저, 그다음 하루를 센다 (사이트 전체 키 'global')", async () => {
    db.rpc.mockResolvedValue({ data: true, error: null });
    expect(await tryAiQuota(PRO)).toBe(true);
    expect(db.rpc.mock.calls.map((c) => [c[1].p_bucket, c[1].p_key, c[1].p_window])).toEqual([
      ["ai_weekly", "global", "604800 seconds"],
      ["ai_daily", "global", "86400 seconds"],
    ]);
  });

  test("주간 상한을 넘으면 하루 카운터는 세지 않고 false", async () => {
    db.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await tryAiQuota(PRO)).toBe(false);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  test("하루 상한을 넘으면 false (주간이 남아 있어도)", async () => {
    db.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    expect(await tryAiQuota(PRO)).toBe(false);
  });

  test("금액을 0으로 두면 DB를 부르지 않고 바로 막는다", async () => {
    expect(await tryAiQuota({ ...PRO, AI_WEEKLY_BUDGET_USD: "0" })).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
