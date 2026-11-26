// PATCH·DELETE /api/v1/me/inquiries/{id} — 내 세션 이름 바꾸기·목록에서 빼기 (DEC-073, API.md). 로그인 사용자만, 본인이 남긴 질문만.
// 이름은 가린 뒤에만 저장한다. 빼기는 '기록에 남기기'만 끄고 질문·결과는 지우지 않는다(하루 횟수가 되살아나지 않게) —
// 기록을 모두 지우는 길은 DELETE /me/data다. 남의 질문·없는 질문은 똑같이 404.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { getActor } from "@/lib/auth/server";
import { parseSessionTitle } from "@/lib/inquiries/policy";
import { renameSavedInquiry, unsaveInquiry } from "@/lib/inquiries/store";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = async (ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND");
  return id;
};
const noStore = (res: Response) => {
  res.headers.set("cache-control", "no-store");
  return res;
};

export const PATCH = withRoute<Ctx>(async (req, ctx, scope) => {
  const actor = await getActor(scope);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  await assertRateLimit(WRITE_RATE, req.headers);
  const id = await idOf(ctx);
  const body = (await readJson<Record<string, unknown>>(req)) ?? {};
  const title = parseSessionTitle(body.title);
  await renameSavedInquiry(actor.userId, id, title);
  return noStore(ok({ id, title }, scope.requestId));
});

export const DELETE = withRoute<Ctx>(async (req, ctx, scope) => {
  const actor = await getActor(scope);
  if (!actor) throw new ApiError("UNAUTHENTICATED");
  await assertRateLimit(WRITE_RATE, req.headers);
  const id = await idOf(ctx);
  await unsaveInquiry(actor.userId, id);
  return noStore(ok({ id, removed: true }, scope.requestId));
});
