// 데모 분석 오케스트레이터 (PRD 8.2 데모 파이프라인, DEC-009·011·013). 라우트는 runDemoAnalysis만 부른다.
// 입력은 마스킹본만. 결과는 검증 전 초안이고, 인용 검증(원문 대조·재조회)은 lib/citations(P4)가 한다.
// 전체 시간 예산 안에서 단계별 한도를 나눈다: 답변과 검증 몫을 남기고, 모자라면 재검색을 줄인다.
import "server-only";
import { EvidenceSet } from "@/lib/search/evidence";
import { createLawSource, type LawSource } from "@/lib/search/law-source";
import { agentSearch } from "./agent";
import { writeAnswer } from "./answer";
import { addUsage, createModelClient, type ModelClient, type Usage } from "./client";
import { initialSearch } from "./gather";
import { analyzeIntent } from "./intent";
import {
  MODELS,
  STEP_MESSAGES,
  assembleDraft,
  citableKeys,
  screenPoints,
  type DemoDraft,
  type DraftPoint,
  type DropReason,
  type FollowupTurn,
  type StepEvent,
} from "./policy";
import { PROMPT_VERSION } from "./prompts";

/** 데모 응답 기준 p95 ≤ 90초 (DEC-014). 재검색 3라운드를 돌릴 수 있게 잡고, 라우트·검증 몫은 뺀다 */
export const DEFAULT_BUDGET_MS = 100_000;
const INTENT_CAP_MS = 12_000;
const AGENT_ROUND_CAP_MS = 20_000;
const ANSWER_CAP_MS = 40_000;
/** 답변이 쓸 최소 시간 — 재검색은 이만큼을 남기고 멈춘다 */
const ANSWER_RESERVE_MS = 30_000;
/** P4 인용 재조회 몫 */
const VERIFY_RESERVE_MS = 4_000;

export type DemoAnalysisInput = { maskedText: string; context?: FollowupTurn[] };

export type DemoAnalysisDeps = {
  model?: ModelClient;
  lawSource?: LawSource;
  onStep?: (e: StepEvent) => void;
  budgetMs?: number;
  now?: () => number;
  /** 재검색 강도 (기본 low). 평가 비교용 */
  agentEffort?: "low" | "medium" | "high";
};

export type DemoAnalysisOutput = {
  draft: DemoDraft;
  /** 인용 검증기(P4)에 넘긴다. 요청 메모리에서만 쓰고 저장하지 않는다 (DEC-007) */
  evidence: EvidenceSet;
  dropped: DropReason[];
  usage: Usage;
  model: string;
  promptVersion: string;
};

export async function runDemoAnalysis(
  input: DemoAnalysisInput,
  deps: DemoAnalysisDeps = {},
): Promise<DemoAnalysisOutput> {
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.budgetMs ?? DEFAULT_BUDGET_MS);
  const remaining = () => deadline - now();
  const model = deps.model ?? createModelClient();
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  const step = deps.onStep ?? (() => {});
  const context = input.context ?? [];
  let usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  // ① 의도
  step({ stage: "intent", message: STEP_MESSAGES.intent });
  const intentRun = await analyzeIntent(
    model,
    { maskedText: input.maskedText, context },
    Math.min(INTENT_CAP_MS, remaining() - ANSWER_RESERVE_MS),
  );
  usage = addUsage(usage, intentRun.res);
  const intent = intentRun.intent;

  // ② 1차 검색
  step({ stage: "search", message: STEP_MESSAGES.search });
  const evidence = new EvidenceSet();
  const first = await initialSearch(source, intent, evidence);
  step({ stage: "search", message: STEP_MESSAGES.search, added: first.added });

  // ③ 에이전트 재검색 (답변 몫을 남기고)
  step({ stage: "agent", message: STEP_MESSAGES.agent });
  const trace = await agentSearch(
    {
      model,
      source,
      effort: deps.agentEffort,
      timeLeft: () => Math.min(AGENT_ROUND_CAP_MS, remaining() - ANSWER_RESERVE_MS),
      onRound: (r) =>
        step({
          stage: "agent",
          message: STEP_MESSAGES.agent,
          added: r.trace.flatMap((t) => t.added),
        }),
      onResponse: (res) => {
        usage = addUsage(usage, res);
      },
    },
    { maskedText: input.maskedText, context, intent },
    evidence,
  );

  // ④ 답변 — 출처로 쓸 근거가 없으면 모델을 부르지 않는다 (F-006, no_result_in_scope)
  let points: DraftPoint[] = [];
  let dropped: DropReason[] = [];
  const keys = citableKeys(evidence);
  if (keys.length > 0) {
    step({ stage: "answer", message: STEP_MESSAGES.answer });
    const answer = await writeAnswer(
      model,
      { maskedText: input.maskedText, context, intent },
      evidence,
      keys,
      Math.min(ANSWER_CAP_MS, remaining() - VERIFY_RESERVE_MS),
    );
    usage = addUsage(usage, answer.res);
    ({ kept: points, dropped } = screenPoints(answer.points, evidence));
  }

  return {
    draft: assembleDraft({
      maskedText: input.maskedText,
      intent,
      points,
      evidence,
      searches: first.searches,
      trace,
    }),
    evidence,
    dropped,
    usage,
    model: MODELS.answer,
    promptVersion: PROMPT_VERSION,
  };
}
