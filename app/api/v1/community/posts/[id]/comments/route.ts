// POST /api/v1/community/posts/{id}/comments — 댓글 쓰기 (DEC-047). 비로그인은 비밀번호 필요, 본문은 마스킹본만 저장.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { createComment, viewerOf } from "@/lib/community/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(req);
  const viewer = await viewerOf(scope);
  return ok(await createComment(viewer, req.headers, id, body ?? {}), scope.requestId, {
    status: 201,
  });
});
