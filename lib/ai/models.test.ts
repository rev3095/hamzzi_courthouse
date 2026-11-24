// DEC-036 답변 단계 — 단계별 모델·상한·주간 예산 단위 (순수 함수, 실호출 없음)
import { describe, expect, test } from "vitest";
import { PRICES, planCall } from "./cost";
import { aiMode } from "./mode";
import {
  BUDGET_UNIT_USD,
  DEFAULT_TIER,
  DEFAULT_WEEKLY_BUDGET_USD,
  HELPER_WEIGHT,
  TIERS,
  TIER_IDS,
  isTierId,
  tierOf,
  weeklyBudgetUnits,
} from "./models";

describe("DEC-036 단계 고르기", () => {
  test("세 단계: Light = Haiku, Pro = Sonnet, Pro Max = Opus", () => {
    expect(TIER_IDS).toEqual(["light", "pro", "max"]);
    expect(TIERS.light.model).toBe("claude-haiku-5-5");
    expect(TIERS.pro.model).toBe("claude-sonnet-5-5");
    expect(TIERS.max.model).toBe("claude-opus-5-5");
  });

  test("DEC-050 단계를 보내지 않으면 Pro Max, 정해진 세 값만 단계로 인정한다", () => {
    expect(DEFAULT_TIER).toBe("max");
    expect(tierOf(null).id).toBe("max");
    expect(tierOf(undefined).model).toBe("claude-opus-5-5");
    expect(tierOf("max").id).toBe("max");
    for (const v of ["opus", "MAX", "", null, 1, "claude-opus-5-5", "__proto__"]) {
      expect(isTierId(v)).toBe(false);
    }
  });

  test("생각 설정: Haiku disabled, Sonnet between_tools, Opus는 끌 수 없어 adaptive + effort xhigh", () => {
    expect(TIERS.light.thinking).toEqual({ type: "disabled" });
    expect(TIERS.pro.thinking).toEqual({ type: "between_tools" });
    expect(TIERS.max.thinking).toEqual({ type: "adaptive" });
    expect([TIERS.light.effort, TIERS.pro.effort, TIERS.max.effort]).toEqual([
      "low",
      "low",
      "xhigh",
    ]);
  });
});

describe("DEC-036 질문 1건 상한", () => {
  test("모든 단계의 모델이 단가표에 있고, 상한은 $0.6을 넘지 않는다 (DEC-050, 2026-11-25 Opus xhigh)", () => {
    for (const id of TIER_IDS) {
      expect(PRICES[TIERS[id].model]).toBeDefined();
      expect(TIERS[id].capUsd).toBeLessThanOrEqual(0.6);
    }
    expect([TIERS.light.capUsd, TIERS.pro.capUsd, TIERS.max.capUsd]).toEqual([0.002, 0.03, 0.6]);
  });

  test("입력 약 9,000토큰이면 상한 안에서 그 단계의 출력 한도를 다 낼 수 있다", () => {
    for (const id of TIER_IDS) {
      const t = TIERS[id];
      const plan = planCall({
        model: t.model,
        spentUsd: 0,
        inputTokens: 9_000,
        maxTokens: t.answerTokens.max,
        minOutputTokens: t.answerTokens.min,
        capUsd: t.capUsd,
      });
      expect(plan).toEqual({ ok: true, maxTokens: t.answerTokens.max });
    }
  });

  test("상한을 넘을 입력은 계획 단계에서 막힌다 (Sonnet 20,000토큰 · Opus 120,000토큰)", () => {
    // Opus xhigh(상한 $0.6)는 장문 구간(100,000토큰) 전에는 금액으로 막히지 않아 장문 구간에서 막힌다
    for (const [id, inputTokens, reason] of [
      ["pro", 20_000, "budget"],
      ["max", 120_000, "long_prompt"],
    ] as const) {
      const t = TIERS[id];
      expect(
        planCall({
          model: t.model,
          spentUsd: 0,
          inputTokens,
          maxTokens: t.answerTokens.max,
          minOutputTokens: t.answerTokens.min,
          capUsd: t.capUsd,
        }),
      ).toEqual({ ok: false, reason });
    }
  });
});

describe("DEC-036 주간 예산은 단위로 센다 (하루 상한 없음)", () => {
  test("가중치 = 질문 1건 상한 ÷ 단위 금액을 올림 (상한보다 적게 잡지 않는다)", () => {
    expect(BUDGET_UNIT_USD).toBe(0.0015);
    for (const id of TIER_IDS) {
      for (const t of [TIERS[id], TIERS[id].deep]) {
        expect(t.weight).toBe(Math.ceil(t.capUsd / BUDGET_UNIT_USD - 1e-9));
        expect(t.weight * BUDGET_UNIT_USD).toBeGreaterThanOrEqual(t.capUsd - 1e-12);
      }
    }
    // 2026-11-19 사용자 결정: Light 상한 $0.002 → 2단위 / DeepSearch $0.004 → 3단위
    expect([TIERS.light.weight, TIERS.light.deep.weight]).toEqual([2, 3]);
    expect(HELPER_WEIGHT).toBe(1);
  });

  test("기본 $80 = 53,333단위 (DEC-031 임시값). $21이면 14,000단위", () => {
    expect(DEFAULT_WEEKLY_BUDGET_USD).toBe(80);
    expect(weeklyBudgetUnits({})).toBe(53_333);
    expect(weeklyBudgetUnits({ AI_WEEKLY_BUDGET_USD: "21" })).toBe(14_000);
  });

  test("금액을 바꿀 수 있다. 0이면 유료 분석 없음, 잘못된 값은 기본값", () => {
    expect(weeklyBudgetUnits({ AI_WEEKLY_BUDGET_USD: "0" })).toBe(0);
    expect(weeklyBudgetUnits({ AI_WEEKLY_BUDGET_USD: "abc" })).toBe(53_333);
    expect(weeklyBudgetUnits({ AI_WEEKLY_BUDGET_USD: "-5" })).toBe(53_333);
  });
});

describe("DEC-036 끄는 스위치만 남긴다", () => {
  test("AI_MODE=free면 키가 있어도 무료 모드", () => {
    expect(aiMode({ AI_MODE: " FREE ", ANTHROPIC_API_KEY: "k" })).toBe("free");
  });

  test("키가 없으면 무료 모드 — CI·키 없는 개발 환경에서 과금되지 않는다", () => {
    expect(aiMode({})).toBe("free");
    expect(aiMode({ ANTHROPIC_API_KEY: "  " })).toBe("free");
  });

  test("키가 있으면 유료. 예전 값 pro·pro-full은 더 읽지 않는다", () => {
    expect(aiMode({ ANTHROPIC_API_KEY: "k" })).toBe("paid");
    expect(aiMode({ AI_MODE: "pro-full", ANTHROPIC_API_KEY: "k" })).toBe("paid");
    expect(aiMode({ AI_MODE: "pro" })).toBe("free");
  });
});
