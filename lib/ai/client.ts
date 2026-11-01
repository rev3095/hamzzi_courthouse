// Claude API 호출 래퍼 (server-only). 단계마다 시간 한도를 걸고, 실패는 고정 문구의 MODEL_FAILED로 바꾼다.
// SDK 오류 메시지에는 요청 내용이 섞일 수 있어 버리고 상태 코드만 남긴다 (F-007).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ApiError } from "@/lib/api/errors";
import { required } from "@/lib/supabase/env";
import { COST_CAP_USD, estimateTokens, planCall, usageCost } from "./cost";
import { aiMode } from "./mode";

export type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
export type ModelMessage = Anthropic.Beta.BetaMessage;

/** 비용 상한 확인용 호출 옵션 (DEC-019). 가짜 모델은 무시해도 된다 */
export type CallOptions = {
  timeoutMs: number;
  /** 이 호출 뒤에도 남겨 둘 금액 (재검색이 답변 몫을 먹지 않게) */
  reserveUsd?: number;
  /** 이만큼 출력할 예산이 없으면 부르지 않는다 */
  minOutputTokens?: number;
};

/** 테스트에서 가짜로 바꿀 수 있게 create 하나만 쓴다. countTokens(무과금)가 없으면 글자 수로 보수 추정 */
export type ModelClient = {
  create(params: CreateParams, options: CallOptions): Promise<ModelMessage>;
  countTokens?(params: CreateParams): Promise<number>;
};

/** 질문 1건 비용 상한에 닿아 이 호출을 하지 않았다. 오케스트레이터가 단계를 건너뛰는 신호 */
export class CostCapReached extends Error {
  constructor(
    readonly stage: string,
    readonly reason: "long_prompt" | "budget",
  ) {
    super(`cost cap reached at ${stage}`);
  }
}

export type CostTracked = ModelClient & { spentUsd(): number };

/**
 * 호출마다 (지금까지 쓴 돈 + 이번 입력 정가 + max_tokens 출력)이 상한 안인지 확인하고, 남은 예산에 맞춰 max_tokens를 줄인다.
 * 응답의 usage로 실제 비용을 누적한다. 상한을 넘을 호출은 보내지 않고 CostCapReached를 던진다.
 */
export function withCostCap(inner: ModelClient, capUsd: number = COST_CAP_USD): CostTracked {
  let spent = 0;
  return {
    spentUsd: () => spent,
    countTokens: inner.countTokens?.bind(inner),
    async create(params, options) {
      const stage = typeof params.model === "string" ? params.model : "model";
      let inputTokens: number;
      try {
        inputTokens = inner.countTokens
          ? await inner.countTokens(params)
          : estimateTokens(JSON.stringify([params.system, params.messages, params.tools]));
      } catch {
        inputTokens = estimateTokens(
          JSON.stringify([params.system, params.messages, params.tools]),
        );
      }
      const plan = planCall({
        model: params.model,
        spentUsd: spent,
        inputTokens,
        maxTokens: params.max_tokens,
        minOutputTokens: options.minOutputTokens ?? 256,
        capUsd,
        reserveUsd: options.reserveUsd,
      });
      if (!plan.ok) throw new CostCapReached(stage, plan.reason);
      const res = await inner.create({ ...params, max_tokens: plan.maxTokens }, options);
      spent += usageCost(params.model, {
        inputTokens: res.usage.input_tokens ?? 0,
        outputTokens: res.usage.output_tokens ?? 0,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      });
      return res;
    },
  };
}

/**
 * 거절 시 서버가 권장 모델로 다시 시도하게 한다 (Opus·Sonnet 5.5).
 * Haiku 5.5에는 서버 쪽 fallback이 없어(붙이면 거절 그대로이거나 400) 붙이지 않는다.
 */
export function fallbackFor(model: string): Pick<CreateParams, "betas" | "fallbacks"> {
  return /^claude-(opus|sonnet)-/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
    : {};
}

let client: Anthropic | null = null;

export function createModelClient(): ModelClient {
  // 무료 모드(기본)에서는 Claude 클라이언트를 만들지 않는다 — 별도 과금 차단의 마지막 방어선 (DEC-015)
  if (aiMode() !== "pro") throw new Error("AI_MODE가 pro가 아니라 Claude를 부르지 않습니다");
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
    // 토큰 세기는 과금되지 않는다. 비용 상한 확인에만 쓴다 (DEC-019)
    countTokens: async (params) => {
      const r = await sdk.beta.messages.countTokens(
        {
          model: params.model,
          system: params.system,
          messages: params.messages,
          tools: params.tools,
          thinking: params.thinking,
          output_config: params.output_config,
        },
        { timeout: 5_000, maxRetries: 0 },
      );
      return r.input_tokens;
    },
  };
}

/** 모델 호출 1건. 거절·시간 초과·API 오류를 MODEL_FAILED로 바꾼다 (F-006 AC2). 비용 상한은 CostCapReached 그대로 */
export async function callModel(
  model: ModelClient,
  stage: string,
  params: CreateParams,
  timeoutMs: number,
  cost: Pick<CallOptions, "reserveUsd" | "minOutputTokens"> = {},
): Promise<ModelMessage> {
  if (timeoutMs < 1_000) throw new ApiError("TIMEOUT", { stage });
  let res: ModelMessage;
  try {
    res = await model.create(params, { timeoutMs, ...cost });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof CostCapReached) throw new CostCapReached(stage, e.reason);
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

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
};

export function addUsage(total: Usage, res: ModelMessage): Usage {
  return {
    inputTokens: total.inputTokens + (res.usage.input_tokens ?? 0),
    outputTokens: total.outputTokens + (res.usage.output_tokens ?? 0),
    cacheReadTokens: total.cacheReadTokens + (res.usage.cache_read_input_tokens ?? 0),
    cacheWriteTokens: (total.cacheWriteTokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
  };
}
