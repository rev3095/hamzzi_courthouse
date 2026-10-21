// Claude API 호출 래퍼 (server-only). 단계마다 시간 한도를 걸고, 실패는 고정 문구의 MODEL_FAILED로 바꾼다.
// SDK 오류 메시지에는 요청 내용이 섞일 수 있어 버리고 상태 코드만 남긴다 (F-007).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError } from "@/lib/api/errors";
import { required } from "@/lib/supabase/env";

export type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
export type ModelMessage = Anthropic.Beta.BetaMessage;

/** 테스트에서 가짜로 바꿀 수 있게 create 하나만 쓴다 */
export type ModelClient = {
  create(params: CreateParams, options: { timeoutMs: number }): Promise<ModelMessage>;
};

/** Opus 5.5 거절 시 서버가 권장 모델로 다시 시도한다. Haiku 5.5에는 서버 쪽 fallback이 없어 붙이지 않는다 */
export const OPUS_FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
} satisfies Pick<CreateParams, "betas" | "fallbacks">;

let client: Anthropic | null = null;

export function createModelClient(): ModelClient {
  client ??= new Anthropic({
    apiKey: required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
    maxRetries: 1,
    // ANTHROPIC_LOG=debug면 요청 본문(마스킹본·근거)이 콘솔에 찍힌다. 코드에서 고정한다 (F-007)
    logLevel: "off",
  });
  const sdk = client;
  return {
    create: (params, { timeoutMs }) =>
      sdk.beta.messages.create(params, { timeout: timeoutMs, maxRetries: 1 }),
  };
}

/** 모델 호출 1건. 거절·시간 초과·API 오류를 MODEL_FAILED로 바꾼다 (F-006 AC2) */
export async function callModel(
  model: ModelClient,
  stage: string,
  params: CreateParams,
  timeoutMs: number,
): Promise<ModelMessage> {
  if (timeoutMs < 1_000) throw new ApiError("TIMEOUT", { stage });
  let res: ModelMessage;
  try {
    res = await model.create(params, { timeoutMs });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ApiError("TIMEOUT", { stage });
    const status = e instanceof Anthropic.APIError ? (e.status ?? null) : null;
    throw new ApiError("MODEL_FAILED", { stage, status });
  }
  if (res.stop_reason === "refusal") {
    throw new ApiError("MODEL_FAILED", { stage, reason: "refusal" });
  }
  if (res.stop_reason === "max_tokens") {
    throw new ApiError("MODEL_FAILED", { stage, reason: "max_tokens" });
  }
  return res;
}

/** 응답의 텍스트 블록을 합친다 (thinking 블록 제외) */
export function textOf(res: ModelMessage): string {
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };

export function addUsage(total: Usage, res: ModelMessage): Usage {
  return {
    inputTokens: total.inputTokens + (res.usage.input_tokens ?? 0),
    outputTokens: total.outputTokens + (res.usage.output_tokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (res.usage.cache_read_input_tokens ?? 0),
  };
}
