// GET /api/v1/me/seeds — 내 씨앗 (DEC-047). 로그인 사용자만. 잔액·오늘 적립 횟수.
// 전면 무료(DEC-055)라 씨앗은 활동 기록이고 돈·할인으로 바꾸지 않는다.
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
