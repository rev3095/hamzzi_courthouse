// /api/v1/laws — 현행 법령 이름 검색 (DEC-029 탐색 확장). 법제처 법령 목록을 실시간 조회하고 저장하지 않는다.
// 정식 이름을 몰라도 낱말 일부("의료기기")로 찾게 한다. 관련도 순위는 매기지 않고 법제처 순서(가나다순) 그대로 준다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute, type RequestScope } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { LAW_NOTE, listResponse, searchInput } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

async function search(
  src: URLSearchParams | Record<string, unknown>,
  headers: Headers,
  scope: RequestScope,
) {
  const { q, limit } = searchInput(src, 30, 100);
  await assertRateLimit(SEARCH_RATE, headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).searchLaws(q, limit);
  return ok(listResponse(hits, LAW_NOTE), scope.requestId);
}

export const GET = withRoute(async (req, _ctx, scope) =>
  search(new URL(req.url).searchParams, req.headers, scope),
);
export const POST = withRoute(async (req, _ctx, scope) =>
  search(((await readJson(req)) ?? {}) as Record<string, unknown>, req.headers, scope),
);
