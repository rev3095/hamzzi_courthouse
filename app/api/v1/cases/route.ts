// /api/v1/cases — 판례 직접 검색 (F-003, API.md 4절). 법제처 실시간 조회 (DEC-009), 결과는 저장하지 않는다.
// 비로그인 질문 3회와는 별개이고, 같은 네트워크 1시간 상한만 둔다 (DEC-017 제안).
// GET ?q= 는 API.md 형식 그대로 두고, 화면은 POST 본문을 쓴다 — 검색어가 주소·플랫폼 접속 기록에 남지 않게 (F-007)
import { ok } from "@/lib/api/respond";
import { readJson, withRoute, type RequestScope } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { caseListResponse, parseCaseQuery } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";

async function search(params: URLSearchParams, headers: Headers, scope: RequestScope) {
  const { q, limit } = parseCaseQuery(params);
  await assertRateLimit(SEARCH_RATE, headers);
  const hits = await createLawSource({ timeoutMs: 10_000 }).searchCases(q, limit);
  return ok(caseListResponse(hits), scope.requestId);
}

export const GET = withRoute(async (req, _ctx, scope) =>
  search(new URL(req.url).searchParams, req.headers, scope),
);

export const POST = withRoute(async (req, _ctx, scope) => {
  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams();
  params.set("q", typeof b.q === "string" ? b.q : "");
  if (b.limit !== undefined) params.set("limit", String(b.limit));
  return search(params, req.headers, scope);
});
