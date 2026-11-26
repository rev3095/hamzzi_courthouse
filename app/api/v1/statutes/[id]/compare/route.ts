// GET /api/v1/statutes/{id}/compare?from=YYYY-MM-DD&to=YYYY-MM-DD — 두 날짜에 시행 중이던 같은 번호 조문을 나란히 (DEC-072 ⓔ).
// 법제처 연혁에서 그날의 시행 버전을 찾아 조문을 가져오고 줄 단위로 비교만 한다. 개정의 영향·유불리 판단 없음, 저장하지 않음.
import { ApiError } from "@/lib/api/errors";
import { SEARCH_NOTICE, ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { compareResponse, parseCompareDates } from "@/lib/search/article-time";
import { parseStatuteId } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { lawName, articleNo } = parseStatuteId((await ctx.params).id);
  const { from, to } = parseCompareDates(new URL(req.url).searchParams);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const source = createLawSource({ timeoutMs: 10_000 });
  // 한쪽을 불러오지 못하면 만들지 않고 그쪽에 안내만 붙인다
  const at = (date: string) =>
    source.getArticleAt(lawName, articleNo, date).catch((e: unknown) => {
      if (e instanceof ApiError && e.code === "SEARCH_UPSTREAM_FAILED") return null;
      throw e;
    });
  const [a, b] = await Promise.all([at(from), at(to)]);
  return ok(
    {
      lawName,
      articleNo,
      ...compareResponse({ date: from, at: a }, { date: to, at: b }),
      notice: SEARCH_NOTICE,
    },
    scope.requestId,
  );
});
