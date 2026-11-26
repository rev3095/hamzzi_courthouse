// DeepSearch 심층 분석 (DEC-041). 일반 질문(lite.ts)과 다른 점:
// ① 사건 구조화 — Haiku 1회로 당사자·사실 순서·쟁점·확인할 사실을 뽑는다 (일반 질문의 "질문 해석" 자리)
// ② 쟁점별 검색 — 쟁점마다 그 법률에서 조문을 따로 찾고, 쟁점의 판례 검색어로도 찾는다 (법제처, 무료)
// ③ 쟁점별 답변 — 고른 단계의 모델 1회. 문단마다 쟁점 번호를 붙이고, 사실에 따라 갈리는 곳은 경우를 나눠 쓴다
// ④ 시각자료 — 구조와 검증을 통과한 문단으로 화면이 그린다 (모델 추가 호출 없음)
// 모델 호출은 ①과 ③ 두 번뿐이고 재시도하지 않는다. 질문 1건 상한은 일반 질문의 2배(TIERS[tier].deep).
// 구조화가 실패하면 일반 답변(runLiteAnalysis, deep 근거 확대)으로 내려간다 — 오류로 끝내지 않는다.
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
import {
  DEEP_LIMITS,
  DEEP_STRUCT_SCHEMA,
  DeepAnswerZ,
  DeepStructZ,
  deepAnswerSchema,
  screenPlan,
  screenStruct,
  type DeepPlan,
  type DeepDraftPoint,
  type DeepStruct,
} from "./deep-policy";
import {
  LITE_PROMPT_VERSION,
  NO_EVIDENCE,
  liteDigest,
  liteEvidenceKeys,
  runLiteAnalysis,
  type LiteAnalysisOutput,
} from "./lite";
import { userMessage } from "./message";
import type { MaterialReading } from "@/lib/materials/limits";
import {
  MATERIALS_ANSWER_VERSION,
  materialRefsOf,
  materialsInstruction,
  materialsPlainText,
  withMaterialRefs,
  type MaterialRef,
} from "@/lib/materials/policy";
import { longDeepOf, tierOf, type TierId } from "./models";
import {
  OffTopicQuestion,
  STEP_MESSAGES,
  assembleDraft,
  screenPoints,
  sourceEnum,
  type DraftPoint,
  type DropReason,
  type FollowupTurn,
  type StepEvent,
} from "./policy";
import { DEEP_ANSWER_SYSTEM, DEEP_PLAN_SYSTEM, DEEP_STRUCT_SYSTEM } from "./prompts";

export const DEEP_PROMPT_VERSION = "deep-2026-11-27-off-topic";
/** 긴 질문(DEC-062) 답변의 프롬프트 꼬리표. 정리판 지시문을 바꾸면 올린다 */
export const LONG_PROMPT_TAG = "long-plan-3-rebuttals";
export const DEEP_STRUCT_MODEL = "claude-haiku-5-5";
// 2026-11-19 첫 실호출에서 구조화가 실패해 일반 답변으로 내려갔다. 사실 8개·쟁점 4개·확인할 사실 5개를 한국어 JSON으로
// 쓰면 1,000토큰을 넘을 수 있어(출력 한도 초과 = 실패) 한도를 2,000으로 늘렸다. Haiku 출력 2,000토큰 = $0.001
export const DEEP_STRUCT_TOKENS = { max: 2_000, min: 600 } as const;
const STRUCT_TIMEOUT_MS = 20_000;

export type DeepAnalysisOutput = LiteAnalysisOutput & {
  /** 거른 사건 구조. 구조화가 실패해 일반 답변으로 내려갔으면 null */
  struct: DeepStruct | null;
  /** 쟁점 번호가 붙은 초안 문단 (검증 뒤 쟁점에 다시 잇는 데 쓴다) */
  drafted: { issue: number; text: string }[];
  /** 사건 정리판 (DEC-062, 긴 질문만). 없거나 모두 걸러졌으면 null */
  plan?: DeepPlan | null;
};

/** 사건 구조를 답변 모델에 보여 주는 글 */
export function structDigest(s: DeepStruct): string {
  const lines = [
    "당사자: " + s.parties.map((p) => (p.role ? `${p.label}(${p.role})` : p.label)).join(", "),
    "쟁점:",
    ...s.issues.map((i, n) => `${n + 1}. ${i.title}`),
  ];
  if (s.unknowns.length > 0) {
    lines.push("사연에 적히지 않은 사실:", ...s.unknowns.map((u) => `- ${u}`));
  }
  return lines.join("\n");
}

export async function runDeepAnalysis(
  input: { maskedText: string; context?: FollowupTurn[]; materials?: MaterialReading[] },
  deps: {
    model?: ModelClient;
    lawSource?: LawSource;
    onStep?: (e: StepEvent) => void;
    tier?: TierId;
    costCapUsd?: number;
    caseHint?: string | null;
    lawHints?: { lawName: string; articleNos: string[] }[];
    /** 꼭 근거에 넣을 판례 일련번호 — 그 요청에서 법제처로 다시 가져온다 (전문 에이전트 아카이브 만들기, DEC-057) */
    pinnedCaseIds?: string[];
    /** 판례 아카이브에서 사용자가 근거로 고른 판례(DEC-070) — 답변 전에 가져와 답변에 넘긴다 (답변 먼저 DEC-071의 예외) */
    focusCaseIds?: string[];
    /** 답변이 어긋나지 않게 할 검토 메모 (아카이브 만들기 전용, 사용자 입력이 아니다) */
    notes?: string;
    /** 긴 질문(DEC-062): 고른 단계의 모델로 답하고 사건 정리판(종류·당사자 자리와 대응·준비 자료)을 함께 받는다 */
    long?: boolean;
    /** 분야별 비서(DEC-057)의 말투 지시문 — 긴 비서 질문도 DeepSearch로 간다 (DEC-062) */
    persona?: string;
    /** 프롬프트 버전 꼬리표 (비서 지시문 버전 등) */
    promptTag?: string;
    /** 답변 effort를 단계 값 대신 쓴다 — 미리 만드는 예시(가상 사건 프리셋 보강)에서만 쓴다. 서비스 요청 경로는 단계 값 그대로 */
    effort?: "low" | "medium" | "high";
    /** 답변 출력 한도를 단계 값 대신 쓴다 (미리 만드는 예시 전용) */
    answerMaxTokens?: number;
  } = {},
): Promise<DeepAnalysisOutput> {
  const tier = tierOf(deps.tier);
  // 답변 호출 설정: 긴 질문은 고른 단계의 긴 질문 설정(사건 정리판 몫만큼 크다), 그 밖은 그 단계의 DeepSearch 설정
  const long = longDeepOf(tier.id);
  const answer = deps.long
    ? {
        effort: long.effort,
        tokens: long.answerTokens,
        timeoutMs: long.timeoutMs,
        capUsd: long.capUsd,
      }
    : {
        effort: tier.effort,
        tokens: tier.deep.answerTokens,
        timeoutMs: tier.deep.timeoutMs,
        capUsd: tier.deep.capUsd,
      };
  const context = input.context ?? [];
  // 첨부 자료(DEC-058)는 사용자 자료로 구조화·답변에 함께 넘긴다. 근거 키가 아니라 인용할 수 없다
  const materials = input.materials ?? [];
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  // 구조·정리판에 쓸 수 있는 숫자의 원문 = 사용자가 적은 글 (질문 + 가린 첨부 자료)
  const userText = materials.length
    ? `${input.maskedText}\n${materialsPlainText(materials)}`
    : input.maskedText;
  // 구조화와 답변이 질문 1건 상한 하나를 함께 쓴다
  const model = withCostCap(deps.model ?? createModelClient(), deps.costCapUsd ?? answer.capUsd);
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // ① 사건 구조화
  let struct: DeepStruct | null = null;
  // 구조화가 왜 안 됐는지 (고정 낱말만 — 사연 내용은 담지 않는다). 일반 답변으로 내려갈 때 프롬프트 버전에 붙여 남긴다
  let structFailure = "no_issues";
  deps.onStep?.({ stage: "intent", message: STEP_MESSAGES.understand });
  try {
    const res = await callModel(
      model,
      "deep_struct",
      {
        model: DEEP_STRUCT_MODEL,
        max_tokens: DEEP_STRUCT_TOKENS.max,
        thinking: { type: "disabled" },
        system: [{ type: "text", text: DEEP_STRUCT_SYSTEM }],
        output_config: { format: { type: "json_schema", schema: DEEP_STRUCT_SCHEMA } },
        messages: [{ role: "user", content: userMessage(input.maskedText, context, materials) }],
      },
      STRUCT_TIMEOUT_MS,
      { minOutputTokens: DEEP_STRUCT_TOKENS.min },
    );
    usage = addUsage(usage, res);
    const parsed = DeepStructZ.safeParse(JSON.parse(textOf(res)));
    // 사건 구조의 항목은 사용자가 적은 글(질문 + 가린 첨부 자료)에 있는 숫자만 쓸 수 있다
    // 남용 막기 (DEC-072): 법률과 상관없는 요청이면 답변 모델·검색을 부르지 않고 멈춘다
    if (parsed.success && parsed.data.offTopic) throw new OffTopicQuestion(model.spentUsd());
    if (parsed.success)
      struct = screenStruct(
        parsed.data,
        materials.length
          ? `${input.maskedText}\n${materialsPlainText(materials)}`
          : input.maskedText,
      );
    else structFailure = "format";
  } catch (e) {
    if (!(e instanceof CostCapReached || e instanceof SyntaxError || e instanceof ApiError))
      throw e;
    if (e instanceof ApiError) {
      const d = (e.details ?? {}) as Record<string, unknown>;
      structFailure = `${e.code}:${String(d.reason ?? d.status ?? "")}`.slice(0, 40);
    } else structFailure = e instanceof CostCapReached ? "budget" : "json";
  }
  // 쟁점을 하나도 못 뽑았으면 일반 답변으로 (근거만 넓게). 구조화에 쓴 비용은 상한에서 빼 준다
  if (!struct || struct.issues.length === 0) {
    const spentOnStruct = model.spentUsd();
    const lite = await runLiteAnalysis(input, {
      model: deps.model,
      lawSource: source,
      onStep: deps.onStep,
      tier: tier.id,
      // 긴 질문 몫(analyze가 deep 상한에 더한 값)은 일반 답변으로 내려가도 그대로 넘긴다
      costCapUsd: Math.max(
        0,
        (deps.costCapUsd !== undefined ? deps.costCapUsd - answer.capUsd : 0) +
          tier.capUsd -
          spentOnStruct,
      ),
      caseHint: deps.caseHint,
      lawHints: deps.lawHints,
      deep: true,
      ...(deps.focusCaseIds?.length && { focusCaseIds: deps.focusCaseIds }),
    }).catch((e: unknown) => {
      // 법률 무관으로 멈춰도 이미 쓴 구조화 비용을 함께 넘긴다 (정산이 실제보다 적지 않게)
      if (e instanceof OffTopicQuestion) throw new OffTopicQuestion(spentOnStruct + e.costUsd);
      throw e;
    });
    return {
      ...lite,
      usage: {
        inputTokens: usage.inputTokens + lite.usage.inputTokens,
        outputTokens: usage.outputTokens + lite.usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens + lite.usage.cacheReadTokens,
      },
      costUsd: spentOnStruct + lite.costUsd,
      promptVersion: `${lite.promptVersion}+deep-fallback:${structFailure}`,
      struct: null,
      drafted: [],
    };
  }

  // ② 쟁점별 검색 (법제처, 무료). 답변 먼저(DEC-071): 답변과 함께 돌리되 답변에는 넘기지 않고, 답변 뒤 근거 목록과
  //    인용 확인에만 쓴다. 쟁점의 법률에서 찾은 조문을 앞에 두고, 사연 전체 검색 결과를 뒤에 잇는다
  const EMPTY = { articles: [], cases: [], searches: [] } as Awaited<ReturnType<typeof freeSearch>>;
  const searchRun = Promise.all([
    Promise.allSettled(
      struct.issues.map((i) =>
        i.lawName && i.lawKeywords.length > 0
          ? source.findArticles(i.lawName, i.lawKeywords, DEEP_LIMITS.articlesPerIssue)
          : Promise.resolve([]),
      ),
    ),
    freeSearch(input.maskedText, {
      lawSource: source,
      caseHint: deps.caseHint,
      lawHints: deps.lawHints,
      wide: true,
      lawQuery: struct.lawQuery,
      caseQueries: struct.issues.flatMap((i) => (i.caseQuery ? [i.caseQuery] : [])).slice(0, 3),
    }).catch(() => EMPTY),
    Promise.all((deps.pinnedCaseIds ?? []).map((id) => source.getCase(id).catch(() => null))),
  ]);
  // 답변 호출에 넘기는 근거는 사용자가 고른 판례뿐이다 — 그 밖의 문단은 모델이 아는 법령·판례로 쓴 문단(MODEL_SOURCE)
  const focused = await Promise.all(
    [...new Set(deps.focusCaseIds ?? [])].map((id) => source.getCase(id).catch(() => null)),
  );
  const answerEvidence = new EvidenceSet();
  for (const c of focused) if (c) answerEvidence.addCase(c);

  // ③ 쟁점별 답변
  let points: DraftPoint[] = [];
  let drafted: DeepDraftPoint[] = [];
  let dropped: DropReason[] = [];
  let materialRefs: MaterialRef[] = [];
  let plan: DeepPlan | null = null;
  let costCapped = false;
  let keys = liteEvidenceKeys(answerEvidence, {
    articles: DEEP_LIMITS.articles,
    cases: DEEP_LIMITS.cases,
  });
  // DEC-055: 법제처 근거가 없어도 모델이 아는 판례·조문으로 답한다 (출처 MODEL_SOURCE)
  {
    deps.onStep?.({ stage: "answer", message: STEP_MESSAGES.answer });
    // 예산을 넘으면 마지막 근거를 하나 빼고 다시 잰다 (토큰 세기는 무과금, 생성 호출은 한 번뿐)
    for (;;) {
      try {
        const res = await callModel(
          model,
          "deep_answer",
          {
            model: tier.model,
            max_tokens: deps.answerMaxTokens ?? answer.tokens.max,
            thinking: tier.thinking,
            system: [
              { type: "text", text: DEEP_ANSWER_SYSTEM },
              ...(deps.long ? [{ type: "text" as const, text: DEEP_PLAN_SYSTEM }] : []),
              ...(deps.persona ? [{ type: "text" as const, text: deps.persona }] : []),
            ],
            output_config: {
              effort: deps.effort ?? answer.effort,
              format: {
                type: "json_schema",
                schema: withMaterialRefs(
                  deepAnswerSchema(
                    keys,
                    struct.issues.length,
                    deps.long ? struct.parties.map((p) => p.label) : undefined,
                  ),
                  materials.length,
                ),
              },
            },
            messages: [
              {
                role: "user",
                content: [
                  userMessage(input.maskedText, context, materials),
                  `<사건_구조>\n${structDigest(struct)}\n</사건_구조>`,
                  ...(deps.notes
                    ? [
                        `<검토_메모>\n이 메모와 어긋나게 쓰지 않습니다. 메모의 내용도 근거 목록에 그 근거가 있을 때만 근거 문단으로 씁니다.\n${deps.notes}\n</검토_메모>`,
                      ]
                    : []),
                  `<근거_목록>\n${liteDigest(answerEvidence, keys) || NO_EVIDENCE}\n</근거_목록>`,
                  `출처로 쓸 수 있는 값: ${sourceEnum(keys).join(", ")}`,
                  materialsInstruction(materials.length),
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ],
          },
          answer.timeoutMs,
          { minOutputTokens: answer.tokens.min },
        );
        usage = addUsage(usage, res);
        const json: unknown = JSON.parse(textOf(res));
        const parsed = DeepAnswerZ.safeParse(json);
        if (parsed.success) {
          drafted = parsed.data.points;
          // 사건 정리판(DEC-062)도 구조와 같은 규칙으로 거른다 — 숫자는 사용자가 적은 글에 있는 것만
          if (deps.long)
            plan = screenPlan(
              parsed.data.plan,
              struct.parties.map((p) => p.label),
              userText,
              struct.issues.length,
            );
          materialRefs = materialRefsOf(json, materials.length);
          // 1차 거르기는 일반 답변과 같은 규칙. 쟁점마다 따로 걸러 문단 수 한도를 쟁점 단위로 적용한다
          for (let n = 1; n <= struct.issues.length; n++) {
            const mine = drafted.filter((p) => p.issue === n).slice(0, DEEP_LIMITS.pointsPerIssue);
            const screened = screenPoints(
              mine.map(({ text, source: src, quote }) => ({ text, source: src, quote })),
              answerEvidence,
            );
            points = [...points, ...screened.kept];
            dropped = [...dropped, ...screened.dropped];
          }
        } else costCapped = true;
        break;
      } catch (e) {
        if (e instanceof CostCapReached && keys.length > 1) {
          keys = keys.slice(0, -1);
          continue;
        }
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

  // 답변 뒤 법제처 확인 단계: 검색 결과로 근거 목록을 채운다 (진행 표시는 답변 → 법제처 순서)
  deps.onStep?.({ stage: "search", message: STEP_MESSAGES.search });
  const [byIssue, found, pinned] = await searchRun;
  const evidence = new EvidenceSet();
  for (const r of byIssue)
    if (r.status === "fulfilled") for (const a of r.value) evidence.addArticle(a);
  for (const a of found.articles) evidence.addArticle(a);
  for (const c of focused) if (c) evidence.addCase(c);
  for (const c of pinned) if (c) evidence.addCase(c);
  for (const c of found.cases) evidence.addCase(c);

  const draft = assembleDraft({
    maskedText: input.maskedText,
    intent: {
      area: "",
      goal: "",
      laws: [
        ...new Set(evidence.list().flatMap((i) => (i.kind === "statute" ? [i.ref.lawName] : []))),
      ],
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
    answerEvidence,
    dropped,
    usage,
    model: tier.model,
    promptVersion: `${DEEP_PROMPT_VERSION}${deps.long ? `+${LONG_PROMPT_TAG}` : ""}${deps.promptTag ? `+${deps.promptTag}` : ""}+${LITE_PROMPT_VERSION}${
      materials.length > 0 ? `+${MATERIALS_ANSWER_VERSION}` : ""
    }`,
    costUsd: model.spentUsd(),
    costCapped,
    materialRefs,
    struct,
    plan,
    drafted: drafted.map((d) => ({ issue: d.issue, text: d.text })),
  };
}
