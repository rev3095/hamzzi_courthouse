// DEC-019 질문 1건 Claude 비용 상한 — 단가 계산과 호출 계획 (순수 함수, 실호출 없음)
import { describe, expect, test } from "vitest";
import {
  COST_CAP_USD,
  LONG_PROMPT_TOKENS,
  STAGE_TOKENS,
  estimateTokens,
  planCall,
  usageCost,
} from "./cost";

const HAIKU = "claude-haiku-5-5";

describe("DEC-019 비용 계산", () => {
  test("Haiku 5.5 단가: 입력 $0.10, 출력 $0.50, 캐시 읽기 $0.01 / 1M 토큰", () => {
    expect(usageCost(HAIKU, { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(0.1);
    expect(usageCost(HAIKU, { inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(0.5);
    expect(
      usageCost(HAIKU, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 }),
    ).toBeCloseTo(0.01);
  });

  test("단가표에 없는 모델은 상한을 지킬 수 없어 거부한다", () => {
    expect(() => usageCost("claude-opus-5-5", { inputTokens: 1, outputTokens: 1 })).toThrow();
  });

  test("글자 수 추정은 넉넉하게(1.5배) 잡는다", () => {
    expect(estimateTokens("가".repeat(100))).toBe(150);
  });

  test("단계 출력 한도를 모두 써도 출력 비용은 $0.006 이하 — 나머지는 입력 몫, 넘치면 호출 전 계획(planCall)이 막는다", () => {
    const out = STAGE_TOKENS.intent.max + STAGE_TOKENS.agent.max * 3 + STAGE_TOKENS.answer.max;
    const outputCost = usageCost(HAIKU, { inputTokens: 0, outputTokens: out });
    expect(outputCost).toBeLessThanOrEqual(0.006);
    expect(outputCost).toBeLessThan(COST_CAP_USD);
  });
});

describe("DEC-019 호출 계획", () => {
  const base = {
    model: HAIKU,
    spentUsd: 0,
    inputTokens: 10_000,
    maxTokens: 6_000,
    minOutputTokens: 2_500,
    capUsd: COST_CAP_USD,
  };

  test("예산이 넉넉하면 요청한 max_tokens 그대로", () => {
    expect(planCall(base)).toEqual({ ok: true, maxTokens: 6_000 });
  });

  test("남은 예산에 맞춰 max_tokens를 줄인다", () => {
    // 남은 돈 = 0.015 − 0.013 − 입력 0.001 = 0.001 → 출력 2,000토큰
    expect(planCall({ ...base, spentUsd: 0.013, minOutputTokens: 1_000 })).toEqual({
      ok: true,
      maxTokens: 2_000,
    });
  });

  test("최소 출력도 못 내면 부르지 않는다", () => {
    expect(planCall({ ...base, spentUsd: 0.013 })).toEqual({ ok: false, reason: "budget" });
  });

  test("답변 몫을 남겨 두면 재검색이 먼저 멈춘다", () => {
    expect(planCall({ ...base, spentUsd: 0.009, reserveUsd: 0.005, minOutputTokens: 800 })).toEqual(
      { ok: false, reason: "budget" },
    );
  });

  test("장문 단가 구간(100K 토큰 이상)은 요청하지 않는다", () => {
    expect(planCall({ ...base, inputTokens: LONG_PROMPT_TOKENS })).toEqual({
      ok: false,
      reason: "long_prompt",
    });
  });
});
