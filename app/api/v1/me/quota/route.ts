// GET /api/v1/me/quota — 남은 비로그인 질문 수(0~3), 로그인 필요 여부 (DEC-010, F-001 AC3)
// 조회만 한다: 쿠키가 없는 첫 방문자에게 익명 세션을 만들지 않는다.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { quotaView } from "@/lib/inquiries/policy";
import { getAnonQuestionsUsed, resolveOwner } from "@/lib/inquiries/store";

export const GET = withRoute(async (_req, _ctx, scope) => {
  const owner = await resolveOwner(scope, { create: false });
  const used = owner?.kind === "anon" ? await getAnonQuestionsUsed(owner.anonSessionId) : 0;
  return ok(quotaView(owner, used), scope.requestId);
});
