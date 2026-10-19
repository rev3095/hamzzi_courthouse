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
