// 판례·조문 직접 검색 순수 규칙 (F-003, F-004, API.md GET /cases · /cases/{id} · /statutes/{id}).
// 법제처에서 가져온 값만 돌려주고 새로 만들지 않는다(절대 규칙 1). 관련도 점수는 내지 않는다(PRD 8.3).
// 판례 전문은 반환·저장하지 않고 판시사항·판결요지만 (DEC-007).
import { ApiError } from "@/lib/api/errors";
import { SEARCH_NOTICE } from "@/lib/api/respond";
import { scanInput } from "@/lib/pii";
import { normalizeArticleNo } from "./normalize";
import type { ArticleHit, CaseDetail, CaseHit } from "./types";

export const MAX_QUERY_CHARS = 100;
export const DEFAULT_CASE_LIMIT = 10;
export const MAX_CASE_LIMIT = 20;

export const CASE_SEARCH_NOTE =
  "국가법령정보센터(법제처)에서 판례명·본문에 검색어가 들어간 판례를 찾은 결과예요. 질문과 관련이 없는 판례가 섞일 수 있고, 결과가 없다고 판례가 없다는 뜻은 아니에요.";

/** GET /cases 쿼리. 검색어는 법제처로 보내므로 개인정보로 보이면 보내지 않는다 (F-007) */
export function parseCaseQuery(params: URLSearchParams): { q: string; limit: number } {
  const q = (params.get("q") ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!q) throw new ApiError("EMPTY_INPUT", { field: "q" });
  if (q.length > MAX_QUERY_CHARS) {
    throw new ApiError("VALIDATION_ERROR", { field: "q", maxChars: MAX_QUERY_CHARS });
  }
  const scan = scanInput(q);
  if (scan.findings.length > 0 || scan.sensitive.length > 0) {
    throw new ApiError("VALIDATION_ERROR", { field: "q", reason: "personal_info" });
  }
  const raw = params.get("limit");
  const n = raw === null ? DEFAULT_CASE_LIMIT : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CASE_LIMIT) {
    throw new ApiError("VALIDATION_ERROR", { field: "limit", max: MAX_CASE_LIMIT });
  }
  return { q, limit: n };
}

const caseRef = (c: CaseHit) => ({
  id: c.id,
  caseNo: c.caseNo,
  caseName: c.caseName,
  court: c.court,
  decidedAt: c.decidedAt,
  sourceUrl: c.sourceUrl,
});

export function caseListResponse(hits: CaseHit[]) {
  return {
    items: hits.map(caseRef),
    outcome: hits.length > 0 ? ("grounded" as const) : ("no_result_in_scope" as const),
    searchScopeNote: CASE_SEARCH_NOTE,
    notice: SEARCH_NOTICE,
  };
}

/** 법제처 판례일련번호만 받는다. 아니면 404 (검증 근거에 없음, F-003 AC3) */
export function assertCaseId(id: string) {
  if (!/^\d{1,12}$/.test(id)) throw new ApiError("NOT_FOUND");
}

const LAW_NAME = /([가-힣][가-힣·ㆍ\s]{0,40}?(?:법률|법|령|규칙|규정))\s*(?=제\s*\d)/g;
const ARTICLE = /제\s*\d+\s*조(?:\s*의\s*\d+)?/g;

/**
 * 판례의 참조조문 원문("[1] 민법 제565조, 제567조 / [2] …")에서 "법령명 제N조" 목록을 뽑는다.
 * 원문에 적힌 법령명·조문번호만 쓰고, 법령명이 앞에 없는 조문은 바로 앞 법령명을 잇는다. 링크는 조문 화면이
 * 법제처에서 다시 찾아 보여 주므로, 잘못 읽은 항목은 "찾을 수 없음"이 된다
 */
export function citedStatutesFrom(refs: string | null, max = 20): { raw: string; id: string }[] {
  if (!refs) return [];
  const out: { raw: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const part of refs.split(/\[\d+\]|\/|\n/)) {
    let law: string | null = null;
    const anchors = [...part.matchAll(LAW_NAME)].map((m) => ({
      index: m.index ?? 0,
      name: m[1].replace(/\s+/g, " ").trim(),
    }));
    for (const m of part.matchAll(ARTICLE)) {
      const at = m.index ?? 0;
      for (const a of anchors) if (a.index <= at) law = a.name;
      const no = normalizeArticleNo(m[0]);
      if (!law || !no) continue;
      const id = statuteIdOf(law, no);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ raw: `${law} ${no}`, id });
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function caseDetailResponse(d: CaseDetail) {
  const sections = [
    ...(d.holding ? [{ section: "판시사항", text: d.holding }] : []),
    ...(d.summary ? [{ section: "판결요지", text: d.summary }] : []),
    ...(d.fromBody && d.bodyExcerpt ? [{ section: "본문 일부", text: d.bodyExcerpt }] : []),
  ];
  return {
    ...caseRef(d),
    holdingSummary: d.summary ?? d.holding,
    sections,
    fromBody: d.fromBody,
    citedStatutes: citedStatutesFrom(d.refs),
    notice: SEARCH_NOTICE,
  };
}

/** 조문 ID = "법령명:제N조(의M)" (URL 인코딩). 근거 키 `law:법령명:제N조`와 같은 꼴에서 접두어만 뺐다 */
export function statuteIdOf(lawName: string, articleNo: string): string {
  return `${lawName.replace(/\s+/g, "")}:${articleNo}`;
}

export function parseStatuteId(id: string): { lawName: string; articleNo: string } {
  let raw: string;
  try {
    raw = decodeURIComponent(id);
  } catch {
    throw new ApiError("NOT_FOUND");
  }
  const m = /^([가-힣·ㆍ\s]{1,60}):(제\d+조(?:의\d+)?)$/.exec(raw.trim());
  const no = m && normalizeArticleNo(m[2]);
  if (!m || !no) throw new ApiError("NOT_FOUND");
  return { lawName: m[1].trim(), articleNo: no };
}

/** asOf = YYYY-MM-DD. 없으면 null */
export function parseAsOf(params: URLSearchParams): string | null {
  const v = params.get("asOf");
  if (v === null || v === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw new ApiError("VALIDATION_ERROR", { field: "asOf", format: "YYYY-MM-DD" });
  }
  return v;
}

export const AS_OF_NOTE =
  "그 날짜에는 지금과 다른 조문이 시행됐을 수 있어요. 데모는 현행 조문만 보여 드리니, 그때 조문은 법제처 원문의 연혁에서 확인해 주세요.";

/**
 * GET /statutes/{id}. 법제처 조문을 그대로 (today = YYYY-MM-DD, 한국 시각). asOf가 현행 시행일 이후면 그 시점에도 같은 조문이 시행 중이었으므로
 * versionAtDate = 현행. 그보다 앞이면 시점별 조문을 데모가 가져오지 않으므로 null + 안내 (F-004 AC1)
 */
export function statuteResponse(a: ArticleHit, asOf: string | null, today: string) {
  const ref = {
    id: statuteIdOf(a.lawName, a.articleNo),
    lawName: a.lawName,
    articleNo: a.articleNo,
    effectiveFrom: a.effectiveFrom,
    sourceUrl: a.sourceUrl,
  };
  const sameAtDate = asOf !== null && a.effectiveFrom !== null && asOf >= a.effectiveFrom;
  return {
    ...ref,
    articleTitle: a.title,
    body: a.text,
    // 시행일이 오늘 이후면 아직 시행 전인 조문이다
    isCurrent: a.effectiveFrom === null || a.effectiveFrom <= today,
    ...(asOf !== null && {
      asOf,
      versionAtDate: sameAtDate ? ref : null,
      ...(!sameAtDate && { asOfNote: AS_OF_NOTE }),
    }),
    notice: SEARCH_NOTICE,
  };
}
