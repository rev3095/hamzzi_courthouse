// /api/v1/admin-rules — 행정규칙(고시·훈령·예규) 검색 (DEC-029 제안). 목록과 법제처 원문 링크만 준다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute, type RequestScope } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { ADMIN_RULE_NOTE, listResponse, searchInput } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

async function search(
  src: URLSearchParams | Record<string, unknown>,
  headers: Headers,
  scope: RequestScope,
) {
  const { q, limit } = searchInput(src, 20, 50);
  await assertRateLimit(SEARCH_RATE, headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).searchAdminRules(q, limit);
  return ok(listResponse(hits, ADMIN_RULE_NOTE), scope.requestId);
}

export const GET = withRoute(async (req, _ctx, scope) =>
  search(new URL(req.url).searchParams, req.headers, scope),
);
export const POST = withRoute(async (req, _ctx, scope) =>
  search(((await readJson(req)) ?? {}) as Record<string, unknown>, req.headers, scope),
);
