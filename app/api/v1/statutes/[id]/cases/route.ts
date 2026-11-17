// GET /api/v1/statutes/{id}/cases — 이 조문을 본문에서 언급한 판례 (DEC-026 제안). 법제처 본문 검색 결과 그대로, 관련도 점수 없음.
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { parseStatuteId } from "@/lib/search/browse";
import { CITING_NOTE, listResponse } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { lawName, articleNo } = parseStatuteId((await ctx.params).id);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).casesCiting(lawName, articleNo, 6);
  return ok(listResponse(hits, CITING_NOTE), scope.requestId);
});
