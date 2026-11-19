// DELETE /api/v1/community/comments/{id} — 댓글 삭제 (DEC-047). 로그인 댓글은 그 계정, 비로그인 댓글은 비밀번호.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { removeComment, viewerOf } from "@/lib/community/service";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  return ok(
    await removeComment(await viewerOf(scope), req.headers, id, body ?? {}),
    scope.requestId,
  );
});
