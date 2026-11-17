// /api/v1/decisions — 판례 밖 결정문 검색 (DEC-029 제안): 법령해석례·헌재 결정례·조세심판 재결례·관세청 해석.
// 법제처 실시간 조회, 저장하지 않는다. 화면은 POST 본문을 쓴다 — 검색어가 주소·접속 기록에 남지 않게 (F-007)
import { ok } from "@/lib/api/respond";
import { readJson, withRoute, type RequestScope } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { assertDecisionDomain, decisionListResponse, searchInput } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

async function search(
  src: URLSearchParams | Record<string, unknown>,
  headers: Headers,
  scope: RequestScope,
) {
  const { q, limit, get } = searchInput(src, 10, 20);
  const domain = assertDecisionDomain(get("domain"));
  await assertRateLimit(SEARCH_RATE, headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).searchDecisions(domain, q, limit);
  return ok(decisionListResponse(domain, hits), scope.requestId);
}

export const GET = withRoute(async (req, _ctx, scope) =>
  search(new URL(req.url).searchParams, req.headers, scope),
);

export const POST = withRoute(async (req, _ctx, scope) =>
  search(((await readJson(req)) ?? {}) as Record<string, unknown>, req.headers, scope),
);
