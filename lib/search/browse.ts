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

const ARTICLE_HEAD = /^(.*?)(제\s*\d+\s*조(?:\s*의\s*\d+)?)/;
const LAW_ONLY = /^[가-힣][가-힣·ㆍ\s]{0,40}(?:법률|법|령|규칙|규정)$/;

export type CitedStatute = { raw: string; id: string | null };

/**
 * 판례의 참조조문 원문("[1] 민법 제565조, 제567조 / [2] …")에서 조문 목록을 뽑는다. 원문에 적힌 법령명·조문번호만 쓴다.
 * - "법령명 제N조"는 현행 조문 링크(id)를 단다. 같은 쉼표 목록에서 법령명 없이 이어지는 "제M조"만 앞 법령명을 잇는다.
 * - "구 법령", 괄호 설명(개정 전 등), "부칙"이 끼면 현행 조문과 다를 수 있어 링크 없이 원문 그대로 보이고, 뒤에 이어지는
 *   조문에도 법령명을 잇지 않는다 (절대 규칙 1 — 다른 조문으로 잘못 연결하지 않게)
 */
export function citedStatutesFrom(refs: string | null, max = 20): CitedStatute[] {
  if (!refs) return [];
  const out: CitedStatute[] = [];
  const seen = new Set<string>();
  const push = (item: CitedStatute) => {
    const key = item.id ?? `raw:${item.raw}`;
    if (seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push(item);
  };
  for (const part of refs.split(/\[\d+\]|\/|\n/)) {
    let law: string | null = null;
    for (const clause of part.split(/[,，]/)) {
      const m = ARTICLE_HEAD.exec(clause.trim());
      if (!m) continue;
      const prefix = m[1].replace(/\s+/g, " ").trim();
      const no = normalizeArticleNo(m[2]);
      if (!no) continue;
      if (!prefix) {
        if (law) push({ raw: `${law} ${no}`, id: statuteIdOf(law, no) });
        continue;
      }
      if (LAW_ONLY.test(prefix) && !/^구\s/.test(prefix)) {
        law = prefix;
        push({ raw: `${law} ${no}`, id: statuteIdOf(law, no) });
      } else {
        // 구법·괄호·부칙 등 — 원문 그대로, 링크 없음
        law = null;
        push({ raw: `${prefix} ${m[2].replace(/\s+/g, "")}`.slice(0, 120), id: null });
      }
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

export const AS_OF_NOTES = {
  before:
    "그 날짜에는 지금과 다른 조문이 시행됐을 수 있어요. 데모는 법제처의 현행 법령 조문만 가져오니, 그때 조문은 법제처 원문의 연혁에서 확인해 주세요.",
  future: "앞으로의 날짜는 그 전에 법이 바뀔 수 있어 확인해 드릴 수 없어요.",
  notYet: "위 조문은 아직 시행 전이에요. 시행일 전 조문은 법제처 원문의 연혁에서 확인해 주세요.",
} as const;

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
  const isCurrent = a.effectiveFrom === null || a.effectiveFrom <= today;
  // 그 날짜에도 이 조문이 시행 중이었다고 말할 수 있는 경우만: 지금 시행 중이고, 시행일 이후이며, 오늘 이전인 날짜
  const sameAtDate =
    asOf !== null &&
    isCurrent &&
    a.effectiveFrom !== null &&
    asOf >= a.effectiveFrom &&
    asOf <= today;
  const asOfNote =
    asOf === null || sameAtDate
      ? null
      : asOf > today
        ? AS_OF_NOTES.future
        : !isCurrent
          ? AS_OF_NOTES.notYet
          : AS_OF_NOTES.before;
  return {
    ...ref,
    articleTitle: a.title,
    body: a.text,
    // 시행일이 오늘 이후면 아직 시행 전인 조문이다
    isCurrent,
    ...(asOf !== null && {
      asOf,
      versionAtDate: sameAtDate ? ref : null,
      ...(asOfNote && { asOfNote }),
    }),
    notice: SEARCH_NOTICE,
  };
}
