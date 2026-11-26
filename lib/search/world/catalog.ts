// 국내·해외 법령 통합 검색 (DEC-074) — 의료기기 핵심 법령 목록. 직접 고른 고정 목록이고 모델을 쓰지 않는다.
// 주소는 각국 정부의 공식 법령 사이트만 쓴다(OFFICIAL_HOSTS). 설명은 그 법령이 다루는 범위만 일반적으로 적고
// 기간·금액·처벌 수위 같은 숫자와 판단은 적지 않는다(절대 규칙 2·3) — 정확한 내용은 공식 원문에서 본다.
// 국제기구(IMDRF) 문서는 법령이 아니고 주소 확인도 되지 않아 넣지 않았다.
import { lawUrl } from "@/lib/search/explore";
import { GENERAL_TERM, queryTerms, TERMS } from "./glossary";
import { COUNTRIES, COUNTRY_CODES, type CountryCode, type WorldLawHit } from "./types";

/** catalog에 쓸 수 있는 공식 사이트 */
export const OFFICIAL_HOSTS = [
  "www.law.go.kr",
  "www.ecfr.gov",
  "www.govinfo.gov",
  "eur-lex.europa.eu",
  "laws.e-gov.go.jp",
  "www.legislation.gov.uk",
  "laws-lois.justice.gc.ca",
  "www.legislation.gov.au",
  "www.gov.cn",
] as const;

export type CatalogEntry = WorldLawHit & { curated: true; keywords: string[] };

const SOURCE: Record<CountryCode, string> = {
  kr: "법제처 국가법령정보센터",
  us: "eCFR (미국 연방규정집)",
  eu: "EUR-Lex (유럽연합 법령 사이트)",
  jp: "e-Gov 法令検索 (일본 디지털청)",
  uk: "legislation.gov.uk (영국 국립기록원)",
  ca: "Justice Laws Website (캐나다 법무부)",
  au: "Federal Register of Legislation (호주 정부)",
  cn: "중국 정부망 (gov.cn)",
  intl: "",
};

const kr = (name: string, kind: string, snippet: string, keywords: string[]): CatalogEntry => ({
  id: `kr:${name}`,
  country: "kr",
  title: name,
  kind,
  snippet,
  sourceUrl: lawUrl(name),
  source: SOURCE.kr,
  internal: `/laws/${encodeURIComponent(name)}`,
  curated: true,
  keywords,
});

const cfr = (part: string, title: string, titleKo: string, snippet: string, keywords: string[]) =>
  ({
    id: `us:21cfr-part-${part}`,
    country: "us",
    title,
    titleKo,
    kind: "연방규정",
    citation: `21 CFR Part ${part}`,
    snippet,
    sourceUrl: `https://www.ecfr.gov/current/title-21/part-${part}`,
    source: SOURCE.us,
    curated: true,
    keywords,
  }) satisfies CatalogEntry;

const foreign = (
  country: Exclude<CountryCode, "kr">,
  key: string,
  e: Omit<CatalogEntry, "id" | "country" | "source" | "curated">,
): CatalogEntry => ({
  id: `${country}:${key}`,
  country,
  source: SOURCE[country],
  curated: true,
  ...e,
});

export const CATALOG: readonly CatalogEntry[] = [
  // ── 대한민국
  kr("의료기기법", "법률", "의료기기의 제조·수입·판매와 취급 전반을 다루는 기본 법률이에요.", [
    "허가",
    "인증",
    "신고",
    "제조",
    "수입",
    "판매",
    "광고",
    "표시",
    "회수",
    "리콜",
    "부작용",
    "추적관리",
    "등급",
    "임상시험",
  ]),
  kr("의료기기법 시행령", "대통령령", "의료기기법에서 맡긴 사항을 정한 대통령령이에요.", [
    "의료기기법",
  ]),
  kr(
    "의료기기법 시행규칙",
    "총리령",
    "허가·인증·신고 절차와 서류처럼 실무에 필요한 세부 사항을 정한 규칙이에요.",
    ["의료기기법", "허가", "인증", "신고", "품질관리", "표시", "절차"],
  ),
  kr(
    "체외진단의료기기법",
    "법률",
    "몸 밖에서 검체를 검사하는 체외진단의료기기를 따로 다루는 법률이에요.",
    ["체외진단", "진단", "허가", "임상"],
  ),
  kr(
    "의료기기산업 육성 및 혁신의료기기 지원법",
    "법률",
    "의료기기 산업 지원과 혁신의료기기 지정·지원을 다루는 법률이에요.",
    ["혁신의료기기", "산업", "지원", "소프트웨어"],
  ),
  kr(
    "디지털의료제품법",
    "법률",
    "디지털의료기기와 디지털 기술이 들어간 의료제품을 다루는 법률이에요.",
    ["디지털", "소프트웨어", "인공지능", "사이버보안", "디지털의료기기"],
  ),
  kr(
    "약사법",
    "법률",
    "의약품과 약국·약사에 관한 기본 법률이에요. 의약품과 함께 쓰는 제품을 볼 때 함께 봐요.",
    ["의약품", "제조", "판매", "광고"],
  ),
  kr(
    "첨단재생의료 및 첨단바이오의약품 안전 및 지원에 관한 법률",
    "법률",
    "첨단재생의료와 첨단바이오의약품의 안전 관리와 지원을 다루는 법률이에요.",
    ["재생의료", "바이오", "의약품", "임상"],
  ),

  // ── 미국
  foreign("us", "fdca-ch5", {
    title: "Federal Food, Drug, and Cosmetic Act, Chapter V (Drugs and Devices)",
    titleKo: "연방 식품·의약품·화장품법 제5장 (의약품과 의료기기)",
    kind: "법률",
    citation: "21 U.S.C. ch. 9 subch. V",
    snippet:
      "미국 의료기기 규제의 바탕이 되는 연방 법률이에요. 링크는 미국 정부 출판국(govinfo)의 의료기기 분류 조문으로 열려요.",
    sourceUrl: "https://www.govinfo.gov/link/uscode/21/360c",
    keywords: ["FDCA", "FD&C", "등급", "분류", "허가", "510(k)", "PMA", "classification"],
  }),
  cfr(
    "801",
    "Labeling",
    "표시 기재 (라벨링)",
    "의료기기의 표시와 사용 안내에 관한 연방규정이에요.",
    ["표시", "라벨", "첨부문서", "label"],
  ),
  cfr(
    "803",
    "Medical Device Reporting",
    "의료기기 이상사례 보고",
    "의료기기와 관련된 이상사례를 보고하는 일에 관한 연방규정이에요.",
    ["부작용", "이상사례", "보고", "adverse event", "MDR", "report"],
  ),
  cfr(
    "806",
    "Medical Devices; Reports of Corrections and Removals",
    "시정·회수 보고",
    "의료기기를 고치거나 거두어들일 때의 보고에 관한 연방규정이에요.",
    ["리콜", "회수", "시정", "recall", "correction", "removal"],
  ),
  cfr(
    "807",
    "Establishment Registration and Device Listing for Manufacturers and Initial Importers of Devices",
    "시설 등록·기기 목록 · 시판 전 신고",
    "제조·수입 시설 등록과 기기 목록, 시판 전 신고에 관한 연방규정이에요.",
    ["등록", "신고", "수입", "제조", "510(k)", "premarket notification", "registration", "listing"],
  ),
  cfr(
    "812",
    "Investigational Device Exemptions",
    "임상시험용 의료기기 면제",
    "임상시험에 쓰는 의료기기에 관한 연방규정이에요.",
    ["임상시험", "임상", "IDE", "clinical", "investigation"],
  ),
  cfr(
    "814",
    "Premarket Approval of Medical Devices",
    "의료기기 시판 전 허가",
    "의료기기의 시판 전 허가 신청과 심사에 관한 연방규정이에요.",
    ["허가", "품목허가", "심사", "PMA", "premarket approval", "approval"],
  ),
  cfr(
    "820",
    "Quality Management System Regulation",
    "품질경영시스템 규정",
    "의료기기 제조의 품질 관리 체계에 관한 연방규정이에요.",
    ["품질관리", "품질", "제조", "QMSR", "QSR", "GMP", "quality"],
  ),
  cfr(
    "830",
    "Unique Device Identification",
    "의료기기 고유식별",
    "의료기기에 붙이는 고유식별 표시에 관한 연방규정이에요.",
    ["고유식별", "추적관리", "표시", "UDI", "tracking"],
  ),
  cfr(
    "860",
    "Medical Device Classification Procedures",
    "의료기기 등급 분류 절차",
    "의료기기의 등급을 나누는 절차에 관한 연방규정이에요.",
    ["등급", "분류", "classification", "de novo"],
  ),

  // ── 유럽연합
  foreign("eu", "reg/2017/745", {
    title: "Regulation (EU) 2017/745 on medical devices",
    titleKo: "유럽연합 의료기기 규정 (MDR)",
    kind: "규정(Regulation)",
    citation: "Regulation (EU) 2017/745",
    snippet: "유럽연합에서 의료기기를 시장에 내놓고 관리하는 일을 다루는 규정이에요.",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg/2017/745/oj",
    keywords: [
      "MDR",
      "인증",
      "CE",
      "등급",
      "분류",
      "임상",
      "시판 후",
      "고유식별",
      "UDI",
      "표시",
      "품질관리",
      "conformity",
    ],
  }),
  foreign("eu", "reg/2017/746", {
    title: "Regulation (EU) 2017/746 on in vitro diagnostic medical devices",
    titleKo: "유럽연합 체외진단의료기기 규정 (IVDR)",
    kind: "규정(Regulation)",
    citation: "Regulation (EU) 2017/746",
    snippet: "유럽연합에서 체외진단의료기기를 다루는 규정이에요.",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg/2017/746/oj",
    keywords: ["IVDR", "체외진단", "진단", "인증", "CE", "in vitro"],
  }),
  foreign("eu", "reg/2024/1689", {
    title: "Regulation (EU) 2024/1689 (Artificial Intelligence Act)",
    titleKo: "유럽연합 인공지능법 (AI Act)",
    kind: "규정(Regulation)",
    citation: "Regulation (EU) 2024/1689",
    snippet:
      "인공지능 시스템을 다루는 규정이에요. 인공지능이 들어간 소프트웨어 의료기기를 볼 때 함께 봐요.",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
    keywords: ["인공지능", "AI", "소프트웨어", "디지털", "artificial intelligence", "software"],
  }),

  // ── 일본
  foreign("jp", "335AC0000000145", {
    title: "医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律",
    titleKo: "의약품·의료기기 등의 품질, 유효성 및 안전성 확보 등에 관한 법률 (약기법)",
    kind: "법률",
    citation: "昭和三十五年法律第百四十五号",
    snippet: "일본에서 의약품과 의료기기의 제조·판매와 안전 관리를 다루는 기본 법률이에요.",
    sourceUrl: "https://laws.e-gov.go.jp/law/335AC0000000145",
    keywords: [
      "薬機法",
      "약기법",
      "허가",
      "승인",
      "인증",
      "신고",
      "제조",
      "판매",
      "광고",
      "표시",
      "회수",
      "리콜",
      "부작용",
      "承認",
      "認証",
      "届出",
      "回収",
    ],
  }),
  foreign("jp", "336CO0000000011", {
    title: "医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律施行令",
    titleKo: "약기법 시행령",
    kind: "정령(政令)",
    snippet: "약기법에서 맡긴 사항을 정한 일본 내각의 명령이에요.",
    sourceUrl: "https://laws.e-gov.go.jp/law/336CO0000000011",
    keywords: ["薬機法", "약기법", "施行令"],
  }),
  foreign("jp", "336M50000100001", {
    title: "医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律施行規則",
    titleKo: "약기법 시행규칙",
    kind: "성령(省令)",
    snippet: "약기법의 절차와 서류 같은 세부 사항을 정한 일본 후생노동성의 규칙이에요.",
    sourceUrl: "https://laws.e-gov.go.jp/law/336M50000100001",
    keywords: ["薬機法", "약기법", "施行規則", "절차", "허가", "신고"],
  }),

  // ── 영국
  foreign("uk", "uksi/2002/618", {
    title: "The Medical Devices Regulations 2002",
    titleKo: "영국 의료기기 규정",
    kind: "행정입법(Statutory Instrument)",
    citation: "S.I. 2002/618",
    snippet: "영국에서 의료기기를 시장에 내놓는 요건을 다루는 규정이에요.",
    sourceUrl: "https://www.legislation.gov.uk/uksi/2002/618/contents",
    keywords: ["인증", "등록", "표시", "UKCA", "CE", "시판 후", "체외진단", "conformity"],
  }),
  foreign("uk", "ukpga/2021/3", {
    title: "Medicines and Medical Devices Act 2021",
    titleKo: "영국 의약품·의료기기법",
    kind: "법률",
    citation: "2021 c. 3",
    snippet: "영국 정부가 의약품과 의료기기 규정을 만들고 집행하는 권한을 다루는 법률이에요.",
    sourceUrl: "https://www.legislation.gov.uk/ukpga/2021/3/contents",
    keywords: ["의약품", "행정처분", "enforcement", "회수", "리콜"],
  }),

  // ── 캐나다
  foreign("ca", "SOR-98-282", {
    title: "Medical Devices Regulations",
    titleKo: "캐나다 의료기기 규정",
    kind: "규정(Regulations)",
    citation: "SOR/98-282",
    snippet: "캐나다에서 의료기기의 판매·수입과 허가를 다루는 규정이에요.",
    sourceUrl: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-98-282/",
    keywords: ["허가", "등급", "분류", "표시", "수입", "판매", "회수", "리콜", "부작용", "licence"],
  }),
  foreign("ca", "F-27", {
    title: "Food and Drugs Act",
    titleKo: "캐나다 식품의약품법",
    kind: "법률",
    citation: "R.S.C., 1985, c. F-27",
    snippet: "캐나다에서 식품·의약품·화장품·의료기기를 다루는 기본 법률이에요.",
    sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/F-27/",
    keywords: ["의약품", "광고", "판매", "표시"],
  }),

  // ── 호주
  foreign("au", "C2004A03952", {
    title: "Therapeutic Goods Act 1989",
    titleKo: "호주 치료용품법",
    kind: "법률",
    snippet: "호주에서 의약품과 의료기기 같은 치료용품을 다루는 기본 법률이에요.",
    sourceUrl: "https://www.legislation.gov.au/C2004A03952/latest/text",
    keywords: ["의약품", "등록", "허가", "광고", "회수", "리콜", "TGA", "ARTG"],
  }),
  foreign("au", "F2002B00237", {
    title: "Therapeutic Goods (Medical Devices) Regulations 2002",
    titleKo: "호주 치료용품(의료기기) 규정",
    kind: "규정(Regulations)",
    snippet: "호주에서 의료기기의 분류와 요건을 다루는 규정이에요.",
    sourceUrl: "https://www.legislation.gov.au/F2002B00237/latest/text",
    keywords: ["등급", "분류", "인증", "표시", "체외진단", "conformity"],
  }),

  // ── 중국
  foreign("cn", "order-739", {
    title: "医疗器械监督管理条例",
    titleKo: "중국 의료기기 감독관리 조례",
    kind: "행정법규(국무원령)",
    citation: "国务院令第739号",
    snippet:
      "중국에서 의료기기의 등록·생산·경영·사용과 감독을 다루는 국무원 조례예요. 링크는 공포 때의 글이라 그 뒤 개정은 중국 정부 사이트에서 확인해 주세요.",
    sourceUrl: "https://www.gov.cn/zhengce/content/2021-03/18/content_5593739.htm",
    keywords: [
      "등록",
      "허가",
      "신고",
      "제조",
      "판매",
      "수입",
      "등급",
      "분류",
      "회수",
      "리콜",
      "광고",
      "NMPA",
    ],
  }),
];

/** 나라 순서(kr, us, eu …)대로, 나라 안에서는 적어 둔 순서대로 */
export const catalogByCountry = (): {
  country: CountryCode;
  name: string;
  items: CatalogEntry[];
}[] =>
  COUNTRY_CODES.map((country) => ({
    country,
    name: COUNTRIES[country].name,
    items: CATALOG.filter((e) => e.country === country),
  })).filter((g) => g.items.length > 0);

const lower = (s: string) => s.normalize("NFKC").toLowerCase();
const GENERAL = new Set([
  GENERAL_TERM.ko,
  GENERAL_TERM.en,
  `${GENERAL_TERM.en}s`,
  GENERAL_TERM.ja,
  "의료 기기",
  "医疗器械",
]);

const strip = ({ keywords, ...hit }: CatalogEntry): WorldLawHit => {
  void keywords;
  return hit;
};

/**
 * 고정 목록에서 찾는다. 관련도 점수는 없다 — 목록에 적어 둔 순서 그대로 준다.
 * 의료기기 전반을 묻는 검색어(의료기기, medical device, 医療機器)는 목록 전체를 준다.
 */
export function catalogSearch(query: string): WorldLawHit[] {
  const q = lower(query).replace(/\s+/g, " ").trim();
  if (!q) return [];
  let rest = q;
  let general = false;
  for (const g of [...GENERAL].sort((a, b) => b.length - a.length)) {
    // 낱말 전체가 분야 이름일 때만 뺀다 ("의료기기법"은 법 이름이라 그대로 둔다)
    const re = new RegExp(`(^|\\s)${g}(을|를|의|은|는|이|가|에|도)?(?=\\s|$)`, "g");
    if (re.test(rest)) {
      general = true;
      rest = rest.replace(re, " ");
    }
  }
  rest = rest.replace(/\s+/g, " ").trim();
  if (!rest) return general ? CATALOG.map(strip) : [];

  // 찾을 말: 남은 낱말 + 그 안의 아는 용어와 대응하는 영어·일본어
  const needles = new Set<string>();
  for (const token of rest.split(" ")) if (token.length >= 2) needles.add(token);
  const terms = queryTerms(rest);
  for (const ko of terms.ko) {
    if (GENERAL.has(ko)) continue;
    needles.add(ko);
    const t = TERMS.find((x) => x.ko === ko);
    if (t) {
      needles.add(lower(t.en));
      needles.add(lower(t.ja));
    }
  }
  if (needles.size === 0) return [];
  return CATALOG.filter((e) => {
    const hay = lower(
      [e.title, e.titleKo, e.citation, e.snippet, ...e.keywords].filter(Boolean).join(" \n "),
    );
    return [...needles].some((n) => hay.includes(n));
  }).map(strip);
}
