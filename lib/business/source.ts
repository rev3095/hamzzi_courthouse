// 법인·사업자 공개 정보 조회 — 공식 API 호출 (server-only, F-015 AC4, DEC-052).
// ① 네이버 지역 검색 API (openapi.naver.com/v1/search/local.json — 지도 화면을 긁지 않는다)
// ② 공공데이터포털 금융위원회_기업기본정보 (getCorpOutline_V2)
// 키가 없으면 그 출처는 no_key로 돌려주고 화면은 바로 가기 링크만 보인다. 실패는 failed — 오류 내용·키·요청 주소는 내보내지 않는다.
// 응답 필드 이름은 두 기관의 공개 명세 기준이고, 키를 넣은 뒤 tests/live/business.live.test.ts(무료)로 확인한다.
import "server-only";
import {
  BUSINESS_MAX_ITEMS,
  parseCorpOutline,
  parseNaverLocal,
  toResult,
  type CorpItem,
  type PlaceItem,
  type SourceResult,
} from "./policy";

type Env = Record<string, string | undefined>;
const TIMEOUT_MS = 6_000;

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("upstream");
  return res.json();
}

export async function searchPlaces(
  name: string,
  env: Env = process.env,
): Promise<SourceResult<PlaceItem>> {
  const id = env.NAVER_CLIENT_ID;
  const secret = env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return { status: "no_key", items: [] };
  const url = `https://openapi.naver.com/v1/search/local.json?${new URLSearchParams({
    query: name,
    display: String(BUSINESS_MAX_ITEMS),
  })}`;
  try {
    return toResult(
      parseNaverLocal(
        await getJson(url, { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }),
      ),
    );
  } catch {
    return { status: "failed", items: [] };
  }
}

export async function searchCorps(
  name: string,
  env: Env = process.env,
): Promise<SourceResult<CorpItem>> {
  const key = env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return { status: "no_key", items: [] };
  const url = `https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2?${new URLSearchParams(
    { serviceKey: key, pageNo: "1", numOfRows: "20", resultType: "json", corpNm: name },
  )}`;
  try {
    return toResult(parseCorpOutline(await getJson(url)));
  } catch {
    return { status: "failed", items: [] };
  }
}
