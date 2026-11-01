// GET /api/v1/statutes/{id}?asOf=YYYY-MM-DD — 조문 + 시행일 (F-004). id = "법령명:제N조" (URL 인코딩).
// 법제처에 없으면 404. 시점별 조문은 데모가 가져오지 않아 asOf가 현행 시행일보다 앞이면 안내만 붙인다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { parseAsOf, parseStatuteId, statuteResponse } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

/** 한국 시각 오늘 (YYYY-MM-DD) */
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  const { lawName, articleNo } = parseStatuteId(id);
  const asOf = parseAsOf(new URL(req.url).searchParams);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const article = await createLawSource({ timeoutMs: 10_000 }).getArticle(lawName, articleNo);
  if (!article) throw new ApiError("NOT_FOUND");
  return ok(statuteResponse(article, asOf, todayKst()), scope.requestId);
});
