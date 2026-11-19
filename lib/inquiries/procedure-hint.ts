// 절차 분류 보조 (DEC-037). 규칙(lib/procedure/policy)이 절차를 정하지 못한 질문에만 쓴다.
// 순서: 규칙 → 저장해 둔 라벨(모델 없음) → 그래도 없고 유료 모드일 때만 Haiku 분류 1회 → 결과를 저장해 다음부터 재사용.
// 어떤 실패도 분석 결과를 막지 않는다 (절차 안내만 빠진다).
import "server-only";
import { classifyProcedure } from "@/lib/ai/classify";
import { HELPER_WEIGHT } from "@/lib/ai/models";
import { settleAiQuota, tryAiQuota } from "@/lib/auth/rate-limit";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import type { CategoryKey } from "@/lib/procedure/categories";
import {
  hintOf,
  immediateHint,
  labelFromClassification,
  matchLabel,
  type ProcedureHint,
} from "@/lib/procedure/labels";
import { activeLabels, bumpLabel, insertLabel } from "@/lib/procedure/labels-store";
import { classifyCase } from "@/lib/procedure/policy";

export async function procedureHintFor(
  result: DemoAnalysisResult,
  maskedText: string,
  opts: { category?: CategoryKey | null; allowAi: boolean },
): Promise<ProcedureHint | undefined> {
  if (classifyCase(result, maskedText, opts.category) !== "other") return undefined;
  try {
    const known = matchLabel(await activeLabels(), maskedText);
    if (known) {
      await bumpLabel(known.id);
      return hintOf(known) ?? undefined;
    }
    if (!opts.allowAi || !(await tryAiQuota(HELPER_WEIGHT))) return undefined;
    const out = await classifyProcedure(maskedText);
    await settleAiQuota(HELPER_WEIGHT, out.costUsd);
    if (!out.ok) return undefined;
    const label = labelFromClassification(out.output, maskedText);
    if (!label) return undefined;
    // 저장은 pending — 다른 질문에는 운영자 승인 뒤에만 쓰인다. 저장이 실패해도 이 질문의 안내는 그대로다
    await insertLabel(label);
    return immediateHint(label) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 질문 해석이 제안한 새 절차 섹션을 승인 대기로 저장한다 (DEC-042). 같은 낱말의 라벨이 이미 있으면 사용 횟수만 올린다.
 * 단계 문구가 없는 "이름만 있는" 라벨이라 승인해도 화면에 나가지 않는다 — 어떤 섹션이 빠져 있는지 운영자가 보는 용도다.
 * 실패해도 분석 결과를 막지 않는다.
 */
export async function saveLabelProposal(
  proposal: { title: string; keywords: string[] },
  maskedText: string,
): Promise<void> {
  try {
    const known = matchLabel(await activeLabels(), maskedText);
    if (known) {
      await bumpLabel(known.id);
      return;
    }
    await insertLabel({
      title: proposal.title,
      keywords: proposal.keywords,
      track: null,
      steps: [],
      status: "pending",
    });
  } catch {
    // 저장하지 못해도 답변은 그대로 나간다
  }
}
