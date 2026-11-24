// POST /api/v1/matters/issues — 사건 진행: 쟁점 정리 (F-016 AC3, DEC-053, API.md). 로그인 사용자만.
// 본문 { text, personNames?, tier?, consent: true }. 사건 글은 여기서 이름·연락처를 가린 뒤에만 모델·법제처 검색으로 간다 (절대 규칙 4).
// 기존 DeepSearch 경로(구조화 → 쟁점별 검색 → 답변)와 인용 검증을 그대로 쓰고, 검증을 통과한 문단만 쟁점에 잇는다 (절대 규칙 1).
// 쟁점은 "살펴볼 질문"이다 — 승패·유불리·책임을 판정하지 않는다 (절대 규칙 2). 결과는 여기서 저장하지 않는다.
import { organizeIssues } from "@/lib/ai/matter";
import { isTierId, tierOf } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { MAX_INPUT_CHARS } from "@/lib/inquiries/policy";
import { runMatterAi } from "@/lib/matters/ai-gate";
import { maskForModel, parseTextRequest } from "@/lib/matters/policy";
import { requireMatterUser } from "@/lib/matters/store";

/** 구조화 + 쟁점별 검색 + 답변 + 인용 검증 */
export const maxDuration = 120;

export const POST = withRoute(async (req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  const body = (await readJson<Record<string, unknown>>(req)) ?? {};
  const { text, personNames } = parseTextRequest(body, MAX_INPUT_CHARS);
  const tier = body.tier ?? null;
  if (tier !== null && !isTierId(tier)) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["tier"] });
  }
  // 가린 사건 글을 AI 모델과 법제처 검색으로 보내는 데 대한 동의 (민감정보가 섞일 수 있다)
  if (body.consent !== true) throw new ApiError("CONSENT_REQUIRED", { kind: "sensitive_info" });

  const masked = maskForModel(text, personNames);
  const profile = tierOf(tier);
  const r = await runMatterAi(user, profile.deep.weight, (spend) =>
    organizeIssues(masked.text, { tier: profile.id, onCost: spend }),
  );
  const res = ok(
    r.skipped
      ? { issues: [], unknowns: [], ai: r.skipped, notice: null }
      : {
          issues: r.out.issues,
          unknowns: r.out.unknowns,
          ai: { used: true },
          notice: AI_NOTICE,
        },
    scope.requestId,
  );
  res.headers.set("cache-control", "no-store");
  return res;
});
