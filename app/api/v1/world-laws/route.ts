// /api/v1/world-laws — 국내·해외 법령 통합 검색 (DEC-074). 법제처와 각국 정부의 공식 공개 API를 그 요청에서 조회하고 저장하지 않는다.
// 모델을 쓰지 않는다(WORLD_NOTICE). 관련도 순위 없이 고정 목록 → 나라 순서로 준다. 실패한 출처는 failed로만 알린다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute, type RequestScope } from "@/lib/api/route";
import { SEARCH_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { searchInput } from "@/lib/search/explore";
import { searchWorldLaws } from "@/lib/search/world/source";
import { WORLD_NOTICE } from "@/lib/search/world/types";

async function search(
  src: URLSearchParams | Record<string, unknown>,
  headers: Headers,
  scope: RequestScope,
) {
  // 개인정보로 보이는 검색어는 여기서 막혀 어느 출처로도 나가지 않는다 (F-007)
  const { q } = searchInput(src, 30, 100);
  await assertRateLimit(SEARCH_RATE, headers);
  const { items, failed, translated } = await searchWorldLaws(q);
  return ok(
    {
      items,
      failed,
      translated,
      notice: WORLD_NOTICE,
      outcome: items.length > 0 ? ("grounded" as const) : ("no_result_in_scope" as const),
    },
    scope.requestId,
  );
}

export const GET = withRoute(async (req, _ctx, scope) =>
  search(new URL(req.url).searchParams, req.headers, scope),
);
export const POST = withRoute(async (req, _ctx, scope) =>
  search(((await readJson(req)) ?? {}) as Record<string, unknown>, req.headers, scope),
);
