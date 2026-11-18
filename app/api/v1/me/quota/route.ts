// GET /api/v1/me/quota — 오늘 남은 질문 수(비로그인·Google 로그인), 로그인 필요 여부, 관리자 모드 (DEC-010·024·033, F-001 AC3)
// 조회만 한다: 쿠키가 없는 첫 방문자에게 익명 세션을 만들지 않는다.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { countsAnonQuota, countsUserQuota, quotaView } from "@/lib/inquiries/policy";
import { getAnonQuestionsUsed, getUserQuestionsUsed, resolveOwner } from "@/lib/inquiries/store";

export const GET = withRoute(async (_req, _ctx, scope) => {
  const owner = await resolveOwner(scope, { create: false });
  const used = !owner
    ? 0
    : countsAnonQuota(owner)
      ? await getAnonQuestionsUsed(owner.anonSessionId)
      : countsUserQuota(owner)
        ? await getUserQuestionsUsed(owner.userId)
        : 0;
  return ok(quotaView(owner, used), scope.requestId);
});
