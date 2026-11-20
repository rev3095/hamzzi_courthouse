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
 *   Light는 $0.0015 → **$0.002** (2026-11-19 사용자 결정): 질문 해석 입력이 약 4,900토큰으로 커져(DEC-033 갱신),
 *   캐시가 식은 첫 질문에서는 해석이 캐시 쓰기 포함 약 $0.0006을 써 답변 몫이 모자랐다(근거가 빠짐).
 *   실측: Haiku 약 $0.0009, Sonnet 약 $0.02 (2026-11-18 비교 보고서), Opus 약 $0.065~0.075 (2026-11-20 예시 6건).
 *   Pro Max 상한은 $0.15 → **$0.25**, DeepSearch $0.3 → **$0.5** (DEC-050: 근거가 많은 질문에서 상한 때문에 근거를 빼지 않게 여유를 둔다).
 *   전체 금액은 기간 예산이 막는다.
 * - weight: 주간 예산 차감 단위. 1단위 = BUDGET_UNIT_USD. capUsd ÷ 단위를 올림한 값 (단위 테스트가 확인).
 *   Light $0.002는 단위의 정수배가 아니라 2단위($0.003)로 잡는다 — 기간 예산(DEC-040)은 실제 비용과의 차액을 돌려주므로 손해가 없고,
 *   주간 규칙(상한 기준 차감)에서는 Light 1건을 $0.003로 조금 크게 센다.
 */
/*
 * deep: DeepSearch(DEC-041)일 때의 상한 — 일반 질문의 2배. 구조화(Haiku) 1회 + 쟁점별 검색(무료) + 쟁점별 답변 1회라
 * 근거(조문 10·판례 5까지)와 문단(쟁점마다 최대 3개)이 늘어난다. Opus는 생각 + 답변을 7,000토큰으로 묶는다.
 * 추정: Haiku 입력 15,000($0.0015)+출력 2,400($0.0012) · Sonnet $0.03+$0.024 · Opus $0.06+$0.14. 가중치 = 상한 ÷ 단위(올림).
 * Light DeepSearch는 일반 상한 $0.002의 2배인 $0.004 (실측 $0.0025, 이전 상한 $0.003은 여유가 작았다).
 */
export const TIERS = {
  light: {
    label: "Light",
    model: "claude-haiku-5-5",
    thinking: { type: "disabled" },
    effort: "low",
    capUsd: 0.002,
    answerTokens: { max: 1_200, min: 700 },
    timeoutMs: 25_000,
    weight: 2,
    deep: { capUsd: 0.004, answerTokens: { max: 2_400, min: 1_200 }, timeoutMs: 40_000, weight: 3 },
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
    deep: { capUsd: 0.06, answerTokens: { max: 2_400, min: 1_200 }, timeoutMs: 45_000, weight: 40 },
  },
  max: {
    label: "Pro Max",
    model: "claude-opus-5-5",
    thinking: { type: "adaptive" },
    effort: "medium",
    capUsd: 0.25,
    answerTokens: { max: 5_000, min: 2_000 },
    timeoutMs: 60_000,
    weight: 167,
    deep: { capUsd: 0.5, answerTokens: { max: 7_000, min: 3_000 }, timeoutMs: 75_000, weight: 334 },
  },
} as const;

export type TierId = keyof typeof TIERS;
export type TierProfile = (typeof TIERS)[TierId] & { id: TierId };

export const TIER_IDS = Object.keys(TIERS) as TierId[];
/**
 * 처음 쓰는 사람과 단계를 보내지 않은 요청의 기본 단계 = Pro Max(Opus) (DEC-050, 2026-11-20 사용자 결정 — 이전 Pro).
 * 이미 다른 단계를 골라 둔 기기는 그 선택을 그대로 쓴다.
 */
export const DEFAULT_TIER: TierId = "max";

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
 * Light 2 · Pro 20 · Pro Max 167 · 문서 초안 1 · 절차 분류 1. $80 = 53,333단위.
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

/**
 * 기간 예산 (DEC-040, 2026-11-19 사용자 결정). 2026-11-25(한국 시간)까지는 주간 창 대신 이 기간 하나로 센다:
 * 상한 $95(`AI_PERIOD_BUDGET_USD` — 2026-11-20 잠깐 $80으로 낮췄다가 사용자 확인으로 되돌림, DEC-050), **실제로 쓴 금액만** 차감하고, 다 쓰면 기간이 끝날 때까지 무료 모드다.
 * 기간이 끝나면 위 주간 규칙(AI_WEEKLY_BUDGET_USD)으로 돌아간다.
 * 카운터 행은 파기 배치가 창 시작 8일 뒤에 지우므로 기간은 8일을 넘기지 않는다 (단위 테스트가 확인).
 */
export const PERIOD_BUDGET = {
  bucket: "ai_period_20261125",
  startsAt: "2026-11-19T00:00:00+09:00",
  /** 11월 25일 24시(한국 시간) */
  endsAt: "2026-11-26T00:00:00+09:00",
  usd: 95,
} as const;

/** 기간 예산 카운터의 금액 단위: 100만분의 1달러 (정수) */
export const MICRO_PER_USD = 1_000_000;
export const usdToMicro = (usd: number) => Math.ceil(usd * MICRO_PER_USD - 1e-6);
/** 단계 가중치(단위 $0.0015)를 그 호출의 상한 금액으로 */
export const weightToMicro = (weight: number) => usdToMicro(weight * BUDGET_UNIT_USD);

export type PeriodBudget = { bucket: string; startsAt: string; limitMicro: number };

/** 지금 기간 예산이 적용되는지. 기간 밖이면 null (주간 규칙). 0이면 유료 분석 없음, 잘못된 값은 기본값 */
export function periodBudget(now: Date = new Date(), env: Env = process.env): PeriodBudget | null {
  const t = now.getTime();
  if (t < Date.parse(PERIOD_BUDGET.startsAt) || t >= Date.parse(PERIOD_BUDGET.endsAt)) return null;
  const n = Number.parseFloat(env.AI_PERIOD_BUDGET_USD ?? "");
  const usd = Number.isFinite(n) && n >= 0 ? n : PERIOD_BUDGET.usd;
  return {
    bucket: PERIOD_BUDGET.bucket,
    startsAt: PERIOD_BUDGET.startsAt,
    limitMicro: usdToMicro(usd),
  };
}
