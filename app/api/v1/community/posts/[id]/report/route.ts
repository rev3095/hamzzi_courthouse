// POST /api/v1/community/posts/{id}/report — 글 신고 (DEC-047). 신고 수만 올리고 누가 신고했는지는 남기지 않는다.
// DELETE — 관리자 모드가 신고 수를 0으로 되돌려 가려진 글을 다시 보이게 한다.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { clearReports, report, viewerOf } from "@/lib/community/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  return ok(await report(req.headers, id), scope.requestId);
});

export const DELETE = withRoute<Ctx>(async (_req, ctx, scope) => {
  const { id } = await ctx.params;
  return ok(await clearReports(await viewerOf(scope), id), scope.requestId);
});
