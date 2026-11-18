// DEC-026 라이트 답변 모델 선택 — 환경변수 해석·상한·주간 건수 (순수 함수, 실호출 없음)
import { describe, expect, test } from "vitest";
import { COST_CAP_USD, PRICES, UNDERSTAND_TOKENS, planCall, usageCost } from "./cost";
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

  test("Opus 5.5를 고를 수 있다 (DEC-031 공모전 시연)", () => {
    expect(answerModel({ AI_ANSWER_MODEL: "claude-opus-5-5" }).id).toBe("claude-opus-5-5");
  });

  test("목록 밖 값(오타·Fable)은 비싼 쪽이 아니라 가장 싼 Haiku로", () => {
    for (const v of ["claude-fable-5-2", "opus", "sonnet", "claude-sonnet-5-55", "claude-opus-5"]) {
      expect(answerModel({ AI_ANSWER_MODEL: v }).id).toBe("claude-haiku-5-5");
    }
  });

  test("모델별 생각: Haiku disabled, Sonnet 5.5 between_tools + low, Opus 5.5 adaptive + medium", () => {
    expect(ANSWER_MODELS["claude-haiku-5-5"].thinking).toEqual({ type: "disabled" });
    expect(ANSWER_MODELS["claude-sonnet-5-5"].thinking).toEqual({ type: "between_tools" });
    expect(ANSWER_MODELS["claude-sonnet-5-5"].effort).toBe("low");
    // Opus 5.5는 disabled·budget_tokens가 400 — adaptive만, 생각 양은 effort로
    expect(ANSWER_MODELS["claude-opus-5-5"].thinking).toEqual({ type: "adaptive" });
    expect(ANSWER_MODELS["claude-opus-5-5"].effort).toBe("medium");
  });
});

describe("DEC-026 질문 1건 상한", () => {
  test("모든 답변 모델이 단가표에 있고, 상한은 $0.14(Opus)를 넘지 않는다", () => {
    expect(MAX_LITE_CAP_USD).toBe(0.14);
    for (const id of IDS) {
      expect(PRICES[id]).toBeDefined();
      expect(ANSWER_MODELS[id].liteCapUsd).toBeLessThanOrEqual(MAX_LITE_CAP_USD);
    }
  });

  test("입력 약 9,000토큰이면 상한 안에서 출력 한도 전부를 낼 수 있다 (모델마다)", () => {
    for (const id of IDS) {
      const { tokens, liteCapUsd } = ANSWER_MODELS[id];
      const plan = planCall({
        model: id,
        spentUsd: 0,
        inputTokens: 9_000,
        maxTokens: tokens.max,
        minOutputTokens: tokens.min,
        capUsd: liteCapUsd,
      });
      expect(plan).toEqual({ ok: true, maxTokens: tokens.max });
    }
  });

  test("Opus: 질문 해석(Haiku 입력 2,000 + 출력 300) 뒤에도 입력 9,000토큰이면 출력 5,000토큰 전부 ($0.14 안)", () => {
    const understand = usageCost("claude-haiku-5-5", {
      inputTokens: 2_000,
      outputTokens: UNDERSTAND_TOKENS.max,
    });
    const { tokens, liteCapUsd } = ANSWER_MODELS["claude-opus-5-5"];
    expect(
      planCall({
        model: "claude-opus-5-5",
        spentUsd: understand,
        inputTokens: 9_000,
        maxTokens: tokens.max,
        minOutputTokens: tokens.min,
        capUsd: liteCapUsd,
      }),
    ).toEqual({ ok: true, maxTokens: tokens.max });
  });

  test("Opus는 생각 몫까지 출력 5,000토큰 (답변만 쓰는 1,200보다 크게)", () => {
    expect(ANSWER_MODELS["claude-opus-5-5"].tokens.max).toBe(5_000);
    expect(ANSWER_MODELS["claude-opus-5-5"].tokens.min).toBeGreaterThan(
      ANSWER_MODELS["claude-sonnet-5-5"].tokens.max,
    );
  });

  test("Sonnet 상한을 넘을 입력(20,000토큰 = $0.04)은 계획 단계에서 막힌다", () => {
    const { tokens, liteCapUsd } = ANSWER_MODELS["claude-sonnet-5-5"];
    expect(
      planCall({
        model: "claude-sonnet-5-5",
        spentUsd: 0,
        inputTokens: 20_000,
        maxTokens: tokens.max,
        minOutputTokens: tokens.min,
        capUsd: liteCapUsd,
      }),
    ).toEqual({ ok: false, reason: "budget" });
  });

  test("Opus 상한을 넘을 입력(30,000토큰 = $0.12, 출력 2,000토큰 몫이 안 남음)은 막힌다", () => {
    const { tokens, liteCapUsd } = ANSWER_MODELS["claude-opus-5-5"];
    expect(
      planCall({
        model: "claude-opus-5-5",
        spentUsd: 0,
        inputTokens: 30_000,
        maxTokens: tokens.max,
        minOutputTokens: tokens.min,
        capUsd: liteCapUsd,
      }),
    ).toEqual({ ok: false, reason: "budget" });
  });
});

describe("DEC-026 주간 금액 상한만 (하루 상한 없음, 2026-11-18 사용자 결정)", () => {
  test("DEC-031 기본값 주간 $80 — 공모전 대비 임시값", () => {
    expect(DEFAULT_WEEKLY_BUDGET_USD).toBe(80);
    // 30일 최대 약 $343 — 월 $100 프로모션 크레딧을 넘을 수 있다(넘는 몫은 구매 크레딧). 서비스 운영 때 다시 낮춘다
  });

  test("라이트 Sonnet: $80 ÷ $0.03 = 2,666건, $21이면 700건 (부동소수 오차로 699가 되지 않는다)", () => {
    expect(weeklyAiLimit({ AI_MODE: "pro" })).toBe(2666);
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "21" })).toBe(700);
  });

  test("라이트 Haiku 53,333건 · Opus 571건 · pro-full(Haiku 전체 $0.015) 5,333건 — 금액은 같다", () => {
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_ANSWER_MODEL: "claude-haiku-5-5" })).toBe(53_333);
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_ANSWER_MODEL: "claude-opus-5-5" })).toBe(571);
    expect(COST_CAP_USD).toBe(0.015);
    expect(weeklyAiLimit({ AI_MODE: "pro-full" })).toBe(5_333);
  });

  test("금액을 바꿀 수 있다. 0이면 유료 분석 없음, 잘못된 값은 기본값", () => {
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "6.3" })).toBe(210);
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "0" })).toBe(0);
    expect(weeklyAiLimit({ AI_MODE: "pro", AI_WEEKLY_BUDGET_USD: "abc" })).toBe(2666);
  });
});
