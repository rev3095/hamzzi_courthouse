// 검색 결과 타입. docs/API.md 2절의 CaseRef·StatuteRef와 필드명을 맞춘다.
// 데모(DEC-009)는 korean-law-mcp로 법제처를 실시간 조회해 이 타입으로 바꿔 쓴다. 나중에 수집 DB로 바꿔도 같은 타입을 쓴다.

/** 조문 1개. id = 근거 키(`law:법령명:제N조`) */
export type ArticleHit = {
  id: string;
  lawName: string;
  articleNo: string; // "제3조", "제3조의2"
  title: string;
  text: string; // 조문 본문 (항·호·목 포함)
  effectiveFrom: string | null; // YYYY-MM-DD
  sourceUrl: string;
};

/** 판례 목록 항목. id = 법제처 판례일련번호 */
export type CaseHit = {
  id: string;
  caseNo: string;
  caseName: string;
  court: string;
  decidedAt: string | null; // YYYY-MM-DD
  sourceUrl: string;
};

/** 판례 상세. 판례 전문은 담지 않는다 (DEC-007) */
export type CaseDetail = CaseHit & {
  holding: string | null; // 판시사항
  summary: string | null; // 판결요지
  refs: string | null; // 참조조문 원문
  /** 판시사항·요지가 없어 본문 일부를 근거로 쓰는지 (API.md 4.1 cases[].fromBody) */
  fromBody: boolean;
  /** fromBody일 때만: 당사자·대리인 머리 블록을 떼고 개인정보를 가린 본문 일부. 저장하지 않는다 */
  bodyExcerpt: string | null;
};

/** 인용 실존 재조회 결과 (F-005 AC2 ③). exists=null은 판정 불가(확인 필요) */
export type CitationCheck = { citation: string; exists: boolean | null; note?: string };

// --- 탐색 확장 (DEC-029 제안): 결정문·시점 조문·신구 대조·3단 비교·자치법규 ---------------------

/** 판례 밖 결정문 종류. 법제처 Open API 대상: expc · detc · ttSpecialDecc · kcsCgmExpc */
export type DecisionDomain =
  | "interpretation"
  | "constitutional"
  | "admin_appeal"
  | "tax_tribunal"
  | "appeal_review"
  | "acr_special"
  | "customs"
  | "nts"
  | "ftc"
  | "pipc"
  | "nlrc"
  | "acr"
  | "treaty"
  | "school"
  | "public_corp"
  | "public_inst"
  | "english_law";

/** 결정문 목록 항목. id = 법제처 일련번호. sourceUrl은 공개 주소를 아는 종류만 */
export type DecisionHit = {
  domain: DecisionDomain;
  id: string;
  title: string;
  refNo: string | null; // 안건번호·사건번호·청구번호
  agency: string | null;
  decidedAt: string | null;
  /** 날짜가 뜻하는 것 (회신·종국·의결·등록 …) */
  dateLabel: string;
  /** 법제처가 상세 조회를 주지 않는 종류는 false */
  hasDetail: boolean;
  sourceUrl: string | null;
};

/** 결정문 상세. 요지 항목만 담고 이유·전문은 담지 않는다 (DEC-007과 같은 원칙) */
export type DecisionDetail = DecisionHit & {
  sections: { section: string; text: string }[];
  fromBody: boolean;
};

/** 법령 한 버전 (시행 단위) */
export type LawVersion = {
  mst: string;
  lawName: string;
  effectiveFrom: string | null;
  promulgatedAt: string | null;
  promulgationNo: string | null;
  revisionType: string | null; // 일부개정·전부개정·타법개정 …
};

/** 특정 날짜의 조문 조회 결과 */
export type ArticleAtDate =
  | { status: "found"; article: ArticleHit; version: LawVersion }
  | { status: "not_in_force" } // 그날 시행 중인 버전이 없음(제정 전·폐지 후)
  | { status: "no_article"; version: LawVersion }; // 그 버전에 같은 번호 조문이 없음

export type OldNewRow = { no: number; text: string; changed: string[] };
export type OldNewCompare = {
  lawName: string;
  old: LawVersion | null;
  new: LawVersion | null;
  oldRows: OldNewRow[];
  newRows: OldNewRow[];
};

export type LowerRule = {
  type: string; // 시행령·시행규칙·행정규칙
  lawName: string;
  articleNo: string | null;
  title: string;
  text: string;
};
export type ThreeTierRow = {
  articleNo: string;
  title: string;
  text: string;
  delegations: LowerRule[];
};
export type ThreeTier = { lawName: string; rows: ThreeTierRow[] };

export type AnnexRef = {
  no: string | null;
  title: string;
  kind: string | null; // 별표·서식
  fileUrl: string | null;
  pdfUrl: string | null;
};

export type OrdinanceHit = {
  id: string;
  name: string;
  region: string | null;
  kind: string | null;
  effectiveFrom: string | null;
  promulgatedAt: string | null;
  sourceUrl: string;
};
export type OrdinanceDetail = OrdinanceHit & {
  articles: { articleNo: string | null; title: string; text: string }[];
};

export type AdminRuleHit = {
  id: string;
  name: string;
  kind: string | null;
  agency: string | null;
  issuedAt: string | null;
  effectiveFrom: string | null;
  sourceUrl: string;
};

/** 법령 조문 ↔ 자치법규 조문 연계 (법제처 연계정보) */
export type OrdinanceLink = {
  lawName: string;
  lawArticleNo: string | null;
  ordinanceId: string;
  ordinanceName: string;
  ordinanceArticleNo: string | null;
};
