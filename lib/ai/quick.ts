// 빠른 답 먼저 (DEC-064): 유료 분석과 동시에 Haiku 1회로 짧은 요약을 만든다. 실패해도 분석은 그대로 간다 (재시도 없음 — 이중 과금 방지).
// 거르기는 quick-policy.ts. 비용은 따로 상한(QUICK_CAP_USD)을 두고 analyze가 예산 가중치에 더해 정산한다.
import "server-only";
import type { MaterialReading } from "@/lib/materials/limits";
import { callModel, createModelClient, textOf, withCostCap, type ModelClient } from "./client";
import { userMessage } from "./message";
import { type FollowupTurn } from "./policy";
import { QUICK_SYSTEM } from "./prompts";
import {
  QUICK_CAP_USD,
  QUICK_SCHEMA,
  QuickRawZ,
  screenQuick,
  type QuickPreview,
} from "./quick-policy";

export const QUICK_MODEL = "claude-haiku-5-5";
const QUICK_TOKENS = { max: 700, min: 300 } as const;
const QUICK_TIMEOUT_MS = 15_000;

export async function runQuickPreview(
  input: { maskedText: string; context?: FollowupTurn[]; materials?: MaterialReading[] },
  deps: { model?: ModelClient } = {},
): Promise<{ preview: QuickPreview | null; costUsd: number }> {
  let model: ReturnType<typeof withCostCap> | null = null;
  try {
    model = withCostCap(deps.model ?? createModelClient(), QUICK_CAP_USD);
    const res = await callModel(
      model,
      "quick_preview",
      {
        model: QUICK_MODEL,
        max_tokens: QUICK_TOKENS.max,
        thinking: { type: "disabled" },
        system: [{ type: "text", text: QUICK_SYSTEM }],
        output_config: { format: { type: "json_schema", schema: QUICK_SCHEMA } },
        messages: [
          {
            role: "user",
            content: userMessage(input.maskedText, input.context ?? [], input.materials ?? []),
          },
        ],
      },
      QUICK_TIMEOUT_MS,
      { minOutputTokens: QUICK_TOKENS.min },
    );
    const raw = QuickRawZ.safeParse(JSON.parse(textOf(res)));
    return {
      preview: raw.success ? screenQuick(raw.data, input.maskedText) : null,
      costUsd: model.spentUsd(),
    };
  } catch {
    // 상한·시간 초과·형식 오류 모두 미리보기 없이 간다
    return { preview: null, costUsd: model?.spentUsd() ?? 0 };
  }
}
