// 라이트 Haiku 답변 (AI_MODE=pro, DEC-020). 질문 1건 Claude 비용 $0.0015 상한.
// ① 무료 법제처 검색(lib/demo freeSearch, LLM 없음) → ② 근거를 예산에 맞게 줄여 Haiku 답변 1회 → (라우트가) 무료 인용 검증.
// 의도 분석·재검색은 하지 않는다. 입력이 예산을 넘으면 근거를 하나씩 빼며 다시 잰다(토큰 세기는 무과금).
// 예산 안에 못 맞추거나 답변이 출력 한도를 넘으면 AI 문단 없이 찾은 근거만 낸다 — 오류로 끝내지 않는다.
import "server-only";
import { ApiError } from "@/lib/api/errors";
import { freeSearch } from "@/lib/demo/free";
import { EvidenceSet } from "@/lib/search/evidence";
import { createLawSource, type LawSource } from "@/lib/search/law-source";
import {
  CostCapReached,
  addUsage,
  callModel,
  createModelClient,
  textOf,
  withCostCap,
  type ModelClient,
  type Usage,
} from "./client";
import { LITE_ANSWER_TOKENS, LITE_COST_CAP_USD } from "./cost";
import { userMessage } from "./message";
import {
  AnswerZ,
  MODELS,
  STEP_MESSAGES,
  answerSchema,
  assembleDraft,
  citableKeys,
  describeArticle,
  describeCase,
  screenPoints,
  type DemoDraft,
  type DraftPoint,
  type DropReason,
  type FollowupTurn,
  type StepEvent,
} from "./policy";
import { LITE_ANSWER_SYSTEM } from "./prompts";

export const LITE_PROMPT_VERSION = "lite-2026-11-16";

/** 근거 원문 길이 (전체 파이프라인의 900·1,600자보다 짧게) */
const LITE_ARTICLE_CHARS = 600;
const LITE_CASE_CHARS = 800;
/** 처음 넣어 볼 근거 수. 예산을 넘으면 뒤에서부터 뺀다 */
const LITE_MAX_ARTICLES = 4;
const LITE_MAX_CASES = 3;
const ANSWER_TIMEOUT_MS = 25_000;

export type LiteAnalysisOutput = {
  draft: DemoDraft;
  evidence: EvidenceSet;
  dropped: DropReason[];
  usage: Usage;
  model: string;
  promptVersion: string;
  costUsd: number;
  /** 예산·출력 한도 때문에 AI 문단 없이 근거만 냈다 */
  costCapped: boolean;
};

/** 답변 모델에 넘길 근거 키 순서: 조문 먼저, 그다음 요지가 있는 판례 */
export function liteEvidenceKeys(evidence: EvidenceSet): string[] {
  const citable = new Set(citableKeys(evidence));
  const items = evidence.list().filter((i) => citable.has(i.key));
  const statutes = items.filter((i) => i.kind === "statute").slice(0, LITE_MAX_ARTICLES);
  const cases = items.filter((i) => i.kind === "case").slice(0, LITE_MAX_CASES);
  return [...statutes, ...cases].map((i) => i.key);
}

export function liteDigest(evidence: EvidenceSet, keys: string[]): string {
  return keys
    .map((k) => evidence.get(k))
    .filter((i) => i !== undefined)
    .map((i) =>
      i.kind === "statute"
        ? describeArticle(i.ref, LITE_ARTICLE_CHARS)
        : describeCase(i.key, i.ref, LITE_CASE_CHARS),
    )
    .join("\n\n");
}

export async function runLiteAnalysis(
  input: { maskedText: string; context?: FollowupTurn[] },
  deps: {
    model?: ModelClient;
    lawSource?: LawSource;
    onStep?: (e: StepEvent) => void;
    costCapUsd?: number;
  } = {},
): Promise<LiteAnalysisOutput> {
  const context = input.context ?? [];
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  const found = await freeSearch(input.maskedText, { lawSource: source, onStep: deps.onStep });

  const evidence = new EvidenceSet();
  for (const a of found.articles) evidence.addArticle(a);
  for (const c of found.cases) evidence.addCase(c);

  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let points: DraftPoint[] = [];
  let dropped: DropReason[] = [];
  let costCapped = false;
  let spent = 0;

  let keys = liteEvidenceKeys(evidence);
  if (keys.length > 0) {
    deps.onStep?.({ stage: "answer", message: STEP_MESSAGES.answer });
    const model = withCostCap(
      deps.model ?? createModelClient(),
      deps.costCapUsd ?? LITE_COST_CAP_USD,
    );
    // 예산을 넘으면 마지막 근거를 하나 빼고 다시 잰다 (토큰 세기는 무과금, 생성 호출은 하지 않음)
    for (;;) {
      try {
        const res = await callModel(
          model,
          "answer",
          {
            model: MODELS.answer,
            max_tokens: LITE_ANSWER_TOKENS.max,
            thinking: { type: "disabled" },
            system: [{ type: "text", text: LITE_ANSWER_SYSTEM }],
            output_config: {
              effort: "low",
              format: { type: "json_schema", schema: answerSchema(keys) },
            },
            messages: [
              {
                role: "user",
                content: [
                  userMessage(input.maskedText, context),
                  `<근거_목록>\n${liteDigest(evidence, keys)}\n</근거_목록>`,
                  `출처로 쓸 수 있는 근거 키: ${keys.join(", ")}`,
                ].join("\n\n"),
              },
            ],
          },
          ANSWER_TIMEOUT_MS,
          { minOutputTokens: LITE_ANSWER_TOKENS.min },
        );
        usage = addUsage(usage, res);
        const parsed = AnswerZ.safeParse(JSON.parse(textOf(res)));
        if (parsed.success)
          ({ kept: points, dropped } = screenPoints(parsed.data.points, evidence));
        else costCapped = true;
        break;
      } catch (e) {
        if (e instanceof CostCapReached && keys.length > 1) {
          keys = keys.slice(0, -1);
          continue;
        }
        // 예산 안에 못 맞춤 / 출력 한도 초과 / 형식 오류 → AI 문단 없이 근거만 (이미 쓴 비용은 기록)
        if (
          e instanceof CostCapReached ||
          e instanceof SyntaxError ||
          (e instanceof ApiError && e.code === "MODEL_FAILED")
        ) {
          costCapped = true;
          break;
        }
        throw e;
      }
    }
    spent = model.spentUsd();
  }

  const draft = assembleDraft({
    maskedText: input.maskedText,
    intent: {
      area: "",
      goal: "",
      laws: [...new Set(found.articles.map((a) => a.lawName))],
      lawKeywords: found.searches.map((s) => s.keyword),
      precKeywords: [],
    },
    points,
    evidence,
    searches: found.searches,
    trace: [],
  });
  return {
    draft,
    evidence,
    dropped,
    usage,
    model: MODELS.answer,
    promptVersion: LITE_PROMPT_VERSION,
    costUsd: spent,
    costCapped,
  };
}
