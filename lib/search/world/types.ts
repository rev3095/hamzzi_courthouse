// 국내·해외 법령 통합 검색 (DEC-074) — 공통 타입. 순수 타입·상수만 둔다(브라우저 묶음에서도 쓴다).
// 해외 자료는 각국 정부의 공식 공개 API를 그 요청에서 실시간으로 조회하고 저장하지 않는다(DEC-009와 같은 원칙).
// 화면은 모델 없이 목록만 보인다(WORLD_NOTICE). 관련도·유불리 판정은 없다.

export const COUNTRY_CODES = ["kr", "us", "eu", "jp", "uk", "ca", "au", "cn", "intl"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type CountryInfo = {
  /** 화면 이름 */
  name: string;
  /** 실시간 조회를 하는 공식 출처 이름. 없으면(링크만 두는 곳) null */
  liveSource: string | null;
};

export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  kr: { name: "대한민국", liveSource: "법제처 국가법령정보센터" },
  us: { name: "미국", liveSource: "eCFR · openFDA (미국 연방정부)" },
  eu: { name: "유럽연합", liveSource: null },
  jp: { name: "일본", liveSource: "e-Gov 法令検索 (일본 디지털청)" },
  uk: { name: "영국", liveSource: "legislation.gov.uk (영국 국립기록원)" },
  ca: { name: "캐나다", liveSource: null },
  au: { name: "호주", liveSource: "Federal Register of Legislation (호주 정부)" },
  cn: { name: "중국", liveSource: null },
  intl: { name: "국제기구", liveSource: null },
};

export const isCountryCode = (v: unknown): v is CountryCode =>
  typeof v === "string" && (COUNTRY_CODES as readonly string[]).includes(v);

/** 국내 / 해외 필터 */
export type Region = "domestic" | "foreign";
export const regionOf = (c: CountryCode): Region => (c === "kr" ? "domestic" : "foreign");

/** 통합 검색 결과 한 줄 */
export type WorldLawHit = {
  /** `${country}:${출처 안 식별자}` */
  id: string;
  country: CountryCode;
  /** 원어 제목 (공식 출처 그대로) */
  title: string;
  /** 한국어 이름. 목록(catalog)에 직접 적어 둔 것만 — 기계 번역하지 않는다 */
  titleKo?: string;
  /** 법률·시행령·규정(Regulation)·연방규정 조문 등 */
  kind: string;
  /** 인용 표기 (예: 21 CFR 820.30, Regulation (EU) 2017/745) */
  citation?: string;
  /** 한 줄 설명. catalog의 고정 문안이거나 출처가 준 요약 조각 */
  snippet?: string;
  /** YYYY-MM-DD (공포·시행·최근 개정 중 출처가 준 것) */
  date?: string;
  /** 공식 원문 주소 */
  sourceUrl: string;
  /** 출처 이름 (화면에 그대로 보인다) */
  source: string;
  /** 사이트 안 상세 경로. 국내 법령은 /laws/{이름} */
  internal?: string;
  /** catalog(직접 고른 핵심 법령)에서 온 줄인지 */
  curated?: boolean;
};

/** 실제 사례 한 건 (해외: 리콜·허가 같은 공개 기록, 국내: 판례는 기존 CaseHit를 쓴다) */
export type WorldCase = {
  id: string;
  country: CountryCode;
  /** 사례 종류 이름 (예: 리콜, 시판 전 신고(510(k))) */
  kind: string;
  title: string;
  /** 출처가 준 사유·설명 원문 조각 (번역하지 않는다) */
  summary: string;
  date?: string;
  sourceUrl: string;
  source: string;
};

/** 출처 하나의 조회 결과. 실패한 출처는 전체를 막지 않고 failed로 알린다 */
export type WorldSearchResult = {
  items: WorldLawHit[];
  /** 조회에 실패했거나 시간이 넘은 나라 */
  failed: CountryCode[];
  /** 한국어 검색어를 바꿔 보낸 말 (화면에 "이렇게 찾았어요"로 보인다). 바꾸지 못했으면 비어 있다 */
  translated: { en?: string; ja?: string };
};

export const WORLD_NOTICE = "각국 공식 법령 사이트 검색 결과 · AI 생성 아님";
