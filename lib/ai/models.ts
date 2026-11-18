// 라이트 답변 모델 선택 (DEC-026). 순수 규칙 — 환경변수로 고른 모델의 생각 설정·질문 1건 상한·하루 건수.
// 허용 목록 밖의 값(오타 등)은 가장 싼 Haiku로 돌아간다. 상한 계산·호출 감싸기는 cost.ts·client.ts 그대로.
import { COST_CAP_USD } from "./cost";
import { aiMode } from "./mode";

type Env = Record<string, string | undefined>;

/**
 * 라이트(AI_MODE=pro) 답변에 쓸 수 있는 모델.
 * - thinking·effort: 생각 토큰도 출력 요금이다. Haiku는 disabled, Sonnet 5.5는 disabled가 400이라 between_tools(effort low).
 *   Opus 5.5는 생각을 끌 수 없다(disabled·budget_tokens 모두 400) — adaptive + effort medium(사용자 지정, 2026-11-19 DEC-031).
 * - tokens: 답변 호출 출력 한도. 생각 토큰도 max_tokens에 들어가므로 Opus는 생각 몫까지 넉넉히 둔다(답변 JSON 약 800토큰 + 생각).
 *   min보다 적게 낼 예산이면 부르지 않는다(근거만 낸다).
 * - timeoutMs: 답변 호출 시간 한도. Opus는 생각까지 쓰므로 길게(분석 라우트 maxDuration 120초 안).
 * - liteCapUsd: 질문 1건 Claude 비용 상한(질문 해석 Haiku 포함). 입력 약 9,000토큰 + 출력 tokens.max 정가 기준
 *   Haiku $0.0009+$0.0006 · Sonnet $0.018+$0.012 · Opus $0.036+$0.10.
 *   실측: Haiku 약 $0.0009, Sonnet 약 $0.02 (2026-11-18 비교 보고서). Opus는 실측 전 추정 $0.05~0.09
 * Fable은 넣지 않는다 (2026-11-17 모델 선택 분석 6장). 비교: docs/reports/2026-11-19_모델별_구조_비용_보고서.md
 */
export const ANSWER_MODELS = {
  "claude-haiku-5-5": {
    thinking: { type: "disabled" },
    effort: "low",
    tokens: { max: 1_200, min: 700 },
    timeoutMs: 25_000,
    liteCapUsd: 0.0015,
  },
  "claude-sonnet-5-5": {
    thinking: { type: "between_tools" },
    effort: "low",
    tokens: { max: 1_200, min: 700 },
    timeoutMs: 25_000,
    liteCapUsd: 0.03,
  },
  "claude-opus-5-5": {
    thinking: { type: "adaptive" },
    effort: "medium",
    tokens: { max: 5_000, min: 2_000 },
    timeoutMs: 60_000,
    liteCapUsd: 0.14,
  },
} as const;

export type AnswerModelId = keyof typeof ANSWER_MODELS;
export type AnswerProfile = (typeof ANSWER_MODELS)[AnswerModelId] & { id: AnswerModelId };

/**
 * 사용자 결정(2026-11-18): 라이트 답변은 Sonnet 5.5. AI_ANSWER_MODEL=claude-opus-5-5로 Opus(공모전 시연, DEC-031),
 * claude-haiku-5-5로 가장 싼 답변으로 바꾼다
 */
export const DEFAULT_ANSWER_MODEL: AnswerModelId = "claude-sonnet-5-5";
/** 설정값이 허용 목록 밖이면 가장 싼 모델로 (비싼 쪽으로 실패하지 않게) */
export const FALLBACK_ANSWER_MODEL: AnswerModelId = "claude-haiku-5-5";
/** 어떤 설정으로도 라이트 질문 1건 상한이 이 값을 넘지 않는다 (단위 테스트가 확인). Opus 5.5 = $0.14 */
export const MAX_LITE_CAP_USD = 0.14;

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

/**
 * 유료 분석 금액 상한 (DEC-026, 2026-11-18 사용자 결정): **주간 금액 하나만** (AI_WEEKLY_BUDGET_USD). 하루 상한은 두지 않는다.
 * 기본 $80 — 공모전(2026-11-20) 대비 임시값 (DEC-031). 서비스 운영 때 다시 정한다(이전 $21 = 월 $100 ÷ 약 4.3주).
 * 월 $100(Max 프로모션 크레딧, 결제 주기마다 들어오고 남으면 사라진다).
 * 한계: 주간 창(토 09:00 KST 시작)이 결제 주기와 어긋나면 한 주기(30일)에 창이 5~6개 걸칠 수 있어,
 * 많이 쓰는 경우 $100을 넘을 수 있다. 넘는 몫은 구매 크레딧에서 빠지고, 그것도 바닥나면(자동 충전 꺼짐) 요청이 멈춘다.
 * 프로모션 크레딧이 구매 크레딧보다 먼저 쓰인다(공식 문서).
 */
export const DEFAULT_WEEKLY_BUDGET_USD = 80;

const parseNonNegative = (v: string | undefined, parse: (s: string) => number) => {
  const n = parse(v ?? "");
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** 지금 모드에서 질문 1건이 쓸 수 있는 최대 금액. 문서 초안(Haiku $0.0015)은 이보다 싸다 */
function perQuestionCap(env: Env): number {
  return aiMode(env) === "pro-full" ? COST_CAP_USD : answerModel(env).liteCapUsd;
}

// 21 / 0.03 = 699.99… 같은 부동소수 오차를 버린다
const countFor = (budgetUsd: number, env: Env) =>
  Math.floor(budgetUsd / perQuestionCap(env) + 1e-9);

/**
 * 유료 분석 주간 전체 건수 = AI_WEEKLY_BUDGET_USD(기본 $80, DEC-031 임시) ÷ 질문 1건 상한.
 * Sonnet 2,666건 · Opus 571건 · Haiku 53,333건 · pro-full 5,333건.
 * 분석과 문서 초안을 함께 센다. 모델을 비싼 쪽으로 바꿔도 주간 최대 금액이 늘지 않는다.
 * 한계: 카운터는 건수라서, 주 중간에 비싼 모델 → 싼 모델로 바꾸면 그 주만 상한이 다시 계산돼 더 쓸 수 있다
 * (Opus 571건 뒤 Sonnet으로 바꾸면 그 주 최대 약 $143). 모델은 주간 창이 바뀌는 토 09:00 KST 이후에 낮춘다.
 */
export function weeklyAiLimit(env: Env = process.env): number {
  const budget = parseNonNegative(env.AI_WEEKLY_BUDGET_USD, Number.parseFloat);
  return countFor(budget ?? DEFAULT_WEEKLY_BUDGET_USD, env);
}
