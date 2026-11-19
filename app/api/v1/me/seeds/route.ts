// GET /api/v1/me/seeds — 내 씨앗 (DEC-047). 로그인 사용자만. 잔액·할인 가치·오늘 적립 횟수.
// 사용(할인)은 과금 게이트 승인 전까지 꺼져 있어 redeemEnabled는 false다(절대 규칙 5).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { getActor } from "@/lib/auth/server";
import { mySeeds } from "@/lib/community/service";

export const GET = withRoute(async (_req, _ctx, scope) => {
  const actor = await getActor(scope);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  const res = ok(await mySeeds(actor.userId), scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
