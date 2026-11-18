// 절차 분류 (DEC-033, Haiku 1회 $0.0015 상한). 규칙이 절차를 정하지 못했고 저장해 둔 라벨에도 없는 질문에만 부른다.
// 답변 모델(사용자가 고른 단계)과 상관없이 가장 싼 Haiku로 한다 — 분류는 짧은 구조화 출력이라 싼 모델로 충분하다.
// 결과는 lib/procedure/labels.ts가 검사해 저장하고, 같은 낱말의 다음 질문은 모델 없이 그 라벨을 쓴다.
import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { TRACK_MENU, type ClassifyOutput } from "@/lib/procedure/labels";
import { CostCapReached, callModel, createModelClient, textOf, withCostCap } from "./client";
import type { ModelClient } from "./client";

export const CLASSIFY_MODEL = "claude-haiku-5-5";
export const CLASSIFY_COST_CAP_USD = 0.0015;
export const CLASSIFY_TOKENS = { max: 900, min: 300 } as const;
const CLASSIFY_TIMEOUT_MS = 12_000;

const StepZ = z.object({
  label: z.string(),
  difficulty: z.enum(["self", "depends", "expert"]),
  prepare: z.array(z.string()),
  cautions: z.array(z.string()),
});
const OutputZ = z.object({
  track: z.string(),
  keywords: z.array(z.string()),
  proposal: z.object({ title: z.string(), steps: z.array(StepZ) }).nullable(),
});

const STEP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "difficulty", "prepare", "cautions"],
  properties: {
    label: { type: "string" },
    difficulty: { type: "string", enum: ["self", "depends", "expert"] },
    prepare: { type: "array", items: { type: "string" } },
    cautions: { type: "array", items: { type: "string" } },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["track", "keywords", "proposal"],
  properties: {
    track: { type: "string", enum: [...TRACK_MENU.map((t) => t.key), "none"] },
    keywords: { type: "array", items: { type: "string" } },
    proposal: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "steps"],
          properties: { title: { type: "string" }, steps: { type: "array", items: STEP_SCHEMA } },
        },
      ],
    },
  },
} as const;

export const CLASSIFY_SYSTEM = `당신은 한국 법률 정보 서비스의 절차 분류 도우미입니다. 사용자의 질문(개인정보는 이미 가려져 있음)을 읽고 어떤 절차 안내에 해당하는지만 정합니다. 법률 판단이나 답변은 하지 않습니다.

<기존_절차_목록>
${TRACK_MENU.map((t) => `- ${t.key}: ${t.title}`).join("\n")}
</기존_절차_목록>

정하는 방법:
1. track: 질문이 기존 절차 목록 중 하나에 분명히 해당하면 그 키를, 아니면 "none"을 고릅니다. 애매하면 "none"입니다. 이 절차들은 돈이나 권리를 요구하는 쪽 기준입니다.
2. keywords: 이 유형의 질문을 다시 알아볼 수 있는 일반 낱말을 하나에서 세 개 고릅니다. 반드시 질문에 그대로 나온 낱말이어야 하고, 띄어쓰기 없는 한 낱말이어야 합니다. 사건의 종류를 나타내는 낱말을 고르고(예: 층간소음, 임금체불), 사람 이름·지명·회사명·숫자·"문제"나 "방법" 같은 흔한 낱말은 고르지 않습니다.
3. proposal: track이 "none"이고, 일반 시민이 밟는 절차가 널리 알려진 유형일 때만 단계 초안을 제안합니다. 그렇지 않으면 null입니다. track을 골랐다면 항상 null입니다.

proposal을 쓸 때 지킬 것 (운영자가 검토한 뒤에만 사용자에게 보입니다):
- title은 절차 이름입니다(예: "행정심판 청구 절차"). steps는 진행 순서대로 셋에서 다섯 단계입니다.
- 각 단계의 label은 짧은 이름, prepare는 준비할 것, cautions는 주의할 점이며 각각 한두 문장씩 최대 세 개입니다.
- difficulty는 혼자 할 수 있으면 "self", 상황에 따라 다르면 "depends", 전문가 도움이 권장되면 "expert"입니다.
- 숫자를 쓰지 않습니다. 기간·금액·조문 번호·횟수는 적지 않고 "정해진 기간 안에"처럼 씁니다. 기준이 바뀌거나 사건마다 달라 잘못 안내될 수 있기 때문입니다.
- 결과를 예측하거나 유불리를 말하지 않습니다. 절차와 준비물만 적습니다.
- 질문에 나온 개인 사정은 옮기지 않고, 같은 유형의 누구에게나 맞는 일반 안내로 씁니다.`;

export type ClassifyResult =
  | { ok: true; output: ClassifyOutput; costUsd: number }
  | { ok: false; reason: "budget" | "model" | "format"; costUsd: number };

/** 질문 1건 분류. 실패는 오류가 아니라 "분류 없음"으로 돌려준다 — 분석 결과를 막지 않는다 */
export async function classifyProcedure(
  maskedText: string,
  deps: { model?: ModelClient } = {},
): Promise<ClassifyResult> {
  const model = withCostCap(deps.model ?? createModelClient(), CLASSIFY_COST_CAP_USD);
  try {
    const res = await callModel(
      model,
      "classify",
      {
        model: CLASSIFY_MODEL,
        max_tokens: CLASSIFY_TOKENS.max,
        thinking: { type: "disabled" },
        system: [{ type: "text", text: CLASSIFY_SYSTEM }],
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: `<질문>\n${maskedText}\n</질문>` }],
      },
      CLASSIFY_TIMEOUT_MS,
      { minOutputTokens: CLASSIFY_TOKENS.min },
    );
    const parsed = OutputZ.safeParse(JSON.parse(textOf(res)));
    return parsed.success
      ? { ok: true, output: parsed.data, costUsd: model.spentUsd() }
      : { ok: false, reason: "format", costUsd: model.spentUsd() };
  } catch (e) {
    if (e instanceof CostCapReached) return { ok: false, reason: "budget", costUsd: 0 };
    if (e instanceof SyntaxError) return { ok: false, reason: "format", costUsd: model.spentUsd() };
    if (e instanceof ApiError) return { ok: false, reason: "model", costUsd: model.spentUsd() };
    throw e;
  }
}
