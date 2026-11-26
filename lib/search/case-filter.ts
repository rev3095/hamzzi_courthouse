// 판례 검색 거르기·쪽 넘기기 순수 규칙 (개선안 A, DEC-070 후속). 법원·선고 기간·정렬은 법제처(lawSearch target=prec)에
// 그대로 맡기고, 법제처가 준 목록·전체 건수만 옮긴다 — 관련도·유불리 순위를 매기지 않는다 (PRD 8.3, 절대 규칙 2).
// 사건 종류(민사·형사 등)는 법제처가 준 사건종류명을 쓰고, 없으면 사건번호 부호를 고정 표로 읽는다(판정이 아니라 분류 표시).
import { ApiError } from "@/lib/api/errors";
import { scanInput } from "@/lib/pii";
import { xmlItems } from "./explore";
import { caseUrl, isoDate } from "./normalize";
import type { CaseHit } from "./types";

export const CASE_SORTS = ["source", "newest", "oldest", "name"] as const;
export type CaseSort = (typeof CASE_SORTS)[number];

/** 법제처 sort 값: 선고일 내림·오름, 사건명 오름. source는 보내지 않는다 */
const SORT_PARAM: Record<CaseSort, string | null> = {
  source: null,
  newest: "ddes",
  oldest: "dasc",
  name: "lasc",
};

export type CaseFilter = {
  court: string | null;
  fromYear: string | null;
  toYear: string | null;
  sort: CaseSort;
  page: number;
};

export const CASE_PAGE_SIZE = 20;
export const MAX_CASE_PAGE = 50;

/**
 * 법원 이름: 정해 둔 법원(대법원·고등·지방·가정·행정·회생·특허법원, 줄임 "○○고법"·"○○지법")과 그 아래 "○○지원"만 받는다.
 * 이름 뒤에 "법원"을 붙인 글 같은 자유 글은 법제처로 보내지 않는다 (F-007). 화면은 이번 결과의 법원명 중 이 꼴인 것만 고르게 한다
 */
const REGION = "서울|부산|대구|광주|대전|수원|인천|울산|춘천|청주|전주|창원|제주|의정부";
const COURT_RE = new RegExp(
  `^(?:대법원|특허법원|(?:${REGION})(?:고등법원|고법|지방법원|지법|가정법원|행정법원|회생법원)|서울(?:중앙|동부|남부|북부|서부)지방법원)(?: [가-힣]{1,6}지원)?$`,
);
export function isCourtName(v: string): boolean {
  if (!COURT_RE.test(v)) return false;
  const scan = scanInput(v);
  return scan.findings.length === 0 && scan.sensitive.length === 0;
}

/** 거르기 검색(본문 검색) 결과의 범위 안내 */
export const CASE_PAGE_NOTE =
  "국가법령정보센터(법제처)에서 판례 본문에 검색어가 들어간 판례를 법원·선고 연도·정렬 조건대로 찾은 결과예요. 질문과 관련이 없는 판례가 섞일 수 있고, 결과가 없다고 판례가 없다는 뜻은 아니에요.";
const YEAR_RE = /^(19[5-9]\d|20\d\d)$/;

/**
 * 요청 본문(또는 쿼리)의 거르기 값. 하나도 없으면 null — 이때는 지금처럼 판례명+본문 검색(searchCases)을 쓴다.
 * 꼴이 맞지 않으면 400 (법제처로 보내지 않는다)
 */
export function parseCaseFilter(get: (k: string) => unknown): CaseFilter | null {
  const raw = {
    court: get("court"),
    fromYear: get("fromYear"),
    toYear: get("toYear"),
    sort: get("sort"),
    page: get("page"),
  };
  if (Object.values(raw).every((v) => v === undefined || v === null || v === "")) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const court = text(raw.court);
  if (court && !isCourtName(court)) throw new ApiError("VALIDATION_ERROR", { field: "court" });
  const fromYear = text(raw.fromYear);
  const toYear = text(raw.toYear);
  for (const [field, y] of [
    ["fromYear", fromYear],
    ["toYear", toYear],
  ] as const)
    if (y && !YEAR_RE.test(y)) throw new ApiError("VALIDATION_ERROR", { field });
  if (fromYear && toYear && fromYear > toYear)
    throw new ApiError("VALIDATION_ERROR", { field: "toYear", reason: "before_from" });
  const sort = text(raw.sort) ?? "source";
  if (!(CASE_SORTS as readonly string[]).includes(sort))
    throw new ApiError("VALIDATION_ERROR", { field: "sort" });
  const page =
    raw.page === undefined || raw.page === null || raw.page === "" ? 1 : Number(raw.page);
  if (!Number.isInteger(page) || page < 1 || page > MAX_CASE_PAGE)
    throw new ApiError("VALIDATION_ERROR", { field: "page", max: MAX_CASE_PAGE });
  return { court, fromYear, toYear, sort: sort as CaseSort, page };
}

/** 법제처 판례 목록 요청 인자. 검색어는 판례 본문 검색(search=2) — 본문에 판례명·요지가 함께 들어 있다 */
export function precSearchParams(query: string, f: CaseFilter): Record<string, string> {
  const p: Record<string, string> = {
    query,
    search: "2",
    display: String(CASE_PAGE_SIZE),
    page: String(f.page),
  };
  if (f.court) p.curt = f.court;
  const sort = SORT_PARAM[f.sort];
  if (sort) p.sort = sort;
  // 선고일 범위 (법제처 prncYd: YYYYMMDD~YYYYMMDD). 한쪽만 있으면 열린 끝을 넓게 둔다
  if (f.fromYear || f.toYear) p.prncYd = `${f.fromYear ?? "1950"}0101~${f.toYear ?? "2099"}1231`;
  return p;
}

/** 사건번호 부호 → 사건 종류 (법원 사건부호 표의 대표 부호만). 모르면 null */
const CASE_CODE: [RegExp, string][] = [
  [/\d(다|나|가합|가단|가소|가|머|카)\d/, "민사"],
  [/\d(도|노|고합|고단|고정|고약|오|모|초)\d/, "형사"],
  [/\d(두|누|구합|구단|구)\d/, "행정"],
  [/\d(므|르|드합|드단|드|느|브|스)\d/, "가사"],
  [/\d(후|허)\d/, "특허"],
  [/\d(헌가|헌나|헌다|헌라|헌마|헌바|헌사|헌아)\d/, "헌법"],
];

export function caseTypeOf(caseTypeName: string | null | undefined, caseNo: string): string | null {
  const name = caseTypeName?.trim();
  if (name) return name;
  const no = caseNo.replace(/\s+/g, "");
  return CASE_CODE.find(([re]) => re.test(no))?.[1] ?? null;
}

/** 법제처 판례 목록 응답 → 판례 행 + 전체 건수. 법원명·사건번호가 없는 행(국세법령정보시스템 출처 등, DEC-008)은 뺀다 */
export function precPage(xml: string): {
  total: number;
  items: (CaseHit & { caseType: string | null })[];
} {
  const total = Number(/<totalCnt>\s*(\d+)\s*<\/totalCnt>/.exec(xml)?.[1] ?? "0");
  const items = xmlItems(xml, "prec").flatMap((r) => {
    const id = r["판례일련번호"];
    const caseNo = r["사건번호"];
    const court = r["법원명"];
    if (!id || !/^\d+$/.test(id) || !caseNo || !court) return [];
    return [
      {
        id,
        caseNo,
        caseName: r["사건명"] ?? "",
        court,
        decidedAt: isoDate(r["선고일자"]),
        sourceUrl: caseUrl(id),
        caseType: caseTypeOf(r["사건종류명"], caseNo),
      },
    ];
  });
  return { total: Number.isFinite(total) ? total : 0, items };
}
