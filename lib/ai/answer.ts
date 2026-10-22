// ④ 근거 기반 답변 (PRD 8.2·8.3, Pro 모드 — 모델은 policy.ts MODELS). 이번 요청의 근거 키 중에서만 출처를 고르게 한다 (구조화 출력 enum).
import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { EvidenceSet } from "@/lib/search/evidence";
import { callModel, fallbackFor, textOf, type ModelClient, type ModelMessage } from "./client";
import { userMessage } from "./message";
import {
  AnswerZ,
  MODELS,
  answerSchema,
  evidenceDigest,
  type DraftPoint,
  type FollowupTurn,
  type Intent,
} from "./policy";
import { ANSWER_SYSTEM } from "./prompts";

export async function writeAnswer(
  model: ModelClient,
  input: { maskedText: string; context: FollowupTurn[]; intent: Intent },
  evidence: EvidenceSet,
  keys: string[],
  timeoutMs: number,
): Promise<{ points: DraftPoint[]; res: ModelMessage }> {
  const content = [
    userMessage(input.maskedText, input.context),
    `<의도>\n분야: ${input.intent.area}\n알고 싶은 것: ${input.intent.goal}\n</의도>`,
    `<근거_목록>\n${evidenceDigest(evidence)}\n</근거_목록>`,
    `출처로 쓸 수 있는 근거 키: ${keys.join(", ")}`,
  ].join("\n\n");

  const res = await callModel(
    model,
    "answer",
    {
      model: MODELS.answer,
      max_tokens: 16_000,
      ...fallbackFor(MODELS.answer),
      system: [{ type: "text", text: ANSWER_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: answerSchema(keys) },
      },
      messages: [{ role: "user", content }],
    },
    timeoutMs,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(res));
  } catch {
    throw new ApiError("MODEL_FAILED", { stage: "answer", reason: "format" });
  }
  const answer = AnswerZ.safeParse(parsed);
  if (!answer.success) throw new ApiError("MODEL_FAILED", { stage: "answer", reason: "format" });
  return { points: answer.data.points, res };
}
