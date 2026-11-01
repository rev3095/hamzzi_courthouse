// ① 질문 의도 분석 (PRD 8.2 데모 파이프라인, Haiku). 분야·알고 싶은 것·관련 법률·검색어를 구조화 출력으로 받는다.
import "server-only";
import { ApiError } from "@/lib/api/errors";
import { callModel, textOf, type ModelClient, type ModelMessage } from "./client";
import { STAGE_TOKENS } from "./cost";
import { INTENT_SCHEMA, IntentZ, MODELS, type FollowupTurn, type Intent } from "./policy";
import { INTENT_SYSTEM } from "./prompts";
import { userMessage } from "./message";

export async function analyzeIntent(
  model: ModelClient,
  input: { maskedText: string; context: FollowupTurn[] },
  timeoutMs: number,
): Promise<{ intent: Intent; res: ModelMessage }> {
  const res = await callModel(
    model,
    "intent",
    {
      model: MODELS.intent,
      max_tokens: STAGE_TOKENS.intent.max,
      thinking: { type: "disabled" },
      system: [{ type: "text", text: INTENT_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: { type: "json_schema", schema: INTENT_SCHEMA } },
      messages: [{ role: "user", content: userMessage(input.maskedText, input.context) }],
    },
    timeoutMs,
    { minOutputTokens: STAGE_TOKENS.intent.min },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(res));
  } catch {
    throw new ApiError("MODEL_FAILED", { stage: "intent", reason: "format" });
  }
  const intent = IntentZ.safeParse(parsed);
  if (!intent.success) throw new ApiError("MODEL_FAILED", { stage: "intent", reason: "format" });
  return { intent: intent.data, res };
}
