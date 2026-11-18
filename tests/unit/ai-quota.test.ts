// DEC-026·036 유료 분석 주간 상한 — tryAiQuota가 주간($80, DEC-031 임시) 전체 카운터 하나를 단계 가중치만큼 올린다. DB는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

const rateLimit = await import("@/lib/auth/rate-limit");
const { aiWeeklyRule, tryAiQuota } = rateLimit;

beforeEach(() => db.rpc.mockReset());

describe("DEC-036 주간 상한은 단위로 센다", () => {
  test("주간 창 7일(ai_units, $80 = 53,333단위). 하루 규칙은 없다", () => {
    expect(aiWeeklyRule({})).toEqual({ bucket: "ai_units", limit: 53_333, windowSeconds: 604_800 });
    expect("aiDailyRule" in rateLimit).toBe(false);
  });

  test("단계 가중치만큼 올린다 — 사이트 전체 키 'global', 가중 함수 하나만 부른다", async () => {
    db.rpc.mockResolvedValue({ data: true, error: null });
    expect(await tryAiQuota(80, {})).toBe(true);
    expect(db.rpc.mock.calls).toEqual([
      [
        "hit_rate_limit_weighted",
        {
          p_bucket: "ai_units",
          p_key: "global",
          p_limit: 53_333,
          p_window: "604800 seconds",
          p_weight: 80,
        },
      ],
    ]);
  });

  test("가중치를 주지 않으면 1 (문서 초안·절차 분류)", async () => {
    db.rpc.mockResolvedValue({ data: true, error: null });
    await tryAiQuota();
    expect(db.rpc.mock.calls[0][1].p_weight).toBe(1);
  });

  test("주간 상한을 넘으면 false", async () => {
    db.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await tryAiQuota(20, {})).toBe(false);
  });

  test("금액을 0으로 두면 DB를 부르지 않고 바로 막는다", async () => {
    expect(await tryAiQuota(20, { AI_WEEKLY_BUDGET_USD: "0" })).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
