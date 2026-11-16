// 문서 초안 도우미 — 사연을 사실관계 문장으로 정리하는 Haiku 1회 호출 (DEC-023, legal_documents 게이트 뒤).
// 입력은 질문 마스킹본뿐이다. 이름·주소·금액 칸은 사용자가 화면에서 직접 적고 서버·모델로 보내지 않는다 (F-007).
// 1건 비용 상한 $0.0015 (DOC_DRAFT_COST_CAP_USD). 예산에 못 맞추거나 모델이 실패하면 AI 문장 없이 끝낸다 — 재시도하지 않는다.
import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import {
  factsText,
  partyWords,
  screenFacts,
  screenMissing,
  type FactDrop,
} from "@/lib/documents/draft";
import type { DocumentKind } from "@/lib/procedure/steps";
import {
  CostCapReached,
  callModel,
  createModelClient,
  textOf,
  withCostCap,
  type ModelClient,
} from "./client";
import { DOC_DRAFT_COST_CAP_USD, DOC_DRAFT_TOKENS } from "./cost";
import { MODELS } from "./policy";

export const DOC_DRAFT_PROMPT_VERSION = "doc-draft-2026-11-16";
const TIMEOUT_MS = 20_000;

const SYSTEM = `당신은 한국 법률 정보 서비스 "햄찌법원"의 문서 초안 도우미입니다. 법률 자문을 하지 않습니다.
할 일: 사용자의 사연을 법원·상대방에게 보낼 문서의 "있었던 일(사실관계)" 문장으로 시간 순서대로 정리합니다.
- 사연에 적힌 사실만 씁니다. 사연에 없는 사실·날짜·금액·장소를 지어내지 않습니다.
- 숫자는 사연에 적힌 숫자를 그대로만 씁니다. 계산하거나 바꿔 쓰지 않습니다.
- 사연은 개인정보를 가린 마스킹본입니다. [이름1], [전화번호] 같은 가림 표시는 그대로 두고 추측해 채우지 않습니다.
- 사용자는 "{me}", 상대방은 "{other}"(이)라고 부릅니다.
- 법률 판단·평가(위법, 책임이 있다, 청구할 수 있다 등)와 법령·조문·판례 언급을 쓰지 않습니다. 결과(승소·처벌)를 말하지 않습니다.
- 감정 표현·위협으로 읽힐 문장은 쓰지 않습니다. 문장은 "~했습니다" 꼴의 짧은 평서문, 문장마다 120자 이내, 최대 8문장입니다.
- missing에는 문서에 적으면 좋은데 사연에 없는 사실을 짧은 질문으로 최대 4개 적습니다 (예: "계약을 맺은 날짜가 언제인가요?"). 숫자를 넣지 않습니다.`;

const SCHEMA = {
  type: "object",
  properties: {
    sentences: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
  },
  required: ["sentences", "missing"],
  additionalProperties: false,
} as const;

const OutZ = z.object({ sentences: z.array(z.string()), missing: z.array(z.string()) });

export type DraftFactsOutput =
  | {
      ok: true;
      text: string;
      missing: string[];
      dropped: FactDrop[];
      costUsd: number;
    }
  | { ok: false; reason: "cost_cap" | "model_failed" | "no_facts"; costUsd: number };

export async function draftFacts(
  input: { kind: DocumentKind; maskedStory: string },
  deps: { model?: ModelClient; costCapUsd?: number } = {},
): Promise<DraftFactsOutput> {
  const model = withCostCap(
    deps.model ?? createModelClient(),
    deps.costCapUsd ?? DOC_DRAFT_COST_CAP_USD,
  );
  const words = partyWords(input.kind);
  try {
    const res = await callModel(
      model,
      "doc_draft",
      {
        model: MODELS.answer,
        max_tokens: DOC_DRAFT_TOKENS.max,
        thinking: { type: "disabled" },
        system: [
          {
            type: "text",
            text: SYSTEM.replace("{me}", words.me).replace("{other}", words.other),
          },
        ],
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: `<사연>\n${input.maskedStory}\n</사연>` }],
      },
      TIMEOUT_MS,
      { minOutputTokens: DOC_DRAFT_TOKENS.min },
    );
    const parsed = OutZ.safeParse(JSON.parse(textOf(res)));
    if (!parsed.success) return { ok: false, reason: "model_failed", costUsd: model.spentUsd() };
    const { kept, dropped } = screenFacts(parsed.data.sentences, input.maskedStory);
    if (kept.length === 0) return { ok: false, reason: "no_facts", costUsd: model.spentUsd() };
    return {
      ok: true,
      text: factsText(input.kind, kept),
      missing: screenMissing(parsed.data.missing),
      dropped,
      costUsd: model.spentUsd(),
    };
  } catch (e) {
    if (e instanceof CostCapReached)
      return { ok: false, reason: "cost_cap", costUsd: model.spentUsd() };
    if (
      e instanceof SyntaxError ||
      (e instanceof ApiError && (e.code === "MODEL_FAILED" || e.code === "TIMEOUT"))
    ) {
      return { ok: false, reason: "model_failed", costUsd: model.spentUsd() };
    }
    throw e;
  }
}
