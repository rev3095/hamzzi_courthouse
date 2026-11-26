// GET·PUT·DELETE /api/v1/matters/{id} — 사건 한 건 읽기·저장·삭제 (F-016 AC1, DEC-053, API.md). 본인 사건만.
// 남의 사건·없는 사건은 똑같이 404다 (있는지 여부를 알려 주지 않는다). 본문·응답 내용은 로그에 남지 않는다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { UUID, parseMatterData, parseTitle, type MatterData } from "@/lib/matters/policy";
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
  const title = body.title !== undefined ? parseTitle(body.title) : undefined;
  let data = body.data !== undefined ? parseMatterData(body.data) : undefined;
  // 사용자가 이름을 바꾸면 자동 정리(DEC-070)가 더는 제목을 짓지 않는다(titleAuto 끔). 한 번 끈 값은
  // 다른 화면이 들고 있던 옛 자료(titleAuto: true)로 저장해도 되살아나지 않게 서버 값을 따른다
  let current = await getMatter(user.userId, id);
  const off = (d: MatterData): MatterData => (d.titleAuto ? { ...d, titleAuto: false } : d);
  if (data && (title !== undefined || current.data.titleAuto === false)) data = off(data);
  if (title !== undefined && !data && current.data.titleAuto) {
    // 이름만 바꿀 때 자료는 읽은 그대로에 titleAuto만 끈다 — 그 사이 다른 저장이 끼었으면 다시 읽어 한 번 더
    for (let attempt = 0; attempt < 2; attempt++) {
      const saved = await saveMatter(user.userId, id, {
        title,
        data: off(current.data),
        ifUpdatedAt: current.updatedAt,
      });
      if (saved) return noStore(ok(saved, scope.requestId));
      current = await getMatter(user.userId, id);
      if (!current.data.titleAuto) break;
    }
    // 두 번 다 다른 저장과 겹쳤으면 자동 제목을 켜 둔 채 이름만 바꾸지 않고 거절한다 — 화면이 다시 시도한다
    if (current.data.titleAuto) {
      throw new ApiError("INVALID_STATE", { fields: ["title"], reason: "busy" });
    }
  }
  const saved = await saveMatter(user.userId, id, {
    ...(title !== undefined && { title }),
    ...(data !== undefined && { data }),
  });
  return noStore(ok(saved, scope.requestId));
});

export const DELETE = withRoute<Ctx>(async (_req, ctx, scope) => {
  const user = await requireMatterUser(scope);
  await deleteMatter(user.userId, await idOf(ctx));
  return noStore(ok({ deleted: true }, scope.requestId));
});
