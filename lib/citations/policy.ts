// 인용 검증 순수 규칙 (F-005 AC2, DEC-009). 법제처 재조회 결과를 받아 최종 결과를 조립한다.
// ① 출처가 그 요청의 근거인지 ② 인용 구절이 원문에 글자 그대로 있는지 ③ 출처·본문의 조문·사건번호가 실존하는지.
// ①·③ 실패(실존 미확인 포함)는 문단을 빼고, ②만 실패하면 "확인 필요"(quote_mismatch)로 표시한다.
import { citableKeys, type DemoDraft, type DraftPoint } from "@/lib/ai/policy";
import type { EvidenceSet } from "@/lib/search/evidence";
import type { CitationCheck } from "@/lib/search/types";
import { articlesIn, caseNumbersIn } from "./patterns";

export const QUOTE_MIN = 20;
export const QUOTE_MAX = 60;

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const compact = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

// ── ② 원문 구절 대조 ──────────────────────────────────────────

/** 구절이 20~60자이고 원문에 글자 그대로 있는가. NFKC·공백 차이만 무시한다 */
export function quoteMatches(quote: string, sourceText: string): boolean {
  const q = norm(quote);
  if (q.length < QUOTE_MIN || q.length > QUOTE_MAX) return false;
  return norm(sourceText).includes(q);
}

// ── ③ 재조회 대상 ─────────────────────────────────────────────

export type Claim = { kind: "statute" | "case"; citation: string };

/** 근거 키 → 재조회 문자열 ("주택임대차보호법 제3조의2" / "2020다12345"). 근거에 없으면 null */
export function claimForKey(key: string, evidence: EvidenceSet): Claim | null {
  const item = evidence.get(key);
  if (!item) return null;
  return item.kind === "statute"
    ? { kind: "statute", citation: `${item.ref.lawName} ${item.ref.articleNo}` }
    : { kind: "case", citation: compact(item.ref.caseNo) };
}

/** 법령명 꼴 낱말 (시행령·시행규칙 포함). 「」·괄호는 미리 벗긴다 */
const LAW_WORD_BEFORE = /([가-힣]{1,30}(?:법률|법)(?:\s?시행령|\s?시행규칙)?)$/;
const BRACKETS = /[「」『』"'“”‘’()（）\[\]<>《》〈〉]/g;

/**
 * 조문 바로 앞에 적힌 법령 이름을 정한다.
 * 1) 근거 조문의 법령명이 낱말 경계에 맞춰 바로 앞에 있으면 그것 ("민법"이 "난민법"에 붙지 않게, 공백 있는 법령명 대응)
 * 2) 없으면 "○○법"·"○○법 시행령" 꼴 낱말 (시행령·시행규칙은 항상 이쪽 — 근거 법령명보다 길다)
 * 3) 법령명 꼴 낱말이 아예 없을 때만, 번호가 같은 근거 조문이 하나면 그 법령
 */
function lawNameBefore(
  before: string,
  articleNo: string,
  statutes: { lawName: string; articleNo: string }[],
) {
  const clean = before.replace(BRACKETS, " ").replace(/\s+/g, " ").trimEnd();
  const word = clean.match(LAW_WORD_BEFORE)?.[1]?.replace(/\s+/g, " ");
  if (word && /(시행령|시행규칙)$/.test(word)) return word;
  const byEvidence = statutes
    .map((s) => s.lawName.normalize("NFKC").replace(/\s+/g, " "))
    .filter((name) => {
      if (!clean.endsWith(name)) return false;
      const prev = clean.slice(0, clean.length - name.length).slice(-1);
      return !/[가-힣]/.test(prev);
    })
    .sort((x, y) => y.length - x.length)[0];
  if (byEvidence) return byEvidence;
  if (word) return word;
  const sameNo = statutes.filter((s) => compact(s.articleNo) === articleNo);
  return sameNo.length === 1 ? sameNo[0].lawName : undefined;
}

/**
 * 본문에 적힌 조문·사건번호 → 재조회 문자열 (패턴은 P3 1차 거르기와 같은 lib/citations/patterns).
 * 법령을 정할 수 없는 조문은 unresolved로 돌려준다 (실존 미확인 → 문단 제거).
 */
export function claimsInText(
  text: string,
  evidence: EvidenceSet,
): { claims: Claim[]; unresolved: string[] } {
  const t = text.normalize("NFKC");
  const statutes = evidence.list().flatMap((i) => (i.kind === "statute" ? [i.ref] : []));
  const claims: Claim[] = caseNumbersIn(t).map((citation) => ({ kind: "case" as const, citation }));
  const unresolved: string[] = [];
  for (const a of articlesIn(t)) {
    const before = t.slice(Math.max(0, a.index - 40), a.index);
    const lawName = lawNameBefore(before, a.label, statutes);
    if (lawName) claims.push({ kind: "statute", citation: `${lawName} ${a.label}` });
    else unresolved.push(a.label);
  }
  return { claims, unresolved };
}

/** 재조회할 조문·사건번호를 종류별로 중복 없이 모은다 */
export function uniqueClaims(claims: Claim[]): { statutes: string[]; cases: string[] } {
  const statutes = new Set<string>();
  const cases = new Set<string>();
  for (const c of claims) (c.kind === "statute" ? statutes : cases).add(c.citation);
  return { statutes: [...statutes], cases: [...cases] };
}

// ── 결과 조립 ────────────────────────────────────────────────

export type CheckedPoint = DraftPoint & { check: "verified" | "quote_mismatch" };

/** API.md 4.1 DemoAnalysisResult */
export type DemoAnalysisResult = Omit<DemoDraft, "answer"> & {
  /** ai = 실제 Claude 분석(Pro), replay = 미리 만든 예시 분석 재생, search_only = 법제처 검색 전용 (DEC-015) */
  mode: "ai" | "replay" | "search_only";
  answer: { points: CheckedPoint[] };
  recheck: {
    ok: boolean;
    items: { citation: string; exists: boolean; note?: string }[];
    /** 검증·1차 거르기를 통과하지 못해 뺀 문단 수 (DEC-014). 뺀 문단 내용은 내보내지 않는다 */
    removed: number;
  };
};

export type PointRemoval = "not_in_evidence" | "not_confirmed";

/** DATA_MODEL result_citations 행 (데모 실시간 조회 인용). 판례 본문은 담지 않고 60자 이내 구절만 (DEC-007) */
export type CitationRow = {
  kind: "statute" | "case";
  claimedRef: string;
  status: "verified" | "unverified" | "removed";
  source: "law_open_api_live";
  sourceRef: string;
  quote: string | null;
};

export type VerifyStats = {
  /** P3 1차 거르기에서 빠진 문단을 포함한 전체 문단 수 */
  total: number;
  removed: number;
  quoteMismatch: number;
  removedBy: Record<PointRemoval | "screened", number>;
};

/**
 * 재조회 결과로 최종 결과를 만든다. 문단의 출처와 본문 인용이 모두 실존 확인(exists === true)돼야 남긴다.
 * 판정 불가(null)도 실존 미확인으로 보고 뺀다.
 */
export function assembleResult(input: {
  draft: DemoDraft;
  evidence: EvidenceSet;
  checks: Map<string, CitationCheck>;
  /** P3 screenPoints에서 이미 빠진 문단 수 (실패율 집계용) */
  screened?: number;
}): { result: DemoAnalysisResult; citations: CitationRow[]; stats: VerifyStats } {
  const { draft, evidence, checks } = input;
  const kept: CheckedPoint[] = [];
  const rows: CitationRow[] = [];
  const removedBy: VerifyStats["removedBy"] = {
    not_in_evidence: 0,
    not_confirmed: 0,
    screened: input.screened ?? 0,
  };
  let quoteMismatch = 0;
  const allowed = new Set(citableKeys(evidence));
  const confirmedCitations = new Set<string>();

  for (const p of draft.answer.points) {
    const sourceClaim = claimForKey(p.source, evidence);
    const kind = sourceClaim?.kind ?? (p.source.startsWith("case:") ? "case" : "statute");
    const row = (status: CitationRow["status"], quote: string | null): CitationRow => ({
      kind,
      claimedRef: sourceClaim?.citation ?? p.source,
      status,
      source: "law_open_api_live",
      sourceRef: p.source,
      quote,
    });

    if (!sourceClaim || !allowed.has(p.source)) {
      removedBy.not_in_evidence += 1;
      rows.push(row("removed", null));
      continue;
    }
    const inText = claimsInText(p.text, evidence);
    const confirmed =
      inText.unresolved.length === 0 &&
      [sourceClaim, ...inText.claims].every((c) => checks.get(c.citation)?.exists === true);
    if (!confirmed) {
      removedBy.not_confirmed += 1;
      rows.push(row("removed", null));
      continue;
    }
    for (const c of [sourceClaim, ...inText.claims]) confirmedCitations.add(c.citation);
    // 구절이 원문과 다르면 그 구절은 모델이 만든 문장이다 — 화면·DB에 내보내지 않고 "확인 필요"만 표시한다
    const quoteOk = quoteMatches(p.quote, evidence.sourceText(p.source));
    if (!quoteOk) quoteMismatch += 1;
    rows.push(row(quoteOk ? "verified" : "unverified", quoteOk ? norm(p.quote) : null));
    kept.push({
      ...p,
      quote: quoteOk ? norm(p.quote) : "",
      check: quoteOk ? "verified" : "quote_mismatch",
    });
  }

  const used = new Set(kept.map((p) => p.source));
  // 검증 탭에는 남은 문단이 쓴(실존이 확인된) 인용만 낸다. 확인되지 않은 조문·사건번호 문자열은 내보내지 않고 건수는 stats에 남긴다
  const items = [...confirmedCitations].map((citation) => ({ citation, exists: true }));
  const result: DemoAnalysisResult = {
    ...draft,
    outcome: kept.length > 0 ? "grounded" : "no_result_in_scope",
    answer: { points: kept },
    articles: draft.articles.map((a) => ({ ...a, used: used.has(a.id) })),
    cases: draft.cases.map((c) => {
      const key = evidence.findCase(c.caseNo)?.key;
      return { ...c, used: key ? used.has(key) : false };
    }),
    mode: "ai",
    recheck: {
      ok: removedBy.not_confirmed === 0,
      items,
      removed: removedBy.not_in_evidence + removedBy.not_confirmed + removedBy.screened,
    },
  };
  const removed = removedBy.not_in_evidence + removedBy.not_confirmed + removedBy.screened;
  return {
    result,
    citations: rows,
    stats: {
      total: draft.answer.points.length + removedBy.screened,
      removed,
      quoteMismatch,
      removedBy,
    },
  };
}
