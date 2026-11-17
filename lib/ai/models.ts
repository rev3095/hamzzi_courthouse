// 라이트 답변 모델 선택 (DEC-026). 순수 규칙 — 환경변수로 고른 모델의 생각 설정·질문 1건 상한·하루 건수.
// 허용 목록 밖의 값(오타 등)은 가장 싼 Haiku로 돌아간다. 상한 계산·호출 감싸기는 cost.ts·client.ts 그대로.
import { COST_CAP_USD } from "./cost";
import { aiMode } from "./mode";

type Env = Record<string, string | undefined>;

/**
 * 라이트(AI_MODE=pro) 답변에 쓸 수 있는 모델.
 * - thinking: 생각 토큰도 출력 요금이라 끈다. Haiku는 disabled, Sonnet 5.5는 disabled가 400이라 between_tools(effort high 이하).
 * - liteCapUsd: 질문 1건 Claude 비용 상한. 입력 약 9,000 + 출력 1,200토큰 정가 기준
 *   (Haiku $0.0009+$0.0006, Sonnet $0.018+$0.012). 실측: Haiku 약 $0.0009, Sonnet 약 $0.02 (2026-11-18 비교 보고서)
 * Opus 5.5·Fable은 생각을 끌 수 없어 출력이 들쭉날쭉하므로 넣지 않는다 (2026-11-17 모델 선택 분석 6장).
 */
export const ANSWER_MODELS = {
  "claude-haiku-5-5": { thinking: { type: "disabled" }, liteCapUsd: 0.0015 },
  "claude-sonnet-5-5": { thinking: { type: "between_tools" }, liteCapUsd: 0.03 },
} as const;

export type AnswerModelId = keyof typeof ANSWER_MODELS;
export type AnswerProfile = (typeof ANSWER_MODELS)[AnswerModelId] & { id: AnswerModelId };

/** 사용자 결정(2026-11-18): 라이트 답변은 Sonnet 5.5. AI_ANSWER_MODEL=claude-haiku-5-5로 되돌린다 */
export const DEFAULT_ANSWER_MODEL: AnswerModelId = "claude-sonnet-5-5";
/** 설정값이 허용 목록 밖이면 가장 싼 모델로 (비싼 쪽으로 실패하지 않게) */
export const FALLBACK_ANSWER_MODEL: AnswerModelId = "claude-haiku-5-5";
/** 어떤 설정으로도 라이트 질문 1건 상한이 이 값을 넘지 않는다 (단위 테스트가 확인) */
export const MAX_LITE_CAP_USD = 0.03;

const isAnswerModel = (v: string): v is AnswerModelId => Object.hasOwn(ANSWER_MODELS, v);

export function answerModel(env: Env = process.env): AnswerProfile {
  const raw = env.AI_ANSWER_MODEL?.trim().toLowerCase();
  const id: AnswerModelId = !raw
    ? DEFAULT_ANSWER_MODEL
    : isAnswerModel(raw)
      ? raw
      : FALLBACK_ANSWER_MODEL;
  return { id, ...ANSWER_MODELS[id] };
}

/** 하루 최대 금액 기본값 — Sonnet 라이트($0.03)면 30건 */
export const DEFAULT_DAILY_BUDGET_USD = 0.9;
/** 건수 기본값 (DEC-020) */
export const DEFAULT_DAILY_LIMIT = 100;

const parseNonNegative = (v: string | undefined, parse: (s: string) => number) => {
  const n = parse(v ?? "");
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * 유료 분석 하루 전체 건수 (DEC-019·020·026). 건수 상한(AI_DAILY_LIMIT, 기본 100)과
 * 금액 상한(AI_DAILY_BUDGET_USD, 기본 $0.90 ÷ 지금 모드의 질문 1건 상한) 중 작은 값.
 * 모델을 비싼 쪽으로 바꿔도 하루 최대 금액이 늘지 않는다. 분석과 문서 초안을 함께 센다(초안은 Haiku $0.0015라 더 싸다).
 * 한계: 카운터는 건수라서, 같은 날 중간에 Sonnet → Haiku로 바꾸면 그날만 상한이 다시 계산돼 약 $0.1 더 쓸 수 있다
 * (예: Sonnet 30건 $0.90 뒤 Haiku 70건 $0.105). 정확히 막으려면 금액 카운터가 필요하다.
 */
export function dailyAiLimit(env: Env = process.env): number {
  const count = parseNonNegative(env.AI_DAILY_LIMIT, (s) => Number.parseInt(s, 10));
  const budget = parseNonNegative(env.AI_DAILY_BUDGET_USD, Number.parseFloat);
  const perQuestion = aiMode(env) === "pro-full" ? COST_CAP_USD : answerModel(env).liteCapUsd;
  // 0.9 / 0.03 = 29.999… 같은 부동소수 오차를 버린다
  const byBudget = Math.floor((budget ?? DEFAULT_DAILY_BUDGET_USD) / perQuestion + 1e-9);
  return Math.min(count ?? DEFAULT_DAILY_LIMIT, byBudget);
}
