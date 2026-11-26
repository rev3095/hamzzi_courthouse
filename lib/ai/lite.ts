// 답변 1회 분석 (DEC-020·026·036). 답변 모델은 사용자가 고른 단계(Light Haiku $0.002 · Pro Sonnet $0.03 · Pro Max Opus $0.15) — lib/ai/models.ts.
// ⓪ 질문 해석(Haiku 1회: 섹션 라벨 + 검색어, 같은 상한 안) → ① 무료 법제처 검색(lib/demo freeSearch, LLM 없음)
// → ② 근거를 예산에 맞게 줄여 답변 1회 → (라우트가) 무료 인용 검증. 재검색은 하지 않는다. 입력이 예산을 넘으면 근거를 하나씩 빼며 다시 잰다(토큰 세기는 무과금).
// 예산 안에 못 맞추거나 답변이 출력 한도를 넘으면 AI 문단 없이 찾은 근거만 낸다 — 오류로 끝내지 않는다.
import "server-only";
import { ApiError } from "@/lib/api/errors";
import { freeSearch } from "@/lib/demo/free";
import { DEEP_EVIDENCE } from "@/lib/inquiries/deep";
import type { MaterialReading } from "@/lib/materials/limits";
import {
  MATERIALS_ANSWER_VERSION,
  materialRefsOf,
  materialsInstruction,
  withMaterialRefs,
  type MaterialRef,
} from "@/lib/materials/policy";
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
  type ModelMessage,
  type Usage,
} from "./client";
import { UNDERSTAND_TOKENS } from "./cost";
import { TALK_SCHEMA, screenTalk, type AssistantTalk } from "@/lib/assistants/talk";
import { examplesBlock } from "./label-bank";
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
  sourceEnum,
  type DemoDraft,
  type DraftPoint,
  type DropReason,
  type FollowupTurn,
  type StepEvent,
} from "./policy";
import { GENERAL_ANSWER_ADDON, LITE_ANSWER_SYSTEM, UNDERSTAND_SYSTEM } from "./prompts";

import { runWebRefs, type WebRef } from "./web-refs";

export const LITE_PROMPT_VERSION = "lite-2026-11-27b-answer-then-verify";

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
/** 비서 대화 한마디 출력 한도 (짧은 정리 + 질문 셋) */
const TALK_TOKENS = { max: 500, min: 200 } as const;
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
  /** 분야별 비서의 대화 한마디 (DEC-057). 비서 요청에서만 있고, 거르기를 통과하지 못하면 null */
  talk?: AssistantTalk | null;
  /** 질문 해석이 제안한 새 절차 섹션 (DEC-042). 저장만 하고 운영자 승인 전에는 화면에 쓰지 않는다 */
  newLabel?: { title: string; keywords: string[] } | null;
  /** 첨부 자료(DEC-058)가 있을 때 문단별로 참고한 자료 번호. 검증 뒤 자료 지도에 잇는다 */
  materialRefs?: MaterialRef[];
  /** 사건 질문인지, 법·제도가 궁금한 일반 질문인지 (2026-11-27). 질문 해석이 없으면 case */
  questionKind?: "case" | "general";
  /** 일반 질문의 법제처 밖 참고 자료 링크 (lib/ai/web-refs, 도구가 실제로 가져온 주소만) */
  references?: WebRef[];
  /** 참고 자료 찾기에 쓴 금액. costUsd에 넣지 않고 analyze가 WEB_REFS_WEIGHT 예약으로 따로 정산한다 */
  refsCostUsd?: number;
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

/** 법제처 근거가 하나도 없을 때 근거 목록 자리에 넣는 문구 (DEC-055) */
export const NO_EVIDENCE = "(법제처에서 찾은 근거 없음 — 아는 법령·판례로 답하고 source는 model)";

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
  input: { maskedText: string; context?: FollowupTurn[]; materials?: MaterialReading[] },
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
    /** 홈 카테고리의 고정 법령·낱말 (조문 검색 보강) */
    lawHints?: { lawName: string; articleNos: string[] }[];
    /** DeepSearch (DEC-038): 근거를 조문 8·판례 4건까지 넘겨 본다. 비용 상한은 그대로라 넘으면 뒤에서부터 뺀다 */
    deep?: boolean;
    /**
     * 예비 답변 (2026-11-27 사용자 결정): 질문 해석·법제처 검색 없이 모델이 아는 법령·판례로만 답한다(모든 문단이 모델 인용).
     * 본 답변에서 남은 문단이 하나도 없을 때 analyze가 한 번 더 부른다 — 어떤 경우에도 답변이 나오게
     */
    noEvidence?: boolean;
    /** 일반 질문의 참고 자료 찾기 예산을 따로 잡는다 (analyze가 tryAiQuota를 넘긴다). 없거나 false면 찾지 않는다 */
    reserveWebRefs?: () => Promise<boolean>;
    /**
     * 분야별 비서 (DEC-057): 답변 지시문 뒤에 붙는 비서 지시문과, 그 요청에서 법제처로 다시 가져올 사례 판례 일련번호.
     * 판례는 근거 모음에 더해질 뿐 검증(verifyDraft)은 다른 근거와 같다. promptTag는 프롬프트 버전 뒤에 붙는다
     */
    assistant?: {
      persona: string;
      pinnedCaseIds: string[];
      promptTag: string;
      /** 대화 한마디 지시문 (Haiku, lib/assistants/talk). 근거 답변과 따로 거르고, 실패하면 한마디 없이 간다 */
      talkSystem: string;
    };
  } = {},
): Promise<LiteAnalysisOutput> {
  const tier = tierOf(deps.tier);
  const context = input.context ?? [];
  // 첨부 자료(DEC-058): 질문 해석(검색어)과 답변에 사용자 자료로 함께 넘긴다. 근거 키가 아니라 인용할 수 없다
  const materials = input.materials ?? [];
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  // 질문 해석과 답변이 질문 1건 상한 하나를 함께 쓴다 (해석이 쓴 만큼 답변 몫이 줄어든다)
  const model = withCostCap(deps.model ?? createModelClient(), deps.costCapUsd ?? tier.capUsd);
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // ⓪ 질문 해석 (DEC-033): 섹션 라벨 + 법률 용어 검색어. 실패하면 질문 문장으로 찾는 기존 방식 그대로 간다
  let understood: ReturnType<typeof screenUnderstanding> | null = null;
  if (!deps.noEvidence) deps.onStep?.({ stage: "intent", message: STEP_MESSAGES.understand });
  if (!deps.noEvidence)
    try {
      const res = await callModel(
        model,
        "understand",
        {
          model: UNDERSTAND_MODEL,
          max_tokens: UNDERSTAND_TOKENS.max,
          thinking: { type: "disabled" },
          // 지시문·라벨 목록은 요청마다 같아 캐시에서 싸게 다시 읽는다 (DEC-042)
          system: [{ type: "text", text: UNDERSTAND_SYSTEM, cache_control: { type: "ephemeral" } }],
          output_config: { format: { type: "json_schema", schema: UNDERSTAND_SCHEMA } },
          // 비슷한 질문의 라벨 예시를 골라 붙인다 (DEC-042 — 미세조정 대신 매번 관련 예시를 보여 준다)
          messages: [
            {
              role: "user",
              content: [
                examplesBlock(input.maskedText),
                userMessage(input.maskedText, context, materials),
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        },
        UNDERSTAND_TIMEOUT_MS,
        { minOutputTokens: UNDERSTAND_TOKENS.min },
      );
      usage = addUsage(usage, res);
      const parsed = UnderstandZ.safeParse(JSON.parse(textOf(res)));
      if (parsed.success) understood = screenUnderstanding(parsed.data, input.maskedText);
    } catch (e) {
      // 상한·시간 초과·형식 오류·모델 오류 모두 해석 없이 계속한다 (오류로 끝내지 않는다)
      if (!(e instanceof CostCapReached || e instanceof SyntaxError || e instanceof ApiError))
        throw e;
    }

  // 비서 대화 한마디(Haiku)는 검색과 함께 돌린다 — 같은 질문 1건 상한 안이고 실패해도 답변은 그대로 간다
  const talkRun = deps.assistant ? runTalk(model, deps.assistant.talkSystem, input) : null;
  // 일반 법률 질문(2026-11-27): 법제처 검색과 함께 법제처 밖 참고 자료를 웹 검색으로 찾는다 (따로 상한, 실패해도 답변은 그대로)
  const general = understood?.kind === "general" && !deps.assistant && !deps.noEvidence;
  // Light는 답변 상한이 작아(웹 검색 한 번이 상한의 수십 배) 참고 자료를 찾지 않는다. 예산을 따로 잡지 못해도 찾지 않는다
  const refsRun =
    general && tier.id !== "light" && deps.reserveWebRefs && (await deps.reserveWebRefs())
      ? runWebRefs(input.maskedText)
      : null;
  // 답변 먼저 (DEC-071, 2026-11-27 사용자 결정): 법제처 검색은 답변과 함께 돌리되 답변에는 넘기지 않는다.
  // 답변이 끝난 뒤 그 결과로 근거 목록을 채우고, 답변 속 조문·사건번호를 법제처에서 확인한다(verifyDraft).
  // 검색이 실패해도 답변은 그대로 나간다
  const EMPTY = { articles: [], cases: [], searches: [] } as Awaited<ReturnType<typeof freeSearch>>;
  const searchRun = deps.noEvidence
    ? Promise.resolve(EMPTY)
    : freeSearch(input.maskedText, {
        lawSource: source,
        caseHint: deps.caseHint,
        lawHints: deps.lawHints,
        wide: deps.deep,
        lawQuery: understood?.lawQuery,
        caseQueries: understood?.caseQueries,
      }).catch(() => EMPTY);
  // 비서 사례 판례(DEC-057)도 이 요청에서 법제처로 다시 가져와 근거 목록에만 넣는다. 가져오지 못하면 빠진다
  const pinnedRun = Promise.all(
    (deps.assistant?.pinnedCaseIds ?? []).map((id) => source.getCase(id).catch(() => null)),
  );
  // 답변 호출에 넘기는 근거는 비어 있다 — 모든 문단이 모델이 아는 법령·판례로 쓴 문단(MODEL_SOURCE)이다
  const answerEvidence = new EvidenceSet();
  // 대화 한마디는 답변 호출 전에 끝낸다 — 두 호출이 같은 상한을 동시에 재지 않게
  const talkOut = talkRun ? await talkRun : null;
  if (talkOut?.res) usage = addUsage(usage, talkOut.res);

  let points: DraftPoint[] = [];
  let dropped: DropReason[] = [];
  let materialRefs: MaterialRef[] = [];
  let costCapped = false;
  let spent = 0;

  let keys = liteEvidenceKeys(answerEvidence, deps.deep ? DEEP_EVIDENCE : undefined);
  // DEC-055: 법제처 근거가 없어도 모델이 아는 판례·조문으로 답한다 (출처 MODEL_SOURCE)
  {
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
            system: [
              { type: "text", text: LITE_ANSWER_SYSTEM },
              ...(deps.assistant ? [{ type: "text" as const, text: deps.assistant.persona }] : []),
              ...(general ? [{ type: "text" as const, text: GENERAL_ANSWER_ADDON }] : []),
            ],
            output_config: {
              effort: tier.effort,
              format: {
                type: "json_schema",
                schema: withMaterialRefs(answerSchema(keys), materials.length),
              },
            },
            messages: [
              {
                role: "user",
                content: [
                  userMessage(input.maskedText, context, materials),
                  `<근거_목록>\n${liteDigest(answerEvidence, keys) || NO_EVIDENCE}\n</근거_목록>`,
                  `출처로 쓸 수 있는 값: ${sourceEnum(keys).join(", ")}`,
                  materialsInstruction(materials.length),
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ],
          },
          tier.timeoutMs,
          { minOutputTokens: tier.answerTokens.min },
        );
        usage = addUsage(usage, res);
        const json: unknown = JSON.parse(textOf(res));
        const parsed = AnswerZ.safeParse(json);
        if (parsed.success) {
          ({ kept: points, dropped } = screenPoints(parsed.data.points, answerEvidence));
          materialRefs = materialRefsOf(json, materials.length);
        } else costCapped = true;
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
  const refsOut = refsRun ? await refsRun : null;
  // 답변 뒤 법제처 확인 단계: 검색 결과로 근거 목록을 채운다 (진행 표시는 답변 → 법제처 순서)
  if (!deps.noEvidence) deps.onStep?.({ stage: "search", message: STEP_MESSAGES.search });
  const [found, pinned] = await Promise.all([searchRun, pinnedRun]);
  const evidence = new EvidenceSet();
  for (const a of found.articles) evidence.addArticle(a);
  for (const c of pinned) if (c) evidence.addCase(c);
  for (const c of found.cases) evidence.addCase(c);

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
    relatedSections: understood?.others,
    channel: understood?.channel,
  });
  return {
    draft,
    evidence,
    dropped,
    usage,
    model: tier.model,
    promptVersion: [
      LITE_PROMPT_VERSION,
      deps.assistant?.promptTag,
      materials.length > 0 ? MATERIALS_ANSWER_VERSION : null,
    ]
      .filter(Boolean)
      .join("+"),
    costUsd: spent,
    costCapped,
    newLabel: understood?.newLabel ?? null,
    ...(talkOut && { talk: talkOut.talk }),
    materialRefs,
    questionKind: general ? "general" : "case",
    ...(refsOut && { references: refsOut.refs, refsCostUsd: refsOut.costUsd }),
  };
}

/** 분야별 비서의 대화 한마디 (DEC-057): Haiku 1회 → screenTalk. 상한·시간·형식 오류는 한마디 없이 null */
async function runTalk(
  model: ModelClient,
  system: string,
  input: { maskedText: string; context?: FollowupTurn[] },
): Promise<{ talk: AssistantTalk | null; res: ModelMessage | null }> {
  try {
    const res = await callModel(
      model,
      "talk",
      {
        model: UNDERSTAND_MODEL,
        max_tokens: TALK_TOKENS.max,
        thinking: { type: "disabled" },
        system: [{ type: "text", text: system }],
        output_config: { format: { type: "json_schema", schema: TALK_SCHEMA } },
        messages: [{ role: "user", content: userMessage(input.maskedText, input.context ?? []) }],
      },
      UNDERSTAND_TIMEOUT_MS,
      { minOutputTokens: TALK_TOKENS.min },
    );
    let talk: AssistantTalk | null = null;
    try {
      talk = screenTalk(JSON.parse(textOf(res)));
    } catch {
      talk = null;
    }
    return { talk, res };
  } catch (e) {
    if (e instanceof CostCapReached || e instanceof SyntaxError || e instanceof ApiError)
      return { talk: null, res: null };
    throw e;
  }
}
