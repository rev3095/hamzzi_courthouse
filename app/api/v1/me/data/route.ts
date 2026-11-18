// DELETE /api/v1/me/data — 내 기록 삭제 (PRD 9.2, API.md 4절, DEC-018 제안).
// 비로그인: 같은 익명 세션의 질문·결과·인용·피드백을 바로 지우고 감사 로그를 남긴다. 질문 횟수는 되살아나지 않는다.
// Google 로그인(DEC-035): 같은 브라우저의 로그인 전 질문(익명 세션)은 바로 지우고, 계정에 연결된 기록은 삭제 요청을 접수한다(202).
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { deleteAnonData, requestUserDeletion, resolveOwner } from "@/lib/inquiries/store";

export const DELETE = withRoute(async (req, _ctx, scope) => {
  await assertRateLimit(WRITE_RATE, req.headers);
  const owner = await resolveOwner(scope, { create: false });
  if (!owner) return ok({ status: "completed", deletedInquiries: 0 }, scope.requestId);
  if (owner.kind === "user") {
    const deletedInquiries = owner.anonSessionId
      ? await deleteAnonData(owner.anonSessionId, req.headers)
      : 0;
    const deletionRequestId = await requestUserDeletion(owner.userId);
    return ok({ status: "received", deletionRequestId, deletedInquiries }, scope.requestId, {
      status: 202,
    });
  }
  const deletedInquiries = await deleteAnonData(owner.anonSessionId, req.headers);
  return ok({ status: "completed", deletedInquiries }, scope.requestId);
});
