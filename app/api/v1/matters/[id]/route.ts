// GET·PUT·DELETE /api/v1/matters/{id} — 사건 한 건 읽기·저장·삭제 (F-016 AC1, DEC-053, API.md). 본인 사건만.
// 남의 사건·없는 사건은 똑같이 404다 (있는지 여부를 알려 주지 않는다). 본문·응답 내용은 로그에 남지 않는다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { UUID, parseMatterData, parseTitle } from "@/lib/matters/policy";
import { deleteMatter, getMatter, requireMatterUser, saveMatter } from "@/lib/matters/store";

type Ctx = { params: Promise<{ id: string }> };

const idOf = async (ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND");
  return id;
};
const noStore = (res: Response) => {
  res.headers.set("cache-control", "no-store");
  return res;
};

export const GET = withRoute<Ctx>(async (_req, ctx, scope) => {
  const user = await requireMatterUser(scope);
  return noStore(ok(await getMatter(user.userId, await idOf(ctx)), scope.requestId));
});

export const PUT = withRoute<Ctx>(async (req, ctx, scope) => {
  const user = await requireMatterUser(scope);
  const id = await idOf(ctx);
  const body = (await readJson<Record<string, unknown>>(req)) ?? {};
  if (body.title === undefined && body.data === undefined) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["data"], reason: "empty" });
  }
  const saved = await saveMatter(user.userId, id, {
    ...(body.title !== undefined && { title: parseTitle(body.title) }),
    ...(body.data !== undefined && { data: parseMatterData(body.data) }),
  });
  return noStore(ok(saved, scope.requestId));
});

export const DELETE = withRoute<Ctx>(async (_req, ctx, scope) => {
  const user = await requireMatterUser(scope);
  await deleteMatter(user.userId, await idOf(ctx));
  return noStore(ok({ deleted: true }, scope.requestId));
});
