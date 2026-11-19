// POST /api/v1/community/posts/{id}/report — 글 신고 (DEC-047). 신고 수만 올리고 누가 신고했는지는 남기지 않는다.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { report } from "@/lib/community/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  return ok(await report(req.headers, id), scope.requestId);
});
