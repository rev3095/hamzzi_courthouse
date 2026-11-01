// GET /api/v1/cases — 판례 직접 검색 (F-003, API.md 4절). 법제처 실시간 조회 (DEC-009), 결과는 저장하지 않는다.
// 비로그인 질문 3회와는 별개이고, 같은 네트워크 1시간 상한만 둔다 (DEC-017 제안).
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { caseListResponse, parseCaseQuery } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";

export const GET = withRoute(async (req, _ctx, scope) => {
  const { q, limit } = parseCaseQuery(new URL(req.url).searchParams);
  await assertRateLimit(SEARCH_RATE, req.headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).searchCases(q, limit);
  return ok(caseListResponse(hits), scope.requestId);
});
