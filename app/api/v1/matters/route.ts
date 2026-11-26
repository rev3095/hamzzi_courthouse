// GET·POST /api/v1/matters — 사건 진행: 내 사건 목록·새 사건 (F-016 AC1, DEC-053, API.md). 로그인 사용자만.
// 사건 자료는 본인만 서버를 거쳐 읽고 쓴다. 응답은 저장하지 않게 no-store로 보낸다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { NEW_MATTER_TITLE, emptyMatter, parseMatterData, parseTitle } from "@/lib/matters/policy";
import { createMatter, listMatters, requireMatterUser } from "@/lib/matters/store";

const noStore = (res: Response) => {
  res.headers.set("cache-control", "no-store");
  return res;
};

export const GET = withRoute(async (_req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  return noStore(ok({ items: await listMatters(user.userId) }, scope.requestId));
});

export const POST = withRoute(async (req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  await assertRateLimit(WRITE_RATE, req.headers);
  const body = (await readJson<Record<string, unknown>>(req)) ?? {};
  // 이름을 비우면 '새 사건'으로 만들고 자동 정리(DEC-070)가 자료를 보고 제목을 짓는다
  const titleAuto = typeof body.title !== "string" || !body.title.trim();
  const title = titleAuto ? NEW_MATTER_TITLE : parseTitle(body.title);
  // 내보낸 파일을 가져올 때는 자료를 함께 받는다
  const data = body.data === undefined ? emptyMatter() : parseMatterData(body.data);
  return noStore(
    ok(
      await createMatter(user.userId, title, titleAuto ? { ...data, titleAuto } : data),
      scope.requestId,
      {
        status: 201,
      },
    ),
  );
});
