// 질문 1건 분석 실행 (P5, API.md 4.1 데모). 무료 모드(기본): 재생·법제처 검색 전용 / Pro 모드: 분석(lib/ai) → 인용 검증(lib/citations).
// 어느 쪽이든 횟수 차감·저장은 한 트랜잭션 (DEC-010, DEC-015).
// 근거 모음(EvidenceSet)은 이 함수 안에서만 쓰고 저장하지 않는다 (DEC-007).
import "server-only";
import { aiMode } from "@/lib/ai/mode";
import { aiDailyRule, tryGlobalQuota } from "@/lib/auth/rate-limit";
import { runDemoAnalysis } from "@/lib/ai/orchestrator";
import type { StepEvent } from "@/lib/ai/policy";
import { verifyDraft } from "@/lib/citations/verify";
import { runFreeAnalysis } from "@/lib/demo/free";
import { FREE_PROMPT_VERSION } from "@/lib/demo/policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  finishAnalysis,
  loadFollowupContext,
  markInquiryFailed,
  type InquiryRow,
  type Owner,
} from "./store";

/** 라우트 maxDuration(120초) 안에 검증·저장까지 끝나도록 분석 예산을 잡는다 (DEC-014, 목표 p95 ≤ 90초) */
export const ANALYSIS_BUDGET_MS = 100_000;

export async function analyzeInquiry(
  inquiry: InquiryRow,
  owner: Owner,
  headers: Headers,
  onStep?: (e: StepEvent) => void,
): Promise<{ resultId: string; result: DemoAnalysisResult }> {
  const started = Date.now();
  try {
    // 무료 모드(기본, DEC-015): Claude를 부르지 않는다. 예시 질문 재생 또는 법제처 검색 전용.
    // Pro라도 하루 전체 상한(DEC-019)을 넘으면 그날은 무료 모드로 처리한다 — 운영자 하루 최대 비용 고정.
    // 비로그인 3회 제한·저장은 유료 모드와 같은 트랜잭션으로 처리한다 (절대 규칙 7)
    if (aiMode() === "free" || !(await tryGlobalQuota(aiDailyRule()))) {
      const free = await runFreeAnalysis(inquiry.masked_text, { onStep });
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
      );
      return { resultId, result: free.result };
    }

    const context = await loadFollowupContext(inquiry.parent_inquiry_id, owner);
    const analysis = await runDemoAnalysis(
      { maskedText: inquiry.masked_text, context },
      { onStep, budgetMs: ANALYSIS_BUDGET_MS },
    );
    const verified = await verifyDraft(analysis.draft, analysis.evidence, {
      onStep,
      screened: analysis.dropped.length,
    });

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
