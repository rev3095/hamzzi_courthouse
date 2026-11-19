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
  screenStruct,
  type DeepDraftPoint,
  type DeepStruct,
} from "./deep-policy";
import {
  LITE_PROMPT_VERSION,
  liteDigest,
  liteEvidenceKeys,
  runLiteAnalysis,
  type LiteAnalysisOutput,
} from "./lite";
import { userMessage } from "./message";
import { tierOf, type TierId } from "./models";
import {
  STEP_MESSAGES,
  assembleDraft,
  screenPoints,
  type DraftPoint,
  type DropReason,
  type FollowupTurn,
  type StepEvent,
} from "./policy";
import { DEEP_ANSWER_SYSTEM, DEEP_STRUCT_SYSTEM } from "./prompts";

export const DEEP_PROMPT_VERSION = "deep-2026-11-19";
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
  input: { maskedText: string; context?: FollowupTurn[] },
  deps: {
    model?: ModelClient;
    lawSource?: LawSource;
    onStep?: (e: StepEvent) => void;
    tier?: TierId;
    costCapUsd?: number;
    caseHint?: string | null;
    lawHints?: { lawName: string; articleNos: string[] }[];
  } = {},
): Promise<DeepAnalysisOutput> {
  const tier = tierOf(deps.tier);
  const context = input.context ?? [];
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  // 구조화와 답변이 질문 1건 상한 하나를 함께 쓴다
  const model = withCostCap(deps.model ?? createModelClient(), deps.costCapUsd ?? tier.deep.capUsd);
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
        messages: [{ role: "user", content: userMessage(input.maskedText, context) }],
      },
      STRUCT_TIMEOUT_MS,
      { minOutputTokens: DEEP_STRUCT_TOKENS.min },
    );
    usage = addUsage(usage, res);
    const parsed = DeepStructZ.safeParse(JSON.parse(textOf(res)));
    if (parsed.success) struct = screenStruct(parsed.data, input.maskedText);
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
      costCapUsd: Math.max(0, tier.capUsd - spentOnStruct),
      caseHint: deps.caseHint,
      lawHints: deps.lawHints,
      deep: true,
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

  // ② 쟁점별 검색 (법제처, 무료). 쟁점의 법률에서 찾은 조문을 앞에 두고, 사연 전체 검색 결과를 뒤에 잇는다
  const [byIssue, found] = await Promise.all([
    Promise.allSettled(
      struct.issues.map((i) =>
        i.lawName && i.lawKeywords.length > 0
          ? source.findArticles(i.lawName, i.lawKeywords, DEEP_LIMITS.articlesPerIssue)
          : Promise.resolve([]),
      ),
    ),
    freeSearch(input.maskedText, {
      lawSource: source,
      onStep: deps.onStep,
      caseHint: deps.caseHint,
      lawHints: deps.lawHints,
      wide: true,
      lawQuery: struct.lawQuery,
      caseQueries: struct.issues.flatMap((i) => (i.caseQuery ? [i.caseQuery] : [])).slice(0, 3),
    }),
  ]);
  const evidence = new EvidenceSet();
  for (const r of byIssue)
    if (r.status === "fulfilled") for (const a of r.value) evidence.addArticle(a);
  for (const a of found.articles) evidence.addArticle(a);
  for (const c of found.cases) evidence.addCase(c);

  // ③ 쟁점별 답변
  let points: DraftPoint[] = [];
  let drafted: DeepDraftPoint[] = [];
  let dropped: DropReason[] = [];
  let costCapped = false;
  let keys = liteEvidenceKeys(evidence, {
    articles: DEEP_LIMITS.articles,
    cases: DEEP_LIMITS.cases,
  });
  if (keys.length > 0) {
    deps.onStep?.({ stage: "answer", message: STEP_MESSAGES.answer });
    // 예산을 넘으면 마지막 근거를 하나 빼고 다시 잰다 (토큰 세기는 무과금, 생성 호출은 한 번뿐)
    for (;;) {
      try {
        const res = await callModel(
          model,
          "deep_answer",
          {
            model: tier.model,
            max_tokens: tier.deep.answerTokens.max,
            thinking: tier.thinking,
            system: [{ type: "text", text: DEEP_ANSWER_SYSTEM }],
            output_config: {
              effort: tier.effort,
              format: { type: "json_schema", schema: deepAnswerSchema(keys, struct.issues.length) },
            },
            messages: [
              {
                role: "user",
                content: [
                  userMessage(input.maskedText, context),
                  `<사건_구조>\n${structDigest(struct)}\n</사건_구조>`,
                  `<근거_목록>\n${liteDigest(evidence, keys)}\n</근거_목록>`,
                  `출처로 쓸 수 있는 근거 키: ${keys.join(", ")}`,
                ].join("\n\n"),
              },
            ],
          },
          tier.deep.timeoutMs,
          { minOutputTokens: tier.deep.answerTokens.min },
        );
        usage = addUsage(usage, res);
        const parsed = DeepAnswerZ.safeParse(JSON.parse(textOf(res)));
        if (parsed.success) {
          drafted = parsed.data.points;
          // 1차 거르기는 일반 답변과 같은 규칙. 쟁점마다 따로 걸러 문단 수 한도를 쟁점 단위로 적용한다
          for (let n = 1; n <= struct.issues.length; n++) {
            const mine = drafted.filter((p) => p.issue === n).slice(0, DEEP_LIMITS.pointsPerIssue);
            const screened = screenPoints(
              mine.map(({ text, source: src, quote }) => ({ text, source: src, quote })),
              evidence,
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
    dropped,
    usage,
    model: tier.model,
    promptVersion: `${DEEP_PROMPT_VERSION}+${LITE_PROMPT_VERSION}`,
    costUsd: model.spentUsd(),
    costCapped,
    struct,
    drafted: drafted.map((d) => ({ issue: d.issue, text: d.text })),
  };
}
