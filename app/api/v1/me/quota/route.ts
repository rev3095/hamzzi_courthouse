// GET /api/v1/me/quota — 오늘 남은 비로그인 질문 수(0~3), 로그인 필요 여부, 관리자 모드 (DEC-010·024, F-001 AC3)
// 조회만 한다: 쿠키가 없는 첫 방문자에게 익명 세션을 만들지 않는다.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { countsAnonQuota, quotaView } from "@/lib/inquiries/policy";
import { getAnonQuestionsUsed, resolveOwner } from "@/lib/inquiries/store";

export const GET = withRoute(async (_req, _ctx, scope) => {
  const owner = await resolveOwner(scope, { create: false });
  const used = owner && countsAnonQuota(owner) ? await getAnonQuestionsUsed(owner.anonSessionId) : 0;
  return ok(quotaView(owner, used), scope.requestId);
});
