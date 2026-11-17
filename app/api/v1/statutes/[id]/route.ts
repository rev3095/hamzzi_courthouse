// GET /api/v1/statutes/{id}?asOf=YYYY-MM-DD — 조문 + 시행일 (F-004). id = "법령명:제N조" (URL 인코딩).
// 법제처에 없으면 404. asOf가 현행 시행일보다 앞이면 법제처 연혁에서 그 날짜에 시행 중이던 조문을 가져와 현행과 나란히 준다 (DEC-026 제안).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { parseAsOf, parseStatuteId, statuteResponse } from "@/lib/search/browse";
import { atDateResponse } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

/** 한국 시각 오늘 (YYYY-MM-DD) */
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  const { lawName, articleNo } = parseStatuteId(id);
  const asOf = parseAsOf(new URL(req.url).searchParams);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const source = createLawSource({ timeoutMs: 10_000 });
  const article = await source.getArticle(lawName, articleNo);
  if (!article) throw new ApiError("NOT_FOUND");
  const base = statuteResponse(article, asOf, todayKst());
  // 현행 시행일보다 앞선 과거 날짜만 연혁을 조회한다. 실패하면 만들지 않고 안내만 한다
  if (
    asOf === null ||
    !base.isCurrent ||
    article.effectiveFrom === null ||
    asOf >= article.effectiveFrom
  ) {
    return ok(base, scope.requestId);
  }
  const at = await source.getArticleAt(article.lawName, articleNo, asOf).catch((e: unknown) => {
    if (e instanceof ApiError && e.code === "SEARCH_UPSTREAM_FAILED") return null;
    throw e;
  });
  const extra = atDateResponse(article, at);
  return ok(
    { ...base, ...extra, asOfNote: "atDateNote" in extra ? extra.atDateNote : undefined },
    scope.requestId,
  );
});
