// POST /api/v1/businesses/lookup — 법인·사업자 공개 정보 조회 (F-015 AC4, DEC-052, API.md).
// 본문 { name }. 이름은 주소에 두지 않는다 (접속 기록에 남지 않게). 모델을 쓰지 않고 공식 API 두 곳만 부른다.
// 개인을 찾는 기능이 아니다 — 두 출처 모두 상호·법인만 돌려준다. 찾은 곳이 서류의 당사자와 같은 곳인지는 판단하지 않는다.
// 조회한 이름·결과는 저장·로그하지 않는다(no-store).
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { BUSINESS_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { BUSINESS_NOTICE, businessLinks, parseLookupRequest } from "@/lib/business/policy";
import { searchCorps, searchPlaces } from "@/lib/business/source";

export const POST = withRoute(async (req, _ctx, scope) => {
  const { name } = parseLookupRequest(await readJson(req));
  await assertRateLimit(BUSINESS_RATE, req.headers);
  const [places, corps] = await Promise.all([searchPlaces(name), searchCorps(name)]);
  const res = ok(
    { places, corps, links: businessLinks(name), notice: BUSINESS_NOTICE },
    scope.requestId,
  );
  res.headers.set("cache-control", "no-store");
  return res;
});
