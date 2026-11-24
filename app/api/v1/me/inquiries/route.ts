// GET /api/v1/me/inquiries — 내 세션의 질문 (DEC-039·056). 로그인 사용자가 "기록에 남기기"로 보낸 질문만, 마스킹본으로.
// 비로그인은 401. 예시 질문(저장하지 않는 정적 화면)·관리자 모드 질문은 애초에 목록에 들어가지 않는다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { getActor } from "@/lib/auth/server";
import { listSavedInquiries } from "@/lib/inquiries/store";

export const GET = withRoute(async (_req, _ctx, scope) => {
  const actor = await getActor(scope);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  const res = ok(await listSavedInquiries(actor.userId), scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
