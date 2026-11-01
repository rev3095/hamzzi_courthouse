// DELETE /api/v1/me/data — 내 기록 삭제 (PRD 9.2, API.md 4절, DEC-018 제안).
// 비로그인: 같은 익명 세션의 질문·결과·인용·피드백을 바로 지우고 감사 로그를 남긴다. 질문 횟수는 되살아나지 않는다.
// 로그인: 삭제 요청을 접수한다(202). 데모는 로그인을 열지 않는다 (DEC-016).
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { deleteAnonData, requestUserDeletion, resolveOwner } from "@/lib/inquiries/store";

export const DELETE = withRoute(async (req, _ctx, scope) => {
  await assertRateLimit(WRITE_RATE, req.headers);
  const owner = await resolveOwner(scope, { create: false });
  if (!owner) return ok({ status: "completed", deletedInquiries: 0 }, scope.requestId);
  if (owner.kind === "user") {
    const deletionRequestId = await requestUserDeletion(owner.userId);
    return ok({ status: "received", deletionRequestId }, scope.requestId, { status: 202 });
  }
  const deletedInquiries = await deleteAnonData(owner.anonSessionId, req.headers);
  return ok({ status: "completed", deletedInquiries }, scope.requestId);
});
