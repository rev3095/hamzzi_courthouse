// DEC-026 라이트 답변 모델 선택 — 환경변수 해석·상한·주간 건수 (순수 함수, 실호출 없음)
import { describe, expect, test } from "vitest";
import { COST_CAP_USD, LITE_ANSWER_TOKENS, PRICES, planCall } from "./cost";
import {
  ANSWER_MODELS,
  DEFAULT_ANSWER_MODEL,
  MAX_LITE_CAP_USD,
  DEFAULT_WEEKLY_BUDGET_USD,
  answerModel,
  weeklyAiLimit,
  type AnswerModelId,
} from "./models";

const IDS = Object.keys(ANSWER_MODELS) as AnswerModelId[];

describe("DEC-026 답변 모델 고르기", () => {
  test("설정이 없으면 Sonnet 5.5 (사용자 결정 2026-11-18)", () => {
    expect(DEFAULT_ANSWER_MODEL).toBe("claude-sonnet-5-5");
    expect(answerModel({}).id).toBe("claude-sonnet-5-5");
    expect(answerModel({ AI_ANSWER_MODEL: "  " }).id).toBe("claude-sonnet-5-5");
  });

  test("Haiku로 되돌릴 수 있다 (대소문자·공백 무시)", () => {
    expect(answerModel({ AI_ANSWER_MODEL: " Claude-Haiku-5-5 " }).id).toBe("claude-haiku-5-5");
  });

  test("목록 밖 값(오타·Opus·Fable)은 비싼 쪽이 아니라 가장 싼 Haiku로", () => {
    for (const v of ["claude-opus-5-5", "claude-fable-5-2", "sonnet", "claude-sonnet-5-55"]) {
      expect(answerModel({ AI_ANSWER_MODEL: v }).id).toBe("claude-haiku-5-5");
    }
  });

  test("모델별 생각 끄기: Haiku disabled, Sonnet 5.5 between_tools (Sonnet은 disabled가 400)", () => {
    expect(ANSWER_MODELS["claude-haiku-5-5"].thinking).toEqual({ type: "disabled" });
    expect(ANSWER_MODELS["claude-sonnet-5-5"].thinking).toEqual({ type: "between_tools" });
  });
});

describe("DEC-026 질문 1건 상한", () => {
  test("모든 답변 모델이 단가표에 있고, 상한은 $0.03을 넘지 않는다", () => {
    for (const id of IDS) {
      expect(PRICES[id]).toBeDefined();
      expect(ANSWER_MODELS[id].liteCapUsd).toBeLessThanOrEqual(MAX_LITE_CAP_USD);
    }
  });

  test("입력 약 9,000토큰이면 상한 안에서 출력 1,200토큰을 낼 수 있다 (모델마다)", () => {
    for (const id of IDS) {
      const plan = planCall({
        model: id,
        spentUsd: 0,
        inputTokens: 9_000,
        maxTokens: LITE_ANSWER_TOKENS.max,
        minOutputTokens: LITE_ANSWER_TOKENS.min,
        capUsd: ANSWER_MODELS[id].liteCapUsd,
      });
      expect(plan).toEqual({ ok: true, maxTokens: LITE_ANSWER_TOKENS.max });
    }
  });

  test("Sonnet 상한을 넘을 입력(20,000토큰 = $0.04)은 계획 단계에서 막힌다", () => {
    expect(
      planCall({
        model: "claude-sonnet-5-5",
        spentUsd: 0,
        inputTokens: 20_000,
        maxTokens: LITE_ANSWER_TOKENS.max,
        minOutputTokens: LITE_ANSWER_TOKENS.min,
        capUsd: ANSWER_MODELS["claude-sonnet-5-5"].liteCapUsd,
      }),
    ).toEqual({ ok: false, reason: "budget" });
  });
});

describe("DEC-026 주간 금액 상한 $21만 (하루 상한 없음, 2026-11-18 사용자 결정)", () => {
  test("기본값 주간 $21 — 월 $100 프로모션 크레딧 ÷ 약 4.3주", () => {
    expect(DEFAULT_WEEKLY_BUDGET_USD).toBe(21);
    expect(DEFAULT_WEEKLY_BUDGET_USD * (30 / 7)).toBeLessThanOrEqual(100);
  });

  test("라이트 Sonnet: $21 ÷ $0.03 = 700건 (부동소수 오차로 699가 되지 않는다)", () => {
    expect(weeklyAiLimit({ AI_MODE: "pro" })).toBe(700);
  });

  test("라이트 Haiku 14,000건 · pro-full(Haiku 전체 $0.015) 1,400건 — 금액은 같다", () => {
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_ANSWER_MODEL: "claude-haiku-5-5" })).toBe(14_000);
    expect(COST_CAP_USD).toBe(0.015);
    expect(weeklyAiLimit({ AI_MODE: "pro-full" })).toBe(1_400);
  });

  test("금액을 바꿀 수 있다. 0이면 유료 분석 없음, 잘못된 값은 기본값", () => {
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "6.3" })).toBe(210);
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "0" })).toBe(0);
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "abc" })).toBe(700);
  });
});
