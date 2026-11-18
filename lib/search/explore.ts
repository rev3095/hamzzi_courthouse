// 탐색 확장 순수 규칙 (DEC-029 제안): 결정문 통합 검색, 바로 가기, 시점 조문 비교, 신구 대조, 3단 비교, 자치법규, 연계·위임 대조.
// 법제처에서 가져온 값만 정리하고 새 내용을 만들지 않는다(절대 규칙 1). 유불리·심각도 같은 판단을 붙이지 않는다(절대 규칙 2).
// 네트워크·korean-law-mcp에 의존하지 않는다 (단위 테스트 대상).
import { ApiError } from "@/lib/api/errors";
import { SEARCH_NOTICE } from "@/lib/api/respond";
import { caseNumbersIn } from "@/lib/citations/patterns";
import { scanInput } from "@/lib/pii";
import { maskPii } from "@/lib/pii/detect";
import { MAX_QUERY_CHARS, statuteIdOf } from "./browse";
import { bodyExcerpt, isoDate, normalizeArticleNo, stripHtml } from "./normalize";
import type {
  AdminRuleHit,
  AnnexRef,
  ArticleAtDate,
  ArticleHit,
  DecisionDetail,
  DecisionDomain,
  DecisionHit,
  LawVersion,
  OldNewCompare,
  OldNewRow,
  OrdinanceDetail,
  OrdinanceHit,
  OrdinanceLink,
  ThreeTier,
  ThreeTierRow,
} from "./types";

const LAW_GO = "https://www.law.go.kr";

// --- 결정문 종류 -------------------------------------------------------------------------

type DomainSpec = {
  label: string;
  /** 법제처 Open API target */
  target: string;
  placeholder: string;
  /** 목록·상세 응답에서 읽을 필드 이름 (앞에서부터 처음 있는 값) */
  id: string[];
  title: string[];
  refNo: string[];
  agency: string[];
  /** 응답에 기관 필드가 없을 때 쓰는 고정 기관명 */
  agencyName?: string;
  date: string[];
  /** 날짜가 뜻하는 것 (회신·종국·의결·등록 …) */
  dateLabel: string;
  /** 상세에서 보여 줄 항목 (라벨, 응답 필드). 이유·전문은 넣지 않는다 */
  sections: [string, string][];
  /** 요지가 모두 비었을 때만 가린 일부를 보여 줄 본문 필드 */
  bodyField: string | null;
  /** 법제처가 상세 조회를 제공하지 않는 종류는 false (목록만) */
  hasDetail: boolean;
  /** 국가법령정보센터 공개 주소. 실제로 열리는 것을 확인한 종류만 (2026-11-18). 조세심판·소청심사·권익위 특별행정심판·국세청 해석·영문 법령은 주소를 확인하지 못해 null */
  url: ((id: string) => string) | null;
  note: string;
};

const SPECIAL_APPEAL = {
  id: ["특별행정심판재결례일련번호"],
  title: ["사건명"],
  refNo: ["청구번호", "사건번호"],
  agency: ["재결청"],
  date: ["의결일자"],
  dateLabel: "의결",
  bodyField: null,
  hasDetail: true,
  url: null,
};
const COMMITTEE = {
  id: ["결정문일련번호"],
  refNo: ["사건번호", "결정번호", "안건번호", "의안번호"],
  agency: ["기관명"],
  bodyField: null,
  hasDetail: true,
  url: null,
};

/** 목록만 주는 규정류 (학칙·공사공단·공공기관 규정). 본문은 법제처 원문에서 본다 */
const INSTITUTION_RULE = {
  id: ["행정규칙일련번호"],
  title: ["행정규칙명"],
  refNo: ["행정규칙종류"],
  agency: ["소관부처명"],
  date: ["시행일자", "발령일자"],
  dateLabel: "시행",
  sections: [] as [string, string][],
  bodyField: null,
  hasDetail: false,
  url: (id: string) => `${LAW_GO}/LSW/schlPubRulInfoP.do?schlPubRulSeq=${encodeURIComponent(id)}`,
};

/** lexdiff README의 "판례·해석례 통합"과 같은 범위: 법제처 Open API가 주는 결정문 종류 (판례는 /cases) */
export const DECISION_DOMAINS: Record<DecisionDomain, DomainSpec> = {
  interpretation: {
    label: "법령해석례",
    target: "expc",
    placeholder: "예: 임대차, 공공임대주택",
    id: ["법령해석례일련번호"],
    title: ["안건명"],
    refNo: ["법령해석례번호", "안건번호"],
    agency: ["해석기관명"],
    date: ["회신일자", "해석일자"],
    dateLabel: "회신",
    sections: [
      ["질의요지", "질의요지"],
      ["회답", "회답"],
    ],
    bodyField: "이유",
    hasDetail: true,
    url: (id) => `${LAW_GO}/LSW/expcInfoP.do?expcSeq=${encodeURIComponent(id)}`,
    note: "법제처 법령해석례를 안건명으로 찾은 결과예요.",
  },
  constitutional: {
    label: "헌재 결정례",
    target: "detc",
    placeholder: "예: 임대차보호법, 재산권",
    id: ["헌재결정례일련번호"],
    title: ["사건명"],
    refNo: ["사건번호"],
    agency: [],
    agencyName: "헌법재판소",
    date: ["종국일자"],
    dateLabel: "종국",
    sections: [
      ["판시사항", "판시사항"],
      ["결정요지", "결정요지"],
      ["심판대상조문", "심판대상조문"],
      ["참조조문", "참조조문"],
    ],
    bodyField: "전문",
    hasDetail: true,
    url: (id) => `${LAW_GO}/LSW/detcInfoP.do?detcSeq=${encodeURIComponent(id)}`,
    note: "헌법재판소 결정례를 사건명으로 찾은 결과예요.",
  },
  admin_appeal: {
    label: "행정심판 재결례",
    target: "decc",
    placeholder: "예: 영업정지, 과징금",
    id: ["행정심판재결례일련번호", "행정심판례일련번호"],
    title: ["사건명"],
    refNo: ["사건번호"],
    agency: ["재결청"],
    date: ["의결일자"],
    dateLabel: "의결",
    sections: [
      ["주문", "주문"],
      ["청구취지", "청구취지"],
      ["재결요지", "재결요지"],
    ],
    bodyField: null,
    hasDetail: true,
    url: (id) => `${LAW_GO}/LSW/deccInfoP.do?deccSeq=${encodeURIComponent(id)}`,
    note: "행정심판 재결례를 사건명으로 찾은 결과예요.",
  },
  tax_tribunal: {
    ...SPECIAL_APPEAL,
    label: "조세심판 재결례",
    target: "ttSpecialDecc",
    placeholder: "예: 양도소득세, 증여",
    sections: [
      ["주문", "주문"],
      ["재결요지", "재결요지"],
      ["관련법령", "관련법령"],
    ],
    note: "조세심판원 재결례를 사건명으로 찾은 결과예요.",
  },
  appeal_review: {
    ...SPECIAL_APPEAL,
    label: "소청심사 재결례",
    target: "adapSpecialDecc",
    placeholder: "예: 징계, 감봉",
    refNo: ["사건번호", "청구번호"],
    sections: [
      ["주문", "주문"],
      ["처분요지", "처분요지"],
      ["재결요지", "재결요지"],
    ],
    note: "소청심사위원회 재결례를 사건명으로 찾은 결과예요.",
  },
  acr_special: {
    ...SPECIAL_APPEAL,
    label: "권익위 특별행정심판",
    target: "acrSpecialDecc",
    placeholder: "예: 감경, 처분 취소",
    refNo: ["사건번호", "청구번호"],
    sections: [
      ["주문", "주문"],
      ["청구취지", "청구취지"],
      ["재결요지", "재결요지"],
      ["관계법령", "관계법령"],
    ],
    note: "국민권익위원회 특별행정심판 재결례를 사건명으로 찾은 결과예요.",
  },
  customs: {
    label: "관세청 해석",
    target: "kcsCgmExpc",
    placeholder: "예: 과세가격, 원산지",
    id: ["법령해석일련번호"],
    title: ["안건명"],
    refNo: ["안건번호"],
    agency: ["해석기관명"],
    date: ["해석일자"],
    dateLabel: "해석",
    sections: [
      ["질의요지", "질의요지"],
      ["회답", "회답"],
      ["관련법령", "관련법령"],
    ],
    bodyField: null,
    hasDetail: true,
    url: null,
    note: "관세청 법령해석을 안건명으로 찾은 결과예요.",
  },
  nts: {
    label: "국세청 해석",
    target: "ntsCgmExpc",
    placeholder: "예: 양도, 부가가치세",
    id: ["법령해석일련번호"],
    title: ["안건명"],
    refNo: ["안건번호"],
    agency: ["해석기관명"],
    date: ["해석일자"],
    dateLabel: "해석",
    sections: [],
    bodyField: null,
    hasDetail: false,
    url: null,
    note: "국세청 법령해석을 안건명으로 찾은 결과예요. 법제처가 본문 조회를 제공하지 않아 목록만 보여 드려요.",
  },
  ftc: {
    ...COMMITTEE,
    label: "공정위 결정문",
    target: "ftc",
    placeholder: "예: 과징금, 불공정거래",
    title: ["사건명"],
    agencyName: "공정거래위원회",
    date: ["결정일자", "의결일자"],
    dateLabel: "결정",
    sections: [
      ["주문", "주문"],
      ["결정요지", "결정요지"],
    ],
    url: (id) => `${LAW_GO}/LSW/ftcInfoP.do?ftcSeq=${encodeURIComponent(id)}`,
    note: "공정거래위원회 결정문을 사건명으로 찾은 결과예요.",
  },
  pipc: {
    ...COMMITTEE,
    label: "개인정보위 결정문",
    target: "ppc",
    placeholder: "예: 개인정보 유출, 동의",
    title: ["안건명"],
    agencyName: "개인정보보호위원회",
    date: ["의결일", "의결일자", "의결연월일"],
    dateLabel: "의결",
    sections: [
      ["주문", "주문"],
      ["결정요지", "결정요지"],
    ],
    url: (id) => `${LAW_GO}/LSW/ppcInfoP.do?ppcSeq=${encodeURIComponent(id)}`,
    note: "개인정보보호위원회 결정문을 안건명으로 찾은 결과예요.",
  },
  nlrc: {
    ...COMMITTEE,
    label: "노동위 결정문",
    target: "nlrc",
    placeholder: "예: 부당해고, 부당노동행위",
    title: ["제목"],
    agencyName: "노동위원회",
    date: ["등록일"],
    dateLabel: "등록",
    sections: [
      ["판정사항", "판정사항"],
      ["판정요지", "판정요지"],
      ["판정결과", "판정결과"],
    ],
    url: (id) => `${LAW_GO}/LSW/nlrcInfoP.do?nlrcSeq=${encodeURIComponent(id)}`,
    note: "노동위원회 결정문을 제목으로 찾은 결과예요.",
  },
  acr: {
    ...COMMITTEE,
    label: "권익위 결정문",
    target: "acr",
    placeholder: "예: 보상, 고충민원",
    title: ["제목"],
    refNo: ["의안번호"],
    agencyName: "국민권익위원회",
    date: ["의결일", "의결일자"],
    dateLabel: "의결",
    sections: [
      ["주문", "주문"],
      ["결정요지", "결정요지"],
    ],
    url: (id) => `${LAW_GO}/LSW/acrInfoP.do?acrSeq=${encodeURIComponent(id)}`,
    note: "국민권익위원회 결정문을 제목으로 찾은 결과예요.",
  },
  treaty: {
    label: "조약",
    target: "trty",
    placeholder: "예: 투자, 범죄인 인도",
    id: ["조약일련번호"],
    title: ["조약명"],
    refNo: ["조약구분명"],
    agency: [],
    date: ["발효일자"],
    dateLabel: "발효",
    sections: [],
    bodyField: null,
    hasDetail: false,
    url: (id) => `${LAW_GO}/LSW/trtyInfoP.do?trtySeq=${encodeURIComponent(id)}`,
    note: "조약을 이름으로 찾은 결과예요. 목록만 보여 드려요.",
  },
  school: {
    ...INSTITUTION_RULE,
    label: "학칙",
    target: "school",
    placeholder: "예: 학칙, 장학금",
    note: "대학 등의 학칙을 이름으로 찾은 결과예요. 목록만 보여 드려요.",
  },
  public_corp: {
    ...INSTITUTION_RULE,
    label: "공사·공단 규정",
    target: "public",
    placeholder: "예: 인사 규정, 계약",
    note: "지방공사·공단 규정을 이름으로 찾은 결과예요. 목록만 보여 드려요.",
  },
  public_inst: {
    ...INSTITUTION_RULE,
    label: "공공기관 규정",
    target: "pi",
    placeholder: "예: 인사규정, 보수",
    note: "공공기관 규정을 이름으로 찾은 결과예요. 목록만 보여 드려요.",
  },
  english_law: {
    label: "영문 법령",
    target: "elaw",
    placeholder: "예: civil, lease (영어로)",
    id: ["법령일련번호"],
    title: ["법령명영문"],
    refNo: ["법령명한글"],
    agency: ["소관부처명"],
    date: ["시행일자"],
    dateLabel: "시행",
    sections: [],
    bodyField: null,
    hasDetail: false,
    url: null,
    note: "영문으로 번역된 법령을 영문 이름으로 찾은 결과예요. 목록만 보여 드려요.",
  },
};

/** 화면 탭 순서 */
export const DECISION_TABS = (Object.keys(DECISION_DOMAINS) as DecisionDomain[]).map((domain) => ({
  domain,
  label: DECISION_DOMAINS[domain].label,
  placeholder: DECISION_DOMAINS[domain].placeholder,
  dateLabel: DECISION_DOMAINS[domain].dateLabel,
}));

export const isDecisionDomain = (v: unknown): v is DecisionDomain =>
  typeof v === "string" && Object.hasOwn(DECISION_DOMAINS, v);

export function assertDecisionDomain(v: unknown): DecisionDomain {
  if (!isDecisionDomain(v)) throw new ApiError("NOT_FOUND");
  return v;
}

/** 법제처 일련번호만 받는다 */
export function assertSeq(id: string) {
  if (!/^\d{1,16}$/.test(id)) throw new ApiError("NOT_FOUND");
}

/** 검색어 검사. 법제처로 보내므로 개인정보로 보이면 보내지 않는다 (F-007) */
export function parseSearchText(value: unknown, field = "q"): string {
  const q = (typeof value === "string" ? value : "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!q) throw new ApiError("EMPTY_INPUT", { field });
  if (q.length > MAX_QUERY_CHARS) {
    throw new ApiError("VALIDATION_ERROR", { field, maxChars: MAX_QUERY_CHARS });
  }
  const scan = scanInput(q);
  if (scan.findings.length > 0 || scan.sensitive.length > 0) {
    throw new ApiError("VALIDATION_ERROR", { field, reason: "personal_info" });
  }
  return q;
}

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object" && typeof (v as { content?: unknown }).content === "string")
    return (v as { content: string }).content.trim() || null;
  return typeof v === "number" ? String(v) : null;
};

/** "2011.2.22." · "2019.04.22" · "20240923" → "2011-02-22". 한 자리 월·일도 받는다 */
export function looseDate(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const m = /^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(s);
  return m ? isoDate(`${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`) : isoDate(s);
}

/** 목록·상세 응답의 한 행 → DecisionHit. 제목·번호가 없으면 버린다. 상세링크(인증키 포함)는 쓰지 않는다 */
export function decisionHit(
  domain: DecisionDomain,
  row: Record<string, unknown>,
): DecisionHit | null {
  const spec = DECISION_DOMAINS[domain];
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = stripHtml(str(row[k]));
      if (v) return v;
    }
    return null;
  };
  const id = pick(spec.id);
  const title = pick(spec.title);
  if (!id || !/^\d+$/.test(id) || !title) return null;
  let decidedAt: string | null = null;
  for (const k of spec.date) decidedAt ??= looseDate(row[k]);
  return {
    domain,
    id,
    title,
    refNo: pick(spec.refNo)?.replace(/\s+/g, " ") ?? null,
    agency: pick(spec.agency) ?? spec.agencyName ?? null,
    decidedAt,
    dateLabel: spec.dateLabel,
    hasDetail: spec.hasDetail,
    sourceUrl: spec.url?.(id) ?? null,
  };
}

/** 목록 응답(XML)의 `<항목 id="n">…</항목>` 행들. 종류마다 항목 이름이 달라 이름을 가리지 않는다 */
export function decisionRows(xml: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of xml.matchAll(/<([A-Za-z]+)\s+id="\d+"\s*>([\s\S]*?)<\/\1>/g)) {
    const row: Record<string, string> = {};
    for (const f of m[2].matchAll(/<([^\s/>!?]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      row[f[1]] = decode(f[2]);
    }
    out.push(row);
  }
  return out;
}

/**
 * 상세 응답(JSON) → DecisionDetail. 법제처가 준 요지 항목만 싣고 개인정보로 보이는 표현은 가린다 (F-007).
 * 위원회 결정문은 `의결서` 안에 항목이 들어 있다. 없으면 null
 */
export function decisionDetail(
  domain: DecisionDomain,
  id: string,
  json: unknown,
): DecisionDetail | null {
  const spec = DECISION_DOMAINS[domain];
  if (!spec.hasDetail) return null;
  const root = json && typeof json === "object" ? Object.values(json as object)[0] : null;
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const outer = root as Record<string, unknown>;
  const inner = outer["의결서"];
  const row =
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? { ...outer, ...(inner as Record<string, unknown>) }
      : outer;
  const hit = decisionHit(domain, { ...row, [spec.id[0]]: id });
  if (!hit) return null;
  const sections = spec.sections.flatMap(([section, key]) => {
    const text = stripHtml(str(row[key]));
    return text ? [{ section, text: maskPii(text).maskedText }] : [];
  });
  const fromBody = sections.length === 0 && spec.bodyField !== null;
  const excerpt = fromBody ? bodyExcerpt(str(row[spec.bodyField!])) : null;
  if (excerpt) sections.push({ section: "본문 일부", text: excerpt });
  const portal = str(row["관세법령정보포털원문링크"]);
  const sourceUrl =
    hit.sourceUrl ??
    (portal && /^https:\/\//.test(portal) && !/[?&]OC=/i.test(portal) ? portal : null);
  return { ...hit, sourceUrl, sections, fromBody: fromBody && excerpt !== null };
}

export function decisionListResponse(domain: DecisionDomain, hits: DecisionHit[]) {
  return {
    domain,
    items: hits,
    outcome: hits.length > 0 ? ("grounded" as const) : ("no_result_in_scope" as const),
    searchScopeNote: `${DECISION_DOMAINS[domain].note} 질문과 관련이 없는 결과가 섞일 수 있고, 결과가 없다고 해당 자료가 없다는 뜻은 아니에요.`,
    notice: SEARCH_NOTICE,
  };
}

// --- 바로 가기 (약칭·조문·사건번호) ----------------------------------------------------------

const DIRECT_STATUTE =
  /^([가-힣][가-힣·ㆍ\s]{0,58}?(?:법률|법|령|규칙|규정))\s*(?:제\s*)?(\d{1,4})\s*조(?:\s*의\s*(\d{1,3}))?$/;

export type DirectTarget =
  | { kind: "statute"; lawName: string; articleNo: string; id: string }
  | { kind: "case"; caseNo: string };

/**
 * "민법 750조", "주택임대차법 제3조의2" → 조문, "2023다12345" → 사건번호. 그 밖에는 null(일반 검색).
 * 법령명은 여기서 고치지 않는다 — 약칭은 조회할 때 법제처 검색이 정식 이름으로 풀어 준다.
 */
export function directTarget(input: string): DirectTarget | null {
  const q = input.normalize("NFKC").replace(/\s+/g, " ").trim();
  const m = DIRECT_STATUTE.exec(q);
  if (m) {
    const lawName = m[1].trim();
    const articleNo = normalizeArticleNo(`제${m[2]}조${m[3] ? `의${m[3]}` : ""}`);
    if (articleNo)
      return { kind: "statute", lawName, articleNo, id: statuteIdOf(lawName, articleNo) };
  }
  const nos = caseNumbersIn(q);
  if (nos.length === 1 && nos[0] === q.replace(/\s+/g, "")) return { kind: "case", caseNo: nos[0] };
  return null;
}

// --- XML 읽기 ----------------------------------------------------------------------------

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

/** `<item …><필드>값</필드>…</item>` 반복을 필드 맵 목록으로. 중첩 없는 단순 목록 응답 전용 */
export function xmlItems(xml: string, itemTag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const itemRe = new RegExp(`<${itemTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${itemTag}>`, "g");
  for (const m of xml.matchAll(itemRe)) {
    const row: Record<string, string> = {};
    for (const f of m[1].matchAll(/<([^\s/>!?]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      row[f[1]] = decode(f[2]);
    }
    out.push(row);
  }
  return out;
}

/** 법령 검색 응답(XML)에서 약칭이 입력과 똑같은(공백 무시) 법령의 정식 이름. 없거나 둘 이상이면 null */
export function lawNameByAbbreviation(xml: string, input: string): string | null {
  const want = input.replace(/\s+/g, "");
  const names = xmlItems(xml, "law")
    .filter((r) => (r["법령약칭명"] ?? "").replace(/\s+/g, "") === want)
    .map((r) => r["법령명한글"])
    .filter(Boolean);
  return new Set(names).size === 1 ? names[0] : null;
}

// --- 법령 버전·시점 조문 --------------------------------------------------------------------

export function lawVersion(v: {
  mst: string;
  efYd?: string;
  ancNo?: string;
  ancYd?: string;
  lawNm?: string;
  rrCls?: string;
}): LawVersion {
  return {
    mst: v.mst,
    lawName: v.lawNm?.trim() ?? "",
    effectiveFrom: isoDate(v.efYd),
    promulgatedAt: isoDate(v.ancYd),
    promulgationNo: v.ancNo?.trim() || null,
    revisionType: v.rrCls?.trim() || null,
  };
}

export type DiffPart = { type: "same" | "removed" | "added"; text: string };

/** 줄 단위 비교 (최장 공통 부분열). 조문은 항·호가 줄로 나뉘어 있어 줄 단위면 바뀐 항이 드러난다 */
export function diffLines(before: string, after: string): DiffPart[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last?.type === type) last.text += `\n${text}`;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("removed", a[i++]);
    else push("added", b[j++]);
  }
  while (i < n) push("removed", a[i++]);
  while (j < m) push("added", b[j++]);
  return out;
}

export const AT_DATE_NOTES = {
  notInForce:
    "법제처 연혁에서 그 날짜에 시행 중인 이 법령을 찾지 못했어요. 제정 전이거나 폐지 뒤일 수 있어요.",
  noArticle:
    "그 날짜에 시행 중이던 법령에는 같은 번호의 조문이 없어요. 조문 번호가 바뀌었거나 그 뒤에 새로 생긴 조문일 수 있어요.",
  unavailable:
    "그 날짜의 조문을 법제처에서 불러오지 못했어요. 법제처 원문의 연혁에서 확인해 주세요.",
} as const;

/** 시점 조문 조회 결과 → 응답 조각. 현행 조문과 줄 단위로 비교해 바뀐 줄만 표시한다 */
export function atDateResponse(current: ArticleHit, at: ArticleAtDate | null) {
  if (!at) return { atDate: null, atDateNote: AT_DATE_NOTES.unavailable };
  if (at.status === "not_in_force") return { atDate: null, atDateNote: AT_DATE_NOTES.notInForce };
  if (at.status === "no_article")
    return { atDate: null, atDateVersion: at.version, atDateNote: AT_DATE_NOTES.noArticle };
  const diff = diffLines(at.article.text, current.text);
  return {
    atDate: {
      lawName: at.article.lawName,
      articleNo: at.article.articleNo,
      articleTitle: at.article.title,
      body: at.article.text,
      effectiveFrom: at.article.effectiveFrom,
      version: at.version,
      sameAsCurrent: diff.every((d) => d.type === "same"),
      diff,
    },
  };
}

// --- 신구조문 대조 ------------------------------------------------------------------------

function oldNewRows(xml: string, listTag: string): OldNewRow[] {
  const list = new RegExp(`<${listTag}>([\\s\\S]*?)</${listTag}>`).exec(xml)?.[1] ?? "";
  return [...list.matchAll(/<조문\s+no="(\d+)"[^>]*>([\s\S]*?)<\/조문>/g)].map((m) => {
    const raw = decode(m[2]);
    // 법제처가 바뀐 부분을 <P>…</P>로 표시한다. 표시 문구만 따로 모으고 본문에서는 태그를 뗀다
    const changed = [...raw.matchAll(/<P>([\s\S]*?)<\/P>/gi)]
      .map((p) => p[1].trim())
      .filter(Boolean);
    return { no: Number(m[1]), text: raw.replace(/<\/?P>/gi, "").trim(), changed };
  });
}

function oldNewInfo(xml: string, tag: string): LawVersion | null {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1];
  if (!block) return null;
  const f = (name: string) =>
    decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block)?.[1] ?? "");
  const mst = f("법령일련번호");
  if (!mst) return null;
  return {
    mst,
    lawName: f("법령명"),
    effectiveFrom: isoDate(f("시행일자")),
    promulgatedAt: isoDate(f("공포일자")),
    promulgationNo: f("공포번호") || null,
    revisionType: f("제개정구분명") || null,
  };
}

/** 법제처 신구법 대조(oldAndNew) XML → 줄 목록. 대조표가 없으면 빈 목록 */
export function parseOldNew(xml: string, fallbackName: string): OldNewCompare {
  const older = oldNewInfo(xml, "구조문_기본정보");
  const newer = oldNewInfo(xml, "신조문_기본정보");
  return {
    lawName: newer?.lawName || older?.lawName || fallbackName,
    old: older,
    new: newer,
    oldRows: oldNewRows(xml, "구조문목록"),
    newRows: oldNewRows(xml, "신조문목록"),
  };
}

// --- 3단 비교 · 위임 대조 -------------------------------------------------------------------

type RawTier = {
  meta?: { lawName?: string };
  articles?: {
    joNum?: string;
    title?: string;
    content?: string;
    delegations?: {
      type?: string;
      lawName?: string;
      joNum?: string;
      title?: string;
      content?: string;
    }[];
  }[];
};

export function threeTier(raw: RawTier, fallbackName: string): ThreeTier {
  const rows: ThreeTierRow[] = (raw.articles ?? []).flatMap((a) => {
    const articleNo = normalizeArticleNo(a.joNum ?? "");
    if (!articleNo) return [];
    return [
      {
        articleNo,
        title: (a.title ?? "").replace(/^제\d+조(?:의\d+)?\s*/, "").replace(/^\((.*)\)$/, "$1"),
        text: stripHtml(a.content) ?? "",
        delegations: (a.delegations ?? []).flatMap((d) => {
          const text = stripHtml(d.content);
          if (!d.lawName || !text) return [];
          return [
            {
              type: d.type ?? "",
              lawName: d.lawName,
              articleNo: normalizeArticleNo(d.joNum ?? ""),
              title: d.title ?? "",
              text,
            },
          ];
        }),
      },
    ];
  });
  return { lawName: raw.meta?.lawName || fallbackName, rows };
}

const DELEGATION_PHRASE =
  /(대통령령|총리령|[가-힣]{2,12}부령|대법원규칙|조례|[가-힣]{2,14}(?:장관|위원회|처장|청장)이\s*정하여\s*고시)(?:으로|로)?\s*정(?:한다|하는|할|하여|하고|함)|(?:장관|위원회|처장|청장)이\s*정하여\s*고시/;

export type DelegationCheck = {
  articleNo: string;
  title: string;
  phrase: string;
  linked: number;
};

/**
 * 조문에 "대통령령으로 정한다" 같은 위임 문구가 있는데 법제처 3단비교에 연결된 하위 조문이 없는 조문을 고른다.
 * 사실 대조일 뿐이다 — 하위법령이 없다고 판정하지 않는다(화면 안내 DELEGATION_NOTE).
 */
export function delegationChecks(articles: ArticleHit[], tier: ThreeTier): DelegationCheck[] {
  const linked = new Map(tier.rows.map((r) => [r.articleNo, r.delegations.length]));
  return articles.flatMap((a) => {
    const m = DELEGATION_PHRASE.exec(a.text);
    if (!m) return [];
    return [
      {
        articleNo: a.articleNo,
        title: a.title,
        phrase: m[0],
        linked: linked.get(a.articleNo) ?? 0,
      },
    ];
  });
}

export const DELEGATION_NOTE =
  "조문의 위임 문구와 법제처 3단비교 연결을 대조한 결과예요. '연결 없음'은 법제처 자료에 연결이 등록되지 않았다는 뜻이고, 하위법령이 없다는 뜻이 아닐 수 있어요. 법제처 원문에서 확인해 주세요.";

export const IMPACT_NOTE =
  "법제처의 3단비교와 법령-자치법규 연계 자료에 등록된 관계만 보여 드려요. 영향의 크기나 중요도는 판단하지 않아요.";

// --- 별표·자치법규·행정규칙 ------------------------------------------------------------------

const fileUrl = (v: unknown) => {
  const s = str(v);
  if (!s || /\/DRF\/|[?&]OC=/i.test(s)) return null;
  if (/^https?:\/\/(www\.)?law\.go\.kr\//.test(s)) return s.replace(/^http:/, "https:");
  // 인증키가 든 DRF 주소는 쓰지 않는다
  return s.startsWith("/LSW/") ? `${LAW_GO}${s}` : null;
};

export function annexRefs(list: Record<string, unknown>[], lawName: string): AnnexRef[] {
  const want = lawName.replace(/\s+/g, "");
  return list.flatMap((r) => {
    const title = stripHtml(str(r["별표명"]));
    if (!title) return [];
    const owner = str(r["관련법령명"])?.replace(/\s+/g, "");
    if (owner && owner !== want) return [];
    const digits = str(r["별표번호"])?.replace(/\D/g, "") ?? "";
    const main = Number.parseInt(digits.slice(0, 4) || "0", 10);
    const branch = Number.parseInt(digits.slice(4, 6) || "0", 10);
    return [
      {
        no: main > 0 ? (branch > 0 ? `${main}의${branch}` : String(main)) : null,
        title,
        kind: str(r["별표종류"]),
        fileUrl: fileUrl(r["별표서식파일링크"]),
        pdfUrl: fileUrl(r["별표서식PDF파일링크"]),
      },
    ];
  });
}

export const ordinanceUrl = (id: string) =>
  `${LAW_GO}/LSW/ordinInfoP.do?ordinSeq=${encodeURIComponent(id)}`;
export const adminRuleUrl = (id: string) =>
  `${LAW_GO}/LSW/admRulInfoP.do?admRulSeq=${encodeURIComponent(id)}`;
export const lawUrl = (lawName: string) =>
  `${LAW_GO}/${encodeURIComponent("법령")}/${encodeURIComponent(lawName)}`;

export function ordinanceHits(xml: string): OrdinanceHit[] {
  return xmlItems(xml, "law").flatMap((r) => {
    const id = r["자치법규일련번호"];
    const name = r["자치법규명"];
    if (!id || !/^\d+$/.test(id) || !name) return [];
    return [
      {
        id,
        name,
        region: r["지자체기관명"] || null,
        kind: r["자치법규종류"] || null,
        effectiveFrom: isoDate(r["시행일자"]),
        promulgatedAt: isoDate(r["공포일자"]),
        sourceUrl: ordinanceUrl(id),
      },
    ];
  });
}

const firstText = (v: unknown): string | null =>
  Array.isArray(v) ? (v.map(str).find(Boolean) ?? null) : str(v);

export function ordinanceDetail(id: string, json: unknown): OrdinanceDetail | null {
  const root = (json as { LawService?: Record<string, unknown> })?.LawService;
  const info = root?.["자치법규기본정보"] as Record<string, unknown> | undefined;
  const name = str(info?.["자치법규명"]);
  if (!root || !info || !name) return null;
  const jo = (root["조문"] as { 조?: unknown } | undefined)?.["조"];
  const units = (jo == null ? [] : Array.isArray(jo) ? jo : [jo]) as Record<string, unknown>[];
  const articles = units.flatMap((u) => {
    const text = stripHtml(firstText(u["조내용"]));
    if (!text || firstText(u["조문여부"]) === "N") return [];
    return [
      {
        articleNo: normalizeArticleNo(text.slice(0, 20)),
        title: firstText(u["조제목"]) ?? "",
        text,
      },
    ];
  });
  return {
    id,
    name,
    region: str(info["지자체기관명"]),
    kind: null,
    effectiveFrom: isoDate(info["시행일자"]),
    promulgatedAt: isoDate(info["공포일자"]),
    sourceUrl: ordinanceUrl(id),
    articles,
  };
}

export function adminRuleHits(xml: string): AdminRuleHit[] {
  return xmlItems(xml, "admrul").flatMap((r) => {
    const id = r["행정규칙일련번호"];
    const name = r["행정규칙명"];
    if (!id || !/^\d+$/.test(id) || !name) return [];
    if (r["현행연혁구분"] && r["현행연혁구분"] !== "현행") return [];
    return [
      {
        id,
        name,
        kind: r["행정규칙종류"] || null,
        agency: r["소관부처명"] || null,
        issuedAt: isoDate(r["발령일자"]),
        effectiveFrom: isoDate(r["시행일자"]),
        sourceUrl: adminRuleUrl(id),
      },
    ];
  });
}

export function ordinanceLinks(xml: string): OrdinanceLink[] {
  const seen = new Set<string>();
  return xmlItems(xml, "law").flatMap((r) => {
    const id = r["자치법규일련번호"];
    const lawName = r["법령명한글"];
    const name = r["자치법규명"];
    if (!id || !lawName || !name) return [];
    const link: OrdinanceLink = {
      lawName,
      lawArticleNo: normalizeArticleNo(r["법령조번호"] ?? ""),
      ordinanceId: id,
      ordinanceName: name,
      ordinanceArticleNo: normalizeArticleNo(r["자치법규조번호"] ?? ""),
    };
    const key = `${link.lawName}|${link.lawArticleNo}|${id}|${link.ordinanceArticleNo}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

// --- 법령 도구 경로 ------------------------------------------------------------------------

export const LAW_VIEWS = [
  "articles",
  "three-tier",
  "old-new",
  "history",
  "annexes",
  "impact",
] as const;
export type LawView = (typeof LAW_VIEWS)[number];

export function parseLawName(raw: string): string {
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    throw new ApiError("NOT_FOUND");
  }
  name = name.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!/^[가-힣0-9·ㆍ,\s()]{1,80}$/.test(name) || !/[가-힣]/.test(name))
    throw new ApiError("NOT_FOUND");
  return name;
}

export function parseLawView(raw: string): LawView {
  if (!(LAW_VIEWS as readonly string[]).includes(raw)) throw new ApiError("NOT_FOUND");
  return raw as LawView;
}

export const withNotice = <T extends object>(data: T) => ({ ...data, notice: SEARCH_NOTICE });

export function parseLimit(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ApiError("VALIDATION_ERROR", { field: "limit", max });
  }
  return n;
}

/** GET ?q=&limit= 과 POST 본문 { q, limit } 을 같은 꼴로 읽는다. 화면은 POST를 쓴다 — 검색어가 주소·접속 기록에 남지 않게 (F-007) */
export function searchInput(
  src: URLSearchParams | Record<string, unknown>,
  fallback: number,
  max: number,
) {
  const get = (k: string) => (src instanceof URLSearchParams ? (src.get(k) ?? undefined) : src[k]);
  return { q: parseSearchText(get("q")), limit: parseLimit(get("limit"), fallback, max), get };
}

export function listResponse<T>(items: T[], searchScopeNote: string) {
  return {
    items,
    outcome: items.length > 0 ? ("grounded" as const) : ("no_result_in_scope" as const),
    searchScopeNote,
    notice: SEARCH_NOTICE,
  };
}

export const ORDINANCE_NOTE =
  "국가법령정보센터(법제처)에서 자치법규 이름에 검색어가 들어간 조례·규칙을 찾은 결과예요. 결과가 없다고 해당 자치법규가 없다는 뜻은 아니에요.";
export const ADMIN_RULE_NOTE =
  "국가법령정보센터(법제처)에서 이름에 검색어가 들어간 현행 행정규칙(고시·훈령·예규)을 찾은 결과예요.";
export const CITING_NOTE =
  "판결 본문에 이 법령 이름과 조문 번호가 함께 나오는 판례를 법제처에서 찾은 결과예요. 이 조문과 관련이 적은 판례가 섞일 수 있어요.";
