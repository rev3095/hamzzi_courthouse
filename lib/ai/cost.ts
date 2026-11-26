// Pro 분석 비용 상한 (DEC-019). 질문 1건의 Claude 호출 합계가 COST_CAP_USD를 넘지 않게 호출 전에 막는다.
// 순수 함수 — 단가표·비용 계산·호출 계획만. 실제 호출 감싸기는 client.ts withCostCap.
// 단가 출처: claude-api 스킬 모델 표 (2026-11-03 캐시). 바뀌면 이 표만 고친다.

export type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

/**
 * USD / 1M 토큰. 캐시 쓰기는 5분 기준(입력의 1.25배).
 * Haiku는 프롬프트 100K 토큰 이하 구간 (넘으면 입력 $0.50·출력 $2.50 — LONG_PROMPT_TOKENS로 막는다).
 * Sonnet 5.5는 라이트 답변 모델 선택용 (DEC-026, lib/ai/models.ts)
 */
export const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  // Pro Max 단계 (DEC-036)
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

/** 질문 1건 상한 (사용자 결정: Claude Console 기준 $0.01~0.015 안팎) */
export const COST_CAP_USD = 0.015;
/**
 * 라이트 모드(AI_MODE=pro, DEC-020) Haiku 질문 1건 상한 — 사용자 결정 $0.0015 (2026-11-16, 이전 $0.001).
 * 배분: 입력 약 9,000토큰($0.0009) + 출력 1,200토큰($0.0006). 입력은 호출 전에 무과금 토큰 세기로 확인한다.
 * 단계별 상한·출력 한도는 lib/ai/models.ts TIERS (DEC-036: Light $0.002 · Pro $0.03 · Pro Max $0.15)
 */
export const LITE_COST_CAP_USD = 0.0015;
export const LITE_ANSWER_TOKENS = { max: 1_200, min: 700 } as const;
/**
 * 질문 해석 (DEC-033): 검색 전에 Haiku 1회로 섹션 라벨과 검색어를 뽑는다. 출력은 짧은 JSON이라 300토큰이면 충분하다.
 * 정가 기준 입력 약 2,000토큰($0.0002) + 출력 300토큰($0.00015) — 질문 1건 상한(라이트 답변과 같은 상한) 안에서 쓴다
 */
export const UNDERSTAND_TOKENS = { max: 450, min: 150 } as const;

/** 문서 초안 도우미(DEC-023) 1건 상한 — 라이트와 같은 $0.0015. 사연 정리만 하므로 출력이 짧다 */
export const DOC_DRAFT_COST_CAP_USD = 0.0015;
export const DOC_DRAFT_TOKENS = { max: 1_500, min: 400 } as const;

/**
 * 서류 판독(F-015, DEC-052) 1건 상한 — Haiku 비전 1회. **임시값, 사용자 확인 전**.
 * 계산: 사진 5장을 장당 IMAGE_TOKEN_ESTIMATE(5,000)토큰으로 넉넉히 잡은 입력 약 27,000토큰($0.0027) + 출력 2,000토큰($0.001).
 * 2026-11-24 사진 30장·문서 읽기(사용자 요청)로 $0.005 → $0.015: 사진 30장(장당 약 1,600토큰) + 문서 글 20,000자 + PDF까지 들어간다.
 * 실제로 쓴 금액만 기간 예산에서 빠진다(DEC-040).
 * 실제 입력은 호출 전에 무과금 토큰 세기로 재고, 상한을 넘으면 부르지 않는다.
 */
export const CASEFILE_READ_COST_CAP_USD = 0.015;
export const CASEFILE_READ_TOKENS = { max: 2_000, min: 600 } as const;

/**
 * 자료 판독(F-017, DEC-058) 1건 상한 — Haiku 비전 1회. 입력은 서류 판독과 같다(사진 30장·PDF·문서 글, 2026-11-24) — 상한도 같은 $0.015(**임시값**).
 * 출력은 파일마다 요약·적힌 내용·확인하지 못한 곳이라 서류 판독보다 길다: 30개 × 약 130토큰 = 4,000토큰.
 * 실제로 쓴 금액만 기간 예산에서 빠진다(DEC-040).
 */
export const MATERIALS_READ_COST_CAP_USD = 0.015;
export const MATERIALS_READ_TOKENS = { max: 4_000, min: 600 } as const;

/**
 * 사건 진행(F-016, DEC-053)의 호출별 상한 — 모두 **임시값**.
 * - 서류 읽기: Haiku 비전 1회. 서류 분석(F-015)보다 자세히 뽑아 출력이 길다 (입력 약 27,000토큰 $0.0027 + 출력 6,000토큰 $0.003).
 * - 요약: Haiku 1회 (입력 약 8,000토큰 + 출력 700토큰).
 * - 기업 조사: Opus 5.5 + 웹 검색·웹 가져오기. 도구가 가져온 글은 호출 전에 셀 수 없어 도구 횟수(max_uses)와
 *   가져올 글 길이로 묶는다. 웹 검색은 토큰과 별도로 건당 WEB_SEARCH_USD가 붙는다(비용 장부에 더한다).
 *   건당 상한은 없다 — 아래 COMPANY_RESERVE_USD 참고 (실측은 lib/ai/company.ts COMPANY_TOOL_LIMITS 주석, Opus $0.56).
 */
export const MATTER_READ_COST_CAP_USD = 0.015;
export const MATTER_READ_TOKENS = { max: 6_000, min: 1_500 } as const;
export const MATTER_SUMMARY_COST_CAP_USD = 0.002;
export const MATTER_SUMMARY_TOKENS = { max: 700, min: 200 } as const;
/** 사건 자동 정리(DEC-073, 제목·분야·한 줄 요약): Haiku 고정, 상한은 요약과 같은 MATTER_SUMMARY_COST_CAP_USD */
export const MATTER_AUTO_TOKENS = { max: 400, min: 120 } as const;
/**
 * 기업 조사에는 건당 상한을 두지 않는다 (사용자 결정 2026-11-24, DEC-053 — 이전 $0.2).
 * 전체 금액은 기간·주간 예산만 막는다. 아래 값은 상한이 아니라 호출 전에 예산에서 잡아 두는 금액이고,
 * 호출 뒤 실제 쓴 금액과의 차액을 돌려준다. 실제 금액은 도구 횟수(COMPANY_TOOL_LIMITS)로 정해진다.
 */
export const COMPANY_RESERVE_USD = 1.5;
// Opus는 생각과 답변이 같은 출력 한도를 나눠 쓴다 — 3,000으로는 답변 전에 한도에 걸렸다 (실측 2026-11-24)
export const COMPANY_TOKENS = { max: 16_000, min: 800 } as const;
/** 웹 검색 도구 1회 요금 (1,000회 $10 — claude-api 스킬 2026-11-03 캐시 기준) */
export const WEB_SEARCH_USD = 0.01;

/**
 * 긴 질문(2,000자 넘게)의 입력 몫 (2026-11-25 질문 한도 10,000자). 넘는 글자를 1.5토큰으로 치고,
 * 질문 해석(Haiku)과 답변 모델에 한 번씩 들어가는 값을 단계 상한에 더한다. 실제로 쓴 금액만 기간 예산에서 빠진다.
 */
export function longInputAllowanceUsd(answerModel: string, chars: number): number {
  const extra = Math.max(0, chars - 2_000) * 1.5;
  if (extra === 0) return 0;
  const tokens = extra * 1.1; // 이전 대화 맥락·태그 여유
  return (tokens * (priceOf(answerModel).input + priceOf("claude-haiku-5-5").input)) / 1_000_000;
}

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

/** 토큰 세기를 못 쓸 때 사진 한 장을 이만큼으로 친다 (고해상도 사진의 최대치보다 크게) */
export const IMAGE_TOKEN_ESTIMATE = 5_000;
/**
 * 사진이 많을 때(10장 넘게)의 장당 추정. 브라우저가 이때는 긴 변 1,200px 이하로 줄여 보내므로(lib/client/casefile fitToBudget)
 * 실제 약 1,400토큰이다. 5,000으로 치면 30장이 장문 구간 한도에 걸려 읽지 못한다 (2026-11-24 사진 30장 요청).
 */
export const MANY_IMAGES_TOKEN_ESTIMATE = 2_000;
/**
 * PDF(document 블록) 추정: 쪽마다 글 + 쪽 그림이 들어가므로 쪽당 PDF_PAGE_TOKENS.
 * 쪽 수를 못 세면(압축된 객체 스트림) base64 12자를 1토큰으로 친다. 최소 3,000토큰 (legal-reviewer 2026-11-24 지적)
 */
export const PDF_PAGE_TOKENS = 3_500;
const PDF_CHARS_PER_TOKEN = 12;

/** base64 PDF의 쪽 수 (/Type /Page 개수). 못 세면 0 */
export function pdfPageCount(base64: string): number {
  try {
    const bin = atob(base64);
    return (bin.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * 요청 전체(system·messages·tools)의 보수적 토큰 추정. 사진(base64)은 글자 수로 세면 터무니없이 커지므로
 * 내용을 빼고 장당 IMAGE_TOKEN_ESTIMATE로 친다 (F-015).
 */
export function estimateRequestTokens(parts: unknown): number {
  let images = 0;
  let pdfTokens = 0;
  const text = JSON.stringify(parts, (_key, value: unknown) => {
    const type = value && typeof value === "object" ? (value as { type?: unknown }).type : null;
    if (type === "image") {
      images += 1;
      return { type: "image" };
    }
    if (type === "document") {
      const data = (value as { source?: { data?: unknown } }).source?.data;
      const chars = typeof data === "string" ? data.length : 0;
      const pages = typeof data === "string" ? pdfPageCount(data) : 0;
      pdfTokens += Math.max(
        3_000,
        pages > 0 ? pages * PDF_PAGE_TOKENS : Math.ceil(chars / PDF_CHARS_PER_TOKEN),
      );
      return { type: "document" };
    }
    return value;
  });
  const perImage = images > 10 ? MANY_IMAGES_TOKEN_ESTIMATE : IMAGE_TOKEN_ESTIMATE;
  return estimateTokens(text ?? "") + images * perImage + pdfTokens;
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
