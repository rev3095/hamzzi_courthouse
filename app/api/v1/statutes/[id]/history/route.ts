// GET /api/v1/statutes/{id}/history — 이 조문의 개정 이력 (DEC-072 ⓔ). 법제처 조문 개정 이력(lsJoHstInf)을 날짜·개정 구분·변경 사유 그대로.
// 개정의 영향·중요도는 판단하지 않는다. 법령이 없으면 404.
import { ApiError } from "@/lib/api/errors";
import { SEARCH_NOTICE, ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { parseStatuteId } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { lawName, articleNo } = parseStatuteId((await ctx.params).id);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const h = await createLawSource({ timeoutMs: 10_000 }).articleHistory(lawName, articleNo);
  if (!h) throw new ApiError("NOT_FOUND");
  return ok({ ...h, notice: SEARCH_NOTICE }, scope.requestId);
});
