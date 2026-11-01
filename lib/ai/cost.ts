// Pro 분석 비용 상한 (DEC-019). 질문 1건의 Claude 호출 합계가 COST_CAP_USD를 넘지 않게 호출 전에 막는다.
// 순수 함수 — 단가표·비용 계산·호출 계획만. 실제 호출 감싸기는 client.ts withCostCap.
// 단가 출처: claude-api 스킬 모델 표 (2026-10-06 캐시). 바뀌면 이 표만 고친다.

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** USD / 1M 토큰. 프롬프트 100K 토큰 이하 구간 (넘으면 입력 $0.50·출력 $2.50 — LONG_PROMPT_TOKENS로 막는다) */
export const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** 질문 1건 상한 (사용자 결정: Claude Console 기준 $0.01~0.015 안팎) */
export const COST_CAP_USD = 0.015;
/** 재검색이 답변 몫을 먹지 않게 남겨 두는 금액 */
export const ANSWER_RESERVE_USD = 0.005;
/** 이 이상이면 비싼 장문 구간 단가가 붙으므로 요청하지 않는다 */
export const LONG_PROMPT_TOKENS = 100_000;

/**
 * 단계별 출력 한도. thinking을 끄고(Haiku는 effort high 이하에서 허용) 출력 길이를 고정해 비용을 예측 가능하게 한다.
 * min보다 적게 쓸 수 있으면 그 단계는 건너뛴다 (재검색 중단 / 답변 없음).
 */
export const STAGE_TOKENS = {
  intent: { max: 1_000, min: 600 },
  agent: { max: 1_500, min: 800 },
  answer: { max: 6_000, min: 2_500 },
} as const;

export type CallUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export function priceOf(model: string): Price {
  const p = PRICES[model];
  // 단가표에 없는 모델은 상한을 지킬 수 없으므로 부르지 않는다
  if (!p) throw new Error(`단가표에 없는 모델: ${model}`);
  return p;
}

export function usageCost(model: string, u: CallUsage): number {
  const p = priceOf(model);
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      (u.cacheReadTokens ?? 0) * p.cacheRead +
      (u.cacheWriteTokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

/**
 * count_tokens를 못 쓸 때의 보수적 추정. 한글은 글자당 1토큰 안팎이라 1.5배로 넉넉히 잡는다
 * (영문·JSON은 과대 추정되지만 상한을 넘는 쪽으로는 틀리지 않는다).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.5);
}

export type CallPlan =
  { ok: true; maxTokens: number } | { ok: false; reason: "long_prompt" | "budget" };

/**
 * 호출 1건을 할 수 있는지와 max_tokens를 정한다. 입력은 캐시 없이 전부 정가로 친다(최악의 경우).
 * 남은 예산(상한 − 쓴 돈 − 남겨 둘 돈 − 입력 비용)으로 낼 수 있는 출력이 minOutput보다 적으면 부르지 않는다.
 */
export function planCall(args: {
  model: string;
  spentUsd: number;
  inputTokens: number;
  maxTokens: number;
  minOutputTokens: number;
  capUsd: number;
  reserveUsd?: number;
}): CallPlan {
  if (args.inputTokens >= LONG_PROMPT_TOKENS) return { ok: false, reason: "long_prompt" };
  const p = priceOf(args.model);
  const left =
    args.capUsd - args.spentUsd - (args.reserveUsd ?? 0) - (args.inputTokens * p.input) / 1_000_000;
  const affordable = Math.floor((left * 1_000_000) / p.output);
  const maxTokens = Math.min(args.maxTokens, affordable);
  if (maxTokens < args.minOutputTokens) return { ok: false, reason: "budget" };
  return { ok: true, maxTokens };
}
