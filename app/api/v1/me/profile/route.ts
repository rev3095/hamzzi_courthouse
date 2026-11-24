// GET /api/v1/me/profile — 마이페이지 프로필 (DEC-056). Google 로그인 사용자 본인에게만 이름·프로필 사진 주소를 돌려준다.
// 새로 저장하지 않는다(인증 서비스가 로그인 때 받아 둔 값). 이메일은 싣지 않고, 값은 로그에 남기지 않는다. 비로그인은 401.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { getMyProfile } from "@/lib/auth/server";

export const GET = withRoute(async (_req, _ctx, scope) => {
  const profile = await getMyProfile(scope);
  if (!profile) throw new ApiError("UNAUTHENTICATED");
  const res = ok(profile, scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
