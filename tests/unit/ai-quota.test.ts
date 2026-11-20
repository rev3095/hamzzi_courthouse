// DEC-026·036 유료 분석 주간 상한 — tryAiQuota가 주간($80, DEC-031 임시) 전체 카운터 하나를 단계 가중치만큼 올린다. DB는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

const rateLimit = await import("@/lib/auth/rate-limit");
const { aiWeeklyRule, settleAiQuota, tryAiQuota } = rateLimit;
const { PERIOD_BUDGET, periodBudget } = await import("@/lib/ai/models");

/** 기간 예산(DEC-040)이 끝난 뒤 — 주간 규칙이 적용되는 때 */
const AFTER = new Date("2026-11-26T00:00:00+09:00");
/** 기간 예산 중 */
const DURING = new Date("2026-11-20T12:00:00+09:00");

// 중괄호 필수: 돌려준 값(모의 함수)을 vitest가 정리 함수로 알고 테스트 뒤에 부른다
beforeEach(() => {
  db.rpc.mockReset();
});

describe("DEC-036 주간 상한은 단위로 센다", () => {
  test("주간 창 7일(ai_units, $80 = 53,333단위). 하루 규칙은 없다", () => {
    expect(aiWeeklyRule({})).toEqual({ bucket: "ai_units", limit: 53_333, windowSeconds: 604_800 });
    expect("aiDailyRule" in rateLimit).toBe(false);
  });

  test("단계 가중치만큼 올린다 — 사이트 전체 키 'global', 가중 함수 하나만 부른다", async () => {
    db.rpc.mockResolvedValue({ data: true, error: null });
    expect(await tryAiQuota(80, {}, AFTER)).toBe(true);
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
    await tryAiQuota(undefined, {}, AFTER);
    expect(db.rpc.mock.calls[0][1].p_weight).toBe(1);
  });

  test("주간 상한을 넘으면 false", async () => {
    db.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await tryAiQuota(20, {}, AFTER)).toBe(false);
  });

  test("금액을 0으로 두면 DB를 부르지 않고 바로 막는다", async () => {
    expect(await tryAiQuota(20, { AI_WEEKLY_BUDGET_USD: "0" }, AFTER)).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("DEC-040 기간 예산 — 2026-11-25까지 $80 (DEC-050), 실제로 쓴 금액만 차감", () => {
  test("기간은 11월 25일 24시(한국 시간)까지. 끝나면 주간 규칙으로 돌아간다", () => {
    expect(periodBudget(DURING, {})).toEqual({
      bucket: "ai_period_20261125",
      startsAt: "2026-11-19T00:00:00+09:00",
      limitMicro: 80_000_000,
    });
    expect(periodBudget(new Date("2026-11-25T23:59:59+09:00"), {})).not.toBeNull();
    expect(periodBudget(AFTER, {})).toBeNull();
    expect(periodBudget(new Date("2026-11-18T23:59:59+09:00"), {})).toBeNull();
  });

  test("카운터 행이 기간 중에 파기되지 않는다 — 창 시작부터 끝까지 8일 이하", () => {
    const days = (Date.parse(PERIOD_BUDGET.endsAt) - Date.parse(PERIOD_BUDGET.startsAt)) / 86_400_000;
    expect(days).toBeLessThanOrEqual(8);
  });

  test("호출 전에 그 단계의 상한 금액을 먼저 잡아 둔다 (주간 카운터는 올리지 않는다)", async () => {
    db.rpc.mockResolvedValue({ data: true, error: null });
    expect(await tryAiQuota(100, {}, DURING)).toBe(true);
    expect(db.rpc.mock.calls).toEqual([
      [
        "reserve_ai_budget",
        {
          p_bucket: "ai_period_20261125",
          p_start: "2026-11-19T00:00:00+09:00",
          p_limit: 80_000_000,
          p_amount: 150_000,
        },
      ],
    ]);
  });

  test("$80를 넘게 되는 호출은 false — 호출한 쪽이 무료 모드로 처리한다", async () => {
    db.rpc.mockResolvedValue({ data: false, error: null });
    expect(await tryAiQuota(20, {}, DURING)).toBe(false);
  });

  test("금액을 0으로 두면 DB를 부르지 않고 바로 막는다. 주간 금액 변수는 기간 중에 쓰지 않는다", async () => {
    expect(await tryAiQuota(20, { AI_PERIOD_BUDGET_USD: "0" }, DURING)).toBe(false);
    expect(db.rpc).not.toHaveBeenCalled();
    db.rpc.mockResolvedValue({ data: true, error: null });
    await tryAiQuota(20, { AI_WEEKLY_BUDGET_USD: "1" }, DURING);
    expect(db.rpc.mock.calls[0][1].p_limit).toBe(80_000_000);
  });

  test("정산: 잡아 둔 상한에서 실제 비용을 뺀 차액을 돌려준다", async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    // Pro 상한 $0.03, 실제 $0.0204 → $0.0096 돌려줌
    await settleAiQuota(20, 0.0204, {}, DURING);
    expect(db.rpc.mock.calls).toEqual([
      [
        "settle_ai_budget",
        { p_bucket: "ai_period_20261125", p_start: "2026-11-19T00:00:00+09:00", p_refund: 9_600 },
      ],
    ]);
  });

  test("정산: 호출이 없었으면(비용 0) 전액을 돌려주고, 상한만큼 썼으면 돌려주지 않는다", async () => {
    db.rpc.mockResolvedValue({ data: null, error: null });
    await settleAiQuota(1, 0, {}, DURING);
    expect(db.rpc.mock.calls[0][1].p_refund).toBe(1_500);
    db.rpc.mockReset();
    await settleAiQuota(1, 0.0015, {}, DURING);
    await settleAiQuota(1, 0.002, {}, DURING);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  test("정산: 주간 규칙일 때는 아무 일도 하지 않는다", async () => {
    await settleAiQuota(20, 0.01, {}, AFTER);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  test("정산: DB 오류가 나도 예외를 내지 않는다 (분석 결과를 막지 않는다)", async () => {
    db.rpc.mockImplementation(() => Promise.reject(new Error("db down")));
    await settleAiQuota(20, 0.01, {}, DURING);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});
