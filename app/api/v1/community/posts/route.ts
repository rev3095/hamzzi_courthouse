// GET·POST /api/v1/community/posts — 커뮤니티 글 목록·쓰기 (DEC-047).
// 비로그인도 쓸 수 있다(비밀번호 필요). 본문은 개인정보를 가린 마스킹본만 저장한다. AI를 부르지 않는다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { createPost, listPosts, viewerOf } from "@/lib/community/service";

export const GET = withRoute(async (req, _ctx, scope) => {
  const params = new URL(req.url).searchParams;
  const viewer = await viewerOf(scope);
  const res = ok(
    await listPosts(viewer, params.get("board"), params.get("cursor")),
    scope.requestId,
  );
  res.headers.set("cache-control", "no-store");
  return res;
});

export const POST = withRoute(async (req, _ctx, scope) => {
  const body = await readJson<Record<string, unknown>>(req);
  const viewer = await viewerOf(scope);
  return ok(await createPost(viewer, req.headers, body ?? {}), scope.requestId, { status: 201 });
});
