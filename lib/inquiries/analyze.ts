// 질문 1건 분석 실행 (P5, API.md 4.1 데모). 무료 모드: 재생·법제처 검색 전용 / 유료: 사용자가 고른 단계로 답변(lib/ai) → 인용 검증(lib/citations).
// 어느 쪽이든 횟수 차감·저장은 한 트랜잭션 (DEC-010, DEC-015).
// 근거 모음(EvidenceSet)은 이 함수 안에서만 쓰고 저장하지 않는다 (DEC-007).
import "server-only";
import { aiMode } from "@/lib/ai/mode";
import { ASSISTANTS, type AssistantId } from "@/lib/assistants/agents";
import { assistantLiteOptions } from "@/lib/assistants/run-config";
import { settleAiQuota, tryAiQuota } from "@/lib/auth/rate-limit";
import { WEB_REFS_WEIGHT } from "@/lib/ai/web-refs";
import { runDeepAnalysis } from "@/lib/ai/deep";
import { buildDeepMap } from "@/lib/ai/deep-policy";
import { runLiteAnalysis } from "@/lib/ai/lite";
import { longInputAllowanceUsd } from "@/lib/ai/cost";
import { stageClock } from "@/lib/ai/timing";
import type { QuickPreview } from "@/lib/ai/quick-policy";
import { QUICK_MODEL, runQuickPreview } from "@/lib/ai/quick";
import {
  BUDGET_UNIT_USD,
  longDeepOf,
  QUICK_WEIGHT,
  isLongQuestion,
  tierOf,
  type TierId,
} from "@/lib/ai/models";
import type { StepEvent } from "@/lib/ai/policy";
import { verifyDraft } from "@/lib/citations/verify";
import { runFreeAnalysis } from "@/lib/demo/free";
import { CATEGORIES, type CategoryKey } from "@/lib/procedure/categories";
import { FREE_PROMPT_VERSION, findExampleFor } from "@/lib/demo/policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { buildMaterialsMap, materialsChars, readStoredMaterials } from "@/lib/materials/policy";
import type { MaterialRef } from "@/lib/materials/map";
import {
  finishAnalysis,
  loadFollowupContext,
  markInquiryFailed,
  type InquiryRow,
  type Owner,
} from "./store";
import { answerTierFor } from "./policy";
import { procedureHintFor, saveLabelProposal } from "./procedure-hint";

/** 라우트 maxDuration(300초, 2026-11-25 Opus high) 안에 검증·저장까지 끝나도록 분석 예산을 잡는다 (DEC-014, 목표 p95 ≤ 90초) */
export const ANALYSIS_BUDGET_MS = 280_000;

export async function analyzeInquiry(
  inquiry: InquiryRow,
  owner: Owner,
  headers: Headers,
  onStep?: (e: StepEvent) => void,
  opts: {
    category?: CategoryKey | null;
    tier?: TierId | null;
    deep?: boolean;
    /** 빠른 답 먼저 (DEC-064): 주면 유료 분석과 동시에 Haiku 요약을 만들어 넘긴다 (SSE 요청만) */
    onPreview?: (p: QuickPreview) => void;
    /** 분야별 비서 (DEC-057). 지시문·고정 근거만 바꾸고 횟수·상한·검증은 일반 질문과 같다 */
    assistant?: AssistantId | null;
    /** 판례 아카이브 질문창 (DEC-070): 답변 단계를 Light(Haiku)로 고정한다. 횟수·상한·검증은 일반 질문과 같다 */
    archive?: boolean;
    /** 질문창에서 근거에 넣을 판례 일련번호 (보고 있던 판례). 법제처에서 다시 가져온 것만 쓴다 */
    focusCaseIds?: string[];
  } = {},
): Promise<{ resultId: string; result: DemoAnalysisResult }> {
  // 홈 카테고리(DEC-028)는 무료 판례 검색에 정해 둔 법률 용어 하나를 더할 뿐, 분류·답변을 모델이 정하게 하지 않는다
  // 분야별 비서(DEC-057)는 카테고리가 없을 때 비서의 고정 검색어·조문을 같은 자리에 쓴다
  const assistant = opts.assistant ? ASSISTANTS[opts.assistant] : null;
  const caseHint = opts.category
    ? CATEGORIES[opts.category].caseQuery
    : (assistant?.caseHint ?? null);
  const lawHints = opts.category ? CATEGORIES[opts.category].lawHints : assistant?.lawHints;
  const started = Date.now();
  // 단계별 시간 (DEC-063): 진행 신호마다 시각을 붙여 결과의 timing으로 남긴다 — 속도 보고서·결과 화면이 읽는다
  const clock = stageClock();
  const step = (e: StepEvent) => {
    clock.mark(e.stage);
    onStep?.(e);
  };
  try {
    // 무료 모드(기본, DEC-015): Claude를 부르지 않는다. 예시 질문 재생 또는 법제처 검색 전용.
    // 유료 모드라도 예시 질문은 미리 만든 분석을 재생한다(비용 0). 주간 전체 상한(DEC-019·020·026·031, 기본 $80)을
    // 넘으면 그 주는 무료 모드로 처리한다 — 운영자 최대 비용 고정.
    // 비로그인 하루 횟수 제한·저장은 유료 모드와 같은 트랜잭션으로 처리한다 (절대 규칙 7).
    // 예시 질문 재생은 해석이 필요 없는 저장된 결과라 횟수를 차감하지 않는다 (DEC-027). 주간 카운터도 세지 않는다
    // 주간 예산은 단계 가중치만큼 차감한다 (DEC-036: Light 2 · Pro 20 · Pro Max 100단위)
    // 분야별 비서는 고른 단계와 상관없이 ASSISTANT_ANSWER_TIER로 답한다 (DEC-057, 2026-11-27부터 Pro = Sonnet 5.5)
    // 긴 질문(100자 초과, DEC-062)은 DeepSearch 버튼과 상관없이 DeepSearch로, 고른 단계의 긴 질문 설정으로 답한다 (2026-11-27 — xhigh 사용 금지).
    // 분야별 비서 질문도 길면 DeepSearch로 간다(비서 말투·고정 근거는 그대로 넘긴다, 사용자 결정 2026-11-25)
    const long = isLongQuestion(inquiry.masked_text);
    // 판례 아카이브 질문창(DEC-070)은 화면이 보낸 단계와 상관없이 Light(Haiku)로 답한다
    const tier = tierOf(
      answerTierFor({ assistant: !!assistant, archive: !!opts.archive, tier: opts.tier }),
    );
    const focusCaseIds = opts.archive ? (opts.focusCaseIds ?? []) : [];
    const longCfg = longDeepOf(tier.id);
    // DeepSearch(DEC-041)는 구조화 호출과 더 긴 답변이 들어가 상한·예산 차감이 일반 질문의 2배다
    // 짧은 비서 질문은 지금처럼 일반 답변 경로(지시문·대화 한마디)로 간다 (DEC-057)
    const deep = long || (opts.deep === true && !assistant);
    // 긴 질문(2,000자 넘게)은 입력 몫만큼 상한과 예산 가중치를 늘린다 (2026-11-25 질문 한도 10,000자)
    // 첨부 자료(F-017, DEC-058): 질문 행에 둔 가린 판독 정리. 모델 입력이 그만큼 길어지므로 긴 질문 상한 계산에도 넣는다
    const materials = readStoredMaterials(inquiry.materials);
    const allowance = longInputAllowanceUsd(
      tier.model,
      inquiry.masked_text.length + materialsChars(materials),
    );
    // 빠른 답 먼저(DEC-064)는 화면으로 받을 수 있는 요청(SSE)이고 답변 모델이 Haiku가 아닐 때만 — 예산에 그만큼 더 잡는다
    const quickOn = !!opts.onPreview && tier.model !== QUICK_MODEL;
    const capUsd = (long ? longCfg.capUsd : deep ? tier.deep.capUsd : tier.capUsd) + allowance;
    const weight =
      (long ? longCfg.weight : deep ? tier.deep.weight : tier.weight) +
      Math.ceil(allowance / BUDGET_UNIT_USD - 1e-9) +
      (quickOn ? QUICK_WEIGHT : 0);
    // 자료가 붙은 질문은 예시 재생으로 보지 않는다
    const example = findExampleFor(inquiry.masked_text, materials) !== null;
    if (aiMode() === "free" || example || !(await tryAiQuota(weight))) {
      // 자료가 붙은 질문은 예시 답변을 재생하지 않는다 (자료와 상관없는 저장 답변이 자료 옆에 보이지 않게)
      const free = await runFreeAnalysis(inquiry.masked_text, {
        onStep: step,
        caseHint,
        lawHints,
        ...(materials.length > 0 && { noReplay: true }),
      });
      // 저장해 둔 절차 라벨만 본다 (모델 없음, DEC-037). 예시 재생은 규칙으로 이미 정해져 있다
      if (free.model !== "replay") {
        const hint = await procedureHintFor(free.result, inquiry.masked_text, {
          category: opts.category,
          allowAi: false,
        });
        if (hint) free.result.procedureHint = hint;
      }
      if (assistant) free.result.assistant = assistant.id;
      // 무료 모드에서도 이미 읽은 자료 정리와 활용 안내는 보인다 (답변 문단과의 연결만 없다)
      if (materials.length > 0) {
        const freeMaterials = buildMaterialsMap(materials, [], []);
        if (freeMaterials) free.result.materials = freeMaterials;
      }
      clock.mark("finish");
      free.result.timing = clock.done();
      const resultId = await finishAnalysis(
        {
          inquiryId: inquiry.id,
          result: free.result,
          model: free.model,
          promptVersion: FREE_PROMPT_VERSION,
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: Date.now() - started,
          stats: free.stats,
          citations: free.citations,
        },
        owner,
        headers,
        { consumeAnonQuota: free.model !== "replay" },
      );
      return { resultId, result: free.result };
    }

    const context = await loadFollowupContext(inquiry.parent_inquiry_id, owner);
    // 빠른 답 먼저: 기다리지 않고 동시에 돌린다. 요약이 오면 바로 화면으로, 실패하면 조용히 없다
    let previewMs: number | undefined;
    const quick = quickOn
      ? runQuickPreview({
          maskedText: inquiry.masked_text,
          context,
          ...(materials.length > 0 && { materials }),
        })
          .then((q) => {
            if (q.preview) {
              previewMs = clock.elapsed();
              opts.onPreview?.(q.preview);
            }
            return q.costUsd;
          })
          .catch(() => 0)
      : Promise.resolve(0);
    // 일반 질문: 무료 법제처 검색 + 답변 1회 (DEC-020·026·036)
    // DeepSearch: 사건 구조화(Haiku) + 쟁점별 검색 + 쟁점별 답변 1회 (DEC-041). 답변 모델은 둘 다 고른 단계
    const deepRun = deep
      ? await runDeepAnalysis(
          { maskedText: inquiry.masked_text, context, ...(materials.length > 0 && { materials }) },
          {
            onStep: step,
            caseHint,
            lawHints,
            tier: tier.id,
            costCapUsd: capUsd,
            long,
            ...(focusCaseIds.length > 0 && { pinnedCaseIds: focusCaseIds }),
            ...(assistant && {
              persona: assistant.persona,
              ...(({ pinnedCaseIds, promptTag }) => ({ pinnedCaseIds, promptTag }))(
                assistantLiteOptions(assistant.id, inquiry.masked_text).assistant,
              ),
            }),
          },
        )
      : null;
    const analysis =
      deepRun ??
      (await runLiteAnalysis(
        { maskedText: inquiry.masked_text, context, ...(materials.length > 0 && { materials }) },
        {
          onStep: step,
          caseHint,
          lawHints,
          tier: tier.id,
          costCapUsd: capUsd,
          // 일반 법률 질문의 참고 자료(DEC-069)는 예산을 따로 잡을 수 있을 때만 찾는다
          reserveWebRefs: () => tryAiQuota(WEB_REFS_WEIGHT),
          ...(focusCaseIds.length > 0 && { focusCaseIds }),
          // 비서 지시문 + 대화 한마디(Haiku) + 질문 낱말에 맞는 사례 판례 (lib/assistants/run-config, 실호출 테스트와 같은 설정)
          ...(assistant && {
            assistant: assistantLiteOptions(assistant.id, inquiry.masked_text).assistant,
          }),
        },
      ));
    // 기간 예산(DEC-040): 먼저 잡아 둔 상한 중 실제로 쓰지 않은 몫을 돌려준다 (주간 규칙일 때는 아무 일도 없다)
    await settleAiQuota(weight, analysis.costUsd + (await quick));
    if ("refsCostUsd" in analysis && analysis.refsCostUsd !== undefined)
      await settleAiQuota(WEB_REFS_WEIGHT, analysis.refsCostUsd);
    const verified = await verifyDraft(analysis.draft, analysis.evidence, {
      onStep: step,
      screened: analysis.dropped.length,
    });
    // 예비 답변 (2026-11-27 사용자 결정 — 어떤 경우에도 실제 답변이 나오게): 남은 문단이 하나도 없으면
    // 근거 없이 같은 단계 모델로 한 번 더 답한다. 예산을 따로 잡고, 잡지 못하면 결과 없음 그대로 둔다
    let usedFallback = false;
    let fallbackRefs: MaterialRef[] | undefined;
    // 남은 시간이 예비 답변 호출 시간보다 짧으면 부르지 않는다 (분석 라우트 300초 안에 검증·저장까지)
    const timeLeft = ANALYSIS_BUDGET_MS - (Date.now() - started) - 15_000;
    const fbCap = tier.capUsd + allowance;
    const fbWeight = tier.weight + Math.ceil(allowance / BUDGET_UNIT_USD - 1e-9);
    if (
      verified.result.answer?.points.length === 0 &&
      timeLeft > tier.timeoutMs &&
      (await tryAiQuota(fbWeight))
    ) {
      const fb = await runLiteAnalysis(
        { maskedText: inquiry.masked_text, context, ...(materials.length > 0 && { materials }) },
        { tier: tier.id, costCapUsd: fbCap, noEvidence: true },
      ).catch(() => null);
      // 예외로 끝나 쓴 금액을 모르면 잡아 둔 몫을 모두 쓴 것으로 친다 (실제보다 적게 세지 않게)
      await settleAiQuota(fbWeight, fb ? fb.costUsd : fbCap);
      if (fb) {
        const again = await verifyDraft(fb.draft, fb.evidence, { screened: fb.dropped.length });
        if ((again.result.answer?.points.length ?? 0) > 0) {
          usedFallback = true;
          fallbackRefs = fb.materialRefs;
          verified.result.answer = again.result.answer;
          verified.result.outcome = again.result.outcome;
          analysis.usage = {
            inputTokens: analysis.usage.inputTokens + fb.usage.inputTokens,
            outputTokens: analysis.usage.outputTokens + fb.usage.outputTokens,
            cacheReadTokens: analysis.usage.cacheReadTokens + fb.usage.cacheReadTokens,
          };
          analysis.promptVersion = `${analysis.promptVersion}+fallback`;
        }
      }
    }
    clock.mark("finish");
    // 사건 구조도의 쟁점에는 검증을 통과해 남은 문단만 잇는다 (빠진 문단은 그림에서도 빠진다)
    // 예비 답변 문단은 DeepSearch 쟁점과 이어지지 않아 구조도를 다시 잇지 않는다
    if (deepRun?.struct && !usedFallback) {
      verified.result.deep = buildDeepMap(
        deepRun.struct,
        deepRun.drafted,
        verified.result.answer.points,
        deepRun.plan,
      );
    }
    // 자료 지도: 자료마다 검증을 통과해 남은 문단 중 그 자료를 참고한 것만 잇는다 (빠진 문단은 연결에서도 빠진다)
    if (materials.length > 0) {
      const materialsMap = buildMaterialsMap(
        materials,
        (usedFallback ? fallbackRefs : analysis.materialRefs) ?? [],
        verified.result.answer.points,
      );
      if (materialsMap) verified.result.materials = materialsMap;
    }
    // 규칙이 절차를 정하지 못한 질문만: 저장된 라벨 → 없으면 Haiku 분류 1회 후 저장 (DEC-037)
    // 질문 해석이 새 섹션을 제안했으면 그것을 저장하고 분류 호출은 다시 하지 않는다 (같은 일을 두 번 하지 않기, DEC-042)
    // 일반 법률 질문(DEC-069)은 절차를 보이지 않아 라벨 제안 저장·절차 분류를 하지 않는다
    const isGeneral = "questionKind" in analysis && analysis.questionKind === "general";
    const proposal = !isGeneral && "newLabel" in analysis ? analysis.newLabel : null;
    if (proposal) await saveLabelProposal(proposal, inquiry.masked_text);
    if (!isGeneral) {
      const hint = await procedureHintFor(verified.result, inquiry.masked_text, {
        category: opts.category,
        allowAi: !proposal,
      });
      if (hint) verified.result.procedureHint = hint;
    }
    // 일반 법률 질문(2026-11-27): 화면이 답변·근거·참고 자료만 보이게 표시한다
    if (isGeneral) {
      verified.result.kind = "general";
      if (analysis.references?.length) verified.result.references = analysis.references;
    }
    if (assistant) {
      verified.result.assistant = assistant.id;
      // 대화 한마디(Haiku)는 근거가 없는 말이라 거르기를 통과한 것만 붙인다 (lib/assistants/talk)
      if ("talk" in analysis && analysis.talk) verified.result.assistantTalk = analysis.talk;
    }

    // 질문 1회는 분석이 성공했을 때 센다 (DEC-010). 차감·저장·상태 변경은 한 트랜잭션 —
    // 상한에 걸리거나 저장이 실패하면 결과도 차감도 남지 않는다
    verified.result.timing = { ...clock.done(), ...(previewMs !== undefined && { previewMs }) };
    const resultId = await finishAnalysis(
      {
        inquiryId: inquiry.id,
        result: verified.result,
        model: analysis.model,
        promptVersion: analysis.promptVersion,
        usage: analysis.usage,
        latencyMs: Date.now() - started,
        stats: verified.stats,
        citations: verified.citations,
      },
      owner,
      headers,
    );
    return { resultId, result: verified.result };
  } catch (e) {
    await markInquiryFailed(inquiry.id);
    throw e;
  }
}
