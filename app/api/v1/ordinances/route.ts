// /api/v1/ordinances — 자치법규(조례·규칙) 검색 (DEC-029 제안). 법제처 실시간 조회, 저장하지 않는다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute, type RequestScope } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { ORDINANCE_NOTE, listResponse, searchInput } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

async function search(
  src: URLSearchParams | Record<string, unknown>,
  headers: Headers,
  scope: RequestScope,
) {
  const { q, limit } = searchInput(src, 30, 100);
  await assertRateLimit(SEARCH_RATE, headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).searchOrdinances(q, limit);
  return ok(listResponse(hits, ORDINANCE_NOTE), scope.requestId);
}

export const GET = withRoute(async (req, _ctx, scope) =>
  search(new URL(req.url).searchParams, req.headers, scope),
);
export const POST = withRoute(async (req, _ctx, scope) =>
  search(((await readJson(req)) ?? {}) as Record<string, unknown>, req.headers, scope),
);
