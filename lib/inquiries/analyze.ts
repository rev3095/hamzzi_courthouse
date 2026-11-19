// 질문 1건 분석 실행 (P5, API.md 4.1 데모). 무료 모드: 재생·법제처 검색 전용 / 유료: 사용자가 고른 단계로 답변(lib/ai) → 인용 검증(lib/citations).
// 어느 쪽이든 횟수 차감·저장은 한 트랜잭션 (DEC-010, DEC-015).
// 근거 모음(EvidenceSet)은 이 함수 안에서만 쓰고 저장하지 않는다 (DEC-007).
import "server-only";
import { aiMode } from "@/lib/ai/mode";
import { settleAiQuota, tryAiQuota } from "@/lib/auth/rate-limit";
import { runDeepAnalysis } from "@/lib/ai/deep";
import { buildDeepMap } from "@/lib/ai/deep-policy";
import { runLiteAnalysis } from "@/lib/ai/lite";
import { tierOf, type TierId } from "@/lib/ai/models";
import type { StepEvent } from "@/lib/ai/policy";
import { verifyDraft } from "@/lib/citations/verify";
import { runFreeAnalysis } from "@/lib/demo/free";
import { CATEGORIES, type CategoryKey } from "@/lib/procedure/categories";
import { FREE_PROMPT_VERSION, findExample } from "@/lib/demo/policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  finishAnalysis,
  loadFollowupContext,
  markInquiryFailed,
  type InquiryRow,
  type Owner,
} from "./store";
import { procedureHintFor } from "./procedure-hint";

/** 라우트 maxDuration(120초) 안에 검증·저장까지 끝나도록 분석 예산을 잡는다 (DEC-014, 목표 p95 ≤ 90초) */
export const ANALYSIS_BUDGET_MS = 100_000;

export async function analyzeInquiry(
  inquiry: InquiryRow,
  owner: Owner,
  headers: Headers,
  onStep?: (e: StepEvent) => void,
  opts: { category?: CategoryKey | null; tier?: TierId | null; deep?: boolean } = {},
): Promise<{ resultId: string; result: DemoAnalysisResult }> {
  // 홈 카테고리(DEC-028)는 무료 판례 검색에 정해 둔 법률 용어 하나를 더할 뿐, 분류·답변을 모델이 정하게 하지 않는다
  const caseHint = opts.category ? CATEGORIES[opts.category].caseQuery : null;
  const lawHints = opts.category ? CATEGORIES[opts.category].lawHints : undefined;
  const started = Date.now();
  try {
    // 무료 모드(기본, DEC-015): Claude를 부르지 않는다. 예시 질문 재생 또는 법제처 검색 전용.
    // 유료 모드라도 예시 질문은 미리 만든 분석을 재생한다(비용 0). 주간 전체 상한(DEC-019·020·026·031, 기본 $80)을
    // 넘으면 그 주는 무료 모드로 처리한다 — 운영자 최대 비용 고정.
    // 비로그인 하루 횟수 제한·저장은 유료 모드와 같은 트랜잭션으로 처리한다 (절대 규칙 7).
    // 예시 질문 재생은 해석이 필요 없는 저장된 결과라 횟수를 차감하지 않는다 (DEC-027). 주간 카운터도 세지 않는다
    // 주간 예산은 단계 가중치만큼 차감한다 (DEC-036: Light 1 · Pro 20 · Pro Max 100단위)
    const tier = tierOf(opts.tier);
    // DeepSearch(DEC-041)는 구조화 호출과 더 긴 답변이 들어가 상한·예산 차감이 일반 질문의 2배다
    const deep = opts.deep === true;
    const weight = deep ? tier.deep.weight : tier.weight;
    const example = findExample(inquiry.masked_text) !== null;
    if (aiMode() === "free" || example || !(await tryAiQuota(weight))) {
      const free = await runFreeAnalysis(inquiry.masked_text, { onStep, caseHint, lawHints });
      // 저장해 둔 절차 라벨만 본다 (모델 없음, DEC-037). 예시 재생은 규칙으로 이미 정해져 있다
      if (free.model !== "replay") {
        const hint = await procedureHintFor(free.result, inquiry.masked_text, {
          category: opts.category,
          allowAi: false,
        });
        if (hint) free.result.procedureHint = hint;
      }
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
    // 일반 질문: 무료 법제처 검색 + 답변 1회 (DEC-020·026·036)
    // DeepSearch: 사건 구조화(Haiku) + 쟁점별 검색 + 쟁점별 답변 1회 (DEC-041). 답변 모델은 둘 다 고른 단계
    const deepRun = deep
      ? await runDeepAnalysis(
          { maskedText: inquiry.masked_text, context },
          { onStep, caseHint, lawHints, tier: tier.id },
        )
      : null;
    const analysis =
      deepRun ??
      (await runLiteAnalysis(
        { maskedText: inquiry.masked_text, context },
        { onStep, caseHint, lawHints, tier: tier.id },
      ));
    // 기간 예산(DEC-040): 먼저 잡아 둔 상한 중 실제로 쓰지 않은 몫을 돌려준다 (주간 규칙일 때는 아무 일도 없다)
    await settleAiQuota(weight, analysis.costUsd);
    const verified = await verifyDraft(analysis.draft, analysis.evidence, {
      onStep,
      screened: analysis.dropped.length,
    });
    // 사건 구조도의 쟁점에는 검증을 통과해 남은 문단만 잇는다 (빠진 문단은 그림에서도 빠진다)
    if (deepRun?.struct) {
      verified.result.deep = buildDeepMap(
        deepRun.struct,
        deepRun.drafted,
        verified.result.answer.points,
      );
    }
    // 규칙이 절차를 정하지 못한 질문만: 저장된 라벨 → 없으면 Haiku 분류 1회 후 저장 (DEC-037)
    const hint = await procedureHintFor(verified.result, inquiry.masked_text, {
      category: opts.category,
      allowAi: true,
    });
    if (hint) verified.result.procedureHint = hint;

    // 질문 1회는 분석이 성공했을 때 센다 (DEC-010). 차감·저장·상태 변경은 한 트랜잭션 —
    // 상한에 걸리거나 저장이 실패하면 결과도 차감도 남지 않는다
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
