// GET·PATCH·DELETE /api/v1/community/posts/{id} — 글 보기·수정·삭제 (DEC-047).
// 로그인 글은 그 계정만, 비로그인 글은 비밀번호가 맞아야 고치고 지운다. 관리자 모드는 지울 수만 있다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { editPost, readPost, removePost, viewerOf } from "@/lib/community/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (_req, ctx, scope) => {
  const { id } = await ctx.params;
  const res = ok(await readPost(await viewerOf(scope), id), scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});

export const PATCH = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  const body = await readJson<Record<string, unknown>>(req);
  return ok(await editPost(await viewerOf(scope), req.headers, id, body ?? {}), scope.requestId);
});

export const DELETE = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  // 비밀번호는 주소가 아니라 본문으로만 받는다. 로그인 글은 본문이 없어도 된다
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  return ok(await removePost(await viewerOf(scope), req.headers, id, body ?? {}), scope.requestId);
});
