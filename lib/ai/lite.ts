// 답변 1회 분석 (DEC-020·026·036). 답변 모델은 사용자가 고른 단계(Light Haiku $0.0015 · Pro Sonnet $0.03 · Pro Max Opus $0.15) — lib/ai/models.ts.
// ⓪ 질문 해석(Haiku 1회: 섹션 라벨 + 검색어, 같은 상한 안) → ① 무료 법제처 검색(lib/demo freeSearch, LLM 없음)
// → ② 근거를 예산에 맞게 줄여 답변 1회 → (라우트가) 무료 인용 검증. 재검색은 하지 않는다. 입력이 예산을 넘으면 근거를 하나씩 빼며 다시 잰다(토큰 세기는 무과금).
// 예산 안에 못 맞추거나 답변이 출력 한도를 넘으면 AI 문단 없이 찾은 근거만 낸다 — 오류로 끝내지 않는다.
import "server-only";
import { ApiError } from "@/lib/api/errors";
import { freeSearch } from "@/lib/demo/free";
import { DEEP_EVIDENCE } from "@/lib/inquiries/deep";
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
import { UNDERSTAND_TOKENS } from "./cost";
import { userMessage } from "./message";
import { tierOf, type TierId } from "./models";
import {
  AnswerZ,
  STEP_MESSAGES,
  UNDERSTAND_SCHEMA,
  UnderstandZ,
  screenUnderstanding,
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
import { LITE_ANSWER_SYSTEM, UNDERSTAND_SYSTEM } from "./prompts";

export const LITE_PROMPT_VERSION = "lite-2026-11-18-understand";

/** 근거 원문 길이 (전체 파이프라인의 900·1,600자보다 짧게) */
const LITE_ARTICLE_CHARS = 600;
const LITE_CASE_CHARS = 800;
/**
 * 처음 넣어 볼 근거 수. 예산을 넘으면 뒤에서부터 뺀다.
 * 조문 6개 (DEC-026, 이전 4개): 2026-11-18 비교에서 질문의 핵심 조문이 5번째라 잘린 사례가 2건 중 2건
 */
export const LITE_MAX_ARTICLES = 6;
const LITE_MAX_CASES = 3;
const UNDERSTAND_TIMEOUT_MS = 8_000;
/** 질문 해석은 답변 모델과 상관없이 가장 싼 모델로 (라벨과 검색어만 뽑는다) */
export const UNDERSTAND_MODEL = "claude-haiku-5-5";

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
export function liteEvidenceKeys(
  evidence: EvidenceSet,
  max: { articles: number; cases: number } = { articles: LITE_MAX_ARTICLES, cases: LITE_MAX_CASES },
): string[] {
  const citable = new Set(citableKeys(evidence));
  const items = evidence.list().filter((i) => citable.has(i.key));
  const statutes = items.filter((i) => i.kind === "statute").slice(0, max.articles);
  const cases = items.filter((i) => i.kind === "case").slice(0, max.cases);
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
    /** 사용자가 고른 단계. 없으면 Pro (lib/ai/models.ts DEFAULT_TIER) */
    tier?: TierId;
    /** 질문 1건 상한. 기본은 단계의 capUsd */
    costCapUsd?: number;
    /** 홈 카테고리의 고정 판례 검색어 (DEC-028) */
    caseHint?: string | null;
    /** DeepSearch (DEC-038): 근거를 조문 8·판례 4건까지 넘겨 본다. 비용 상한은 그대로라 넘으면 뒤에서부터 뺀다 */
    deep?: boolean;
  } = {},
): Promise<LiteAnalysisOutput> {
  const tier = tierOf(deps.tier);
  const context = input.context ?? [];
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  // 질문 해석과 답변이 질문 1건 상한 하나를 함께 쓴다 (해석이 쓴 만큼 답변 몫이 줄어든다)
  const model = withCostCap(
    deps.model ?? createModelClient(),
    deps.costCapUsd ?? tier.capUsd,
  );
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // ⓪ 질문 해석 (DEC-033): 섹션 라벨 + 법률 용어 검색어. 실패하면 질문 문장으로 찾는 기존 방식 그대로 간다
  let understood: ReturnType<typeof screenUnderstanding> | null = null;
  deps.onStep?.({ stage: "intent", message: STEP_MESSAGES.understand });
  try {
    const res = await callModel(
      model,
      "understand",
      {
        model: UNDERSTAND_MODEL,
        max_tokens: UNDERSTAND_TOKENS.max,
        thinking: { type: "disabled" },
        system: [{ type: "text", text: UNDERSTAND_SYSTEM }],
        output_config: { format: { type: "json_schema", schema: UNDERSTAND_SCHEMA } },
        messages: [{ role: "user", content: userMessage(input.maskedText, context) }],
      },
      UNDERSTAND_TIMEOUT_MS,
      { minOutputTokens: UNDERSTAND_TOKENS.min },
    );
    usage = addUsage(usage, res);
    const parsed = UnderstandZ.safeParse(JSON.parse(textOf(res)));
    if (parsed.success) understood = screenUnderstanding(parsed.data);
  } catch (e) {
    // 상한·시간 초과·형식 오류·모델 오류 모두 해석 없이 계속한다 (오류로 끝내지 않는다)
    if (!(e instanceof CostCapReached || e instanceof SyntaxError || e instanceof ApiError))
      throw e;
  }

  const found = await freeSearch(input.maskedText, {
    lawSource: source,
    onStep: deps.onStep,
    caseHint: deps.caseHint,
    wide: deps.deep,
    lawQuery: understood?.lawQuery,
    caseQueries: understood?.caseQueries,
  });

  const evidence = new EvidenceSet();
  for (const a of found.articles) evidence.addArticle(a);
  for (const c of found.cases) evidence.addCase(c);

  let points: DraftPoint[] = [];
  let dropped: DropReason[] = [];
  let costCapped = false;
  let spent = 0;

  let keys = liteEvidenceKeys(evidence, deps.deep ? DEEP_EVIDENCE : undefined);
  if (keys.length > 0) {
    deps.onStep?.({ stage: "answer", message: STEP_MESSAGES.answer });
    // 예산을 넘으면 마지막 근거를 하나 빼고 다시 잰다 (토큰 세기는 무과금, 생성 호출은 하지 않음)
    for (;;) {
      try {
        const res = await callModel(
          model,
          "answer",
          {
            model: tier.model,
            // Pro Max(Opus)는 생각을 끌 수 없어 max_tokens가 생각 + 답변을 함께 묶는다. 그래서 한도가 더 크다
            max_tokens: tier.answerTokens.max,
            // Haiku는 disabled, Sonnet 5.5는 between_tools(effort low라 허용), Opus는 adaptive + effort medium
            thinking: tier.thinking,
            system: [{ type: "text", text: LITE_ANSWER_SYSTEM }],
            output_config: {
              effort: tier.effort,
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
          tier.timeoutMs,
          { minOutputTokens: tier.answerTokens.min },
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
        // 예산 안에 못 맞춤 / 출력 한도 초과 / 형식 오류 / 시간 초과 → AI 문단 없이 근거만 (이미 쓴 비용은 기록)
        if (
          e instanceof CostCapReached ||
          e instanceof SyntaxError ||
          (e instanceof ApiError && (e.code === "MODEL_FAILED" || e.code === "TIMEOUT"))
        ) {
          costCapped = true;
          break;
        }
        throw e;
      }
    }
  }
  spent = model.spentUsd();

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
    section: understood?.section,
  });
  return {
    draft,
    evidence,
    dropped,
    usage,
    model: tier.model,
    promptVersion: LITE_PROMPT_VERSION,
    costUsd: spent,
    costCapped,
  };
}
