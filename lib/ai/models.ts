// 답변 단계 (DEC-036). 순수 규칙 — 사용자가 질문마다 고르는 3단계의 모델·생각 설정·질문 1건 상한·주간 예산 가중치.
// 서버 환경변수(AI_ANSWER_MODEL, AI_MODE=pro)로 모델을 미리 정하던 방식은 폐기했다.
// 상한 계산·호출 감싸기는 cost.ts·client.ts 그대로.

type Env = Record<string, string | undefined>;

/**
 * 단계별 설정. 모든 단계는 "무료 법제처 검색 + 답변 1회"로 같고(lib/ai/lite.ts), 답변 모델만 다르다.
 * - thinking: 생각 토큰도 출력 요금이다. Haiku는 disabled, Sonnet 5.5는 disabled가 400이라 between_tools.
 *   Opus 5.5는 생각을 끌 수 없다(disabled·budget_tokens 모두 400) — adaptive + effort medium(사용자 지정, 2026-11-19).
 *   max_tokens가 생각 + 답변을 함께 묶으므로 상한은 지켜진다.
 * - effort: Light·Pro는 low, Pro Max는 medium.
 * - capUsd: 질문 1건 Claude 비용 상한(질문 해석 Haiku 포함). 입력 약 9,000토큰 + answerTokens.max 출력 정가 기준
 *   (Haiku $0.0009+$0.0006 · Sonnet $0.018+$0.012 · Opus $0.036+$0.10).
 *   실측: Haiku 약 $0.0009, Sonnet 약 $0.02 (2026-11-18 비교 보고서). Opus $0.14는 상한이고 실측 전이다(추정 $0.05~0.09).
 * - weight: 주간 예산 차감 단위. 1단위 = BUDGET_UNIT_USD. capUsd ÷ 단위를 올림한 값이어야 한다 (단위 테스트가 확인)
 */
export const TIERS = {
  light: {
    label: "Light",
    model: "claude-haiku-5-5",
    thinking: { type: "disabled" },
    effort: "low",
    capUsd: 0.0015,
    answerTokens: { max: 1_200, min: 700 },
    timeoutMs: 25_000,
    weight: 1,
  },
  pro: {
    label: "Pro",
    model: "claude-sonnet-5-5",
    thinking: { type: "between_tools" },
    effort: "low",
    capUsd: 0.03,
    answerTokens: { max: 1_200, min: 700 },
    timeoutMs: 25_000,
    weight: 20,
  },
  max: {
    label: "Pro Max",
    model: "claude-opus-5-5",
    thinking: { type: "adaptive" },
    effort: "medium",
    capUsd: 0.14,
    answerTokens: { max: 5_000, min: 2_000 },
    timeoutMs: 60_000,
    weight: 94,
  },
} as const;

export type TierId = keyof typeof TIERS;
export type TierProfile = (typeof TIERS)[TierId] & { id: TierId };

export const TIER_IDS = Object.keys(TIERS) as TierId[];
/** 단계를 보내지 않은 요청(이전 클라이언트·API 직접 호출)은 Pro — 2026-11-18 결정한 Sonnet 답변과 같다 */
export const DEFAULT_TIER: TierId = "pro";

export const isTierId = (v: unknown): v is TierId =>
  typeof v === "string" && Object.hasOwn(TIERS, v);

export function tierOf(id: TierId | null | undefined): TierProfile {
  const key = id ?? DEFAULT_TIER;
  return { id: key, ...TIERS[key] };
}

/**
 * 유료 분석 금액 상한 (DEC-026, 2026-11-18 사용자 결정): **주간 금액 하나만** (AI_WEEKLY_BUDGET_USD). 하루 상한은 두지 않는다.
 * 기본 $80 — 공모전(2026-11-20) 대비 임시값 (DEC-031). 서비스 운영 때 다시 정한다(이전 $21 = 월 $100 ÷ 약 4.3주).
 * 월 $100(Max 프로모션 크레딧, 결제 주기마다 들어오고 남으면 사라진다).
 * 한계: 주간 창(토 09:00 KST 시작)이 결제 주기와 어긋나면 한 주기(30일)에 창이 5~6개 걸칠 수 있어,
 * 많이 쓰는 경우 $100을 넘을 수 있다. 넘는 몫은 구매 크레딧에서 빠지고, 그것도 바닥나면(자동 충전 꺼짐) 요청이 멈춘다.
 */
export const DEFAULT_WEEKLY_BUDGET_USD = 80;

/**
 * 주간 예산을 세는 단위 (DEC-036). 단계가 섞여도 금액이 맞도록 건수가 아니라 단위로 센다:
 * Light 1 · Pro 20 · Pro Max 94($0.14 ÷ 단위 올림) · 문서 초안 1 · 절차 분류 1. $80 = 53,333단위.
 */
export const BUDGET_UNIT_USD = 0.0015;
/** 문서 초안(DEC-023)·절차 분류(DEC-037) 1건. 둘 다 Haiku $0.0015 이하 */
export const HELPER_WEIGHT = 1;

/** 주간 예산을 단위로 바꾼 값. 0이면 유료 분석 없음, 잘못된 값은 기본값 */
export function weeklyBudgetUnits(env: Env = process.env): number {
  const n = Number.parseFloat(env.AI_WEEKLY_BUDGET_USD ?? "");
  const budget = Number.isFinite(n) && n >= 0 ? n : DEFAULT_WEEKLY_BUDGET_USD;
  // 80 / 0.0015 = 53333.33… 같은 부동소수 오차를 버린다
  return Math.floor(budget / BUDGET_UNIT_USD + 1e-9);
}
