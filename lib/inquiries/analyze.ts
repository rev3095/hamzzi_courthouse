// 질문 1건 분석 실행 (P5, API.md 4.1 데모). 분석(lib/ai) → 인용 검증(lib/citations) → 횟수 차감·저장(한 트랜잭션).
// 근거 모음(EvidenceSet)은 이 함수 안에서만 쓰고 저장하지 않는다 (DEC-007).
import "server-only";
import { runDemoAnalysis } from "@/lib/ai/orchestrator";
import type { StepEvent } from "@/lib/ai/policy";
import { verifyDraft } from "@/lib/citations/verify";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  finishAnalysis,
  loadFollowupContext,
  markInquiryFailed,
  type InquiryRow,
  type Owner,
} from "./store";

/** 라우트 maxDuration(60초) 안에 검증·저장까지 끝나도록 분석 예산을 잡는다 (DEC-013) */
export const ANALYSIS_BUDGET_MS = 52_000;

export async function analyzeInquiry(
  inquiry: InquiryRow,
  owner: Owner,
  headers: Headers,
  onStep?: (e: StepEvent) => void,
): Promise<{ resultId: string; result: DemoAnalysisResult }> {
  const started = Date.now();
  try {
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
