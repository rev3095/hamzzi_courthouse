// POST /api/v1/documents/{kind}/draft — 문서 초안 도우미 (DEC-023, API.md 5절). [게이트] legal_documents.
// 게이트가 승인되기 전에는 맨 앞에서 403 FEATURE_GATED (절대 규칙 5). 본문은 { inquiryId }뿐 — 이름·주소·금액은 받지 않는다.
// 그 질문의 마스킹본(DEC-006)과 저장된 분석 결과로 규칙 칸(사건명·제목·입증방법)을 채우고, 유료 모드면 Haiku 1회로
// 사실관계 문장 초안을 만든다(1건 $0.0015 상한, 하루 전체 상한은 분석과 함께 센다). 결과는 저장하지 않고 no-store로 돌려준다.
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { draftFacts } from "@/lib/ai/doc-draft";
import { aiMode } from "@/lib/ai/mode";
import {
  DOC_DRAFT_RATE,
  aiDailyRule,
  assertRateLimit,
  tryGlobalQuota,
} from "@/lib/auth/rate-limit";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { FACTS_FIELD, ruleSuggestions } from "@/lib/documents/draft";
import { isDocumentKind } from "@/lib/documents/policy";
import { requireFeature } from "@/lib/gate/store";
import {
  getLatestResult,
  getOwnedInquiry,
  loadFollowupContext,
  resolveOwner,
} from "@/lib/inquiries/store";
import { procedurePlan } from "@/lib/procedure/policy";
import type { TrackKey } from "@/lib/procedure/steps";

type Ctx = { params: Promise<{ kind: string }> };

type AiState =
  | { used: true }
  | { used: false; reason: "free_mode" | "daily_limit" | "cost_cap" | "model_failed" | "no_facts" };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  await requireFeature("legal_documents");
  const { kind } = await ctx.params;
  if (!isDocumentKind(kind)) throw new ApiError("NOT_FOUND");
  const body = await readJson<{ inquiryId?: unknown }>(req);
  if (typeof body?.inquiryId !== "string") {
    throw new ApiError("VALIDATION_ERROR", { fields: ["inquiryId"] });
  }

  const owner = await resolveOwner(scope, { create: false });
  const inquiry = await getOwnedInquiry(body.inquiryId, owner);
  const latest = inquiry.status === "analyzed" ? await getLatestResult(inquiry.id) : null;
  if (!latest || !owner) throw new ApiError("INVALID_STATE", { reason: "not_analyzed" });
  await assertRateLimit(DOC_DRAFT_RATE, req.headers);

  // 사연 = 앞선 질문들 + 이번 질문의 마스킹본 (AI 답변은 넣지 않는다 — 사용자가 말한 사실만)
  const earlier = await loadFollowupContext(inquiry.parent_inquiry_id, owner);
  const maskedStory = [...earlier.map((t) => t.question), inquiry.masked_text].join("\n");

  const track = trackOf(latest.response, inquiry.masked_text);
  const suggestions: Record<string, string> = ruleSuggestions(kind, track, maskedStory);
  let missing: string[] = [];
  let ai: AiState;
  const factsKey = FACTS_FIELD[kind];
  // 사실관계 칸이 없는 서식(예: 간이대지급금 지급청구서)은 모델을 부르지 않는다
  if (!factsKey) ai = { used: false, reason: "no_facts" };
  else if (aiMode() === "free") ai = { used: false, reason: "free_mode" };
  else if (!(await tryGlobalQuota(aiDailyRule()))) ai = { used: false, reason: "daily_limit" };
  else {
    const out = await draftFacts({ kind, maskedStory });
    if (out.ok) {
      suggestions[factsKey] = out.text;
      missing = out.missing;
      ai = { used: true };
    } else ai = { used: false, reason: out.reason };
  }

  const res = ok(
    { kind, suggestions, missing, ai, notice: ai.used ? AI_NOTICE : null },
    scope.requestId,
  );
  res.headers.set("cache-control", "no-store");
  return res;
});

/** 저장된 분석 결과로 타임라인 섹션을 고른다 (lib/procedure 규칙). 결과 모양이 다르면 섹션 없이 */
function trackOf(response: unknown, question: string): TrackKey | null {
  const r = response as Partial<DemoAnalysisResult> | null;
  if (!r?.intent || !Array.isArray(r.intent.laws) || !Array.isArray(r.articles)) return null;
  const plan = procedurePlan(r as DemoAnalysisResult, question);
  return plan.kind === "timeline" ? plan.caseType : null;
}
