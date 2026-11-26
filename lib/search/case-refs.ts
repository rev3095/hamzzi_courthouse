// 판례 상세 보강 순수 규칙 (개선안 B): 참조판례 읽기 · 인용 표기 형식. 법제처가 준 글자만 쓰고 새로 만들지 않는다.
// 관련도·유불리 판단 없음 (PRD 8.3, 절대 규칙 2). 판례 전문은 쓰지 않는다 (DEC-007).
import { caseNumbersIn } from "@/lib/citations/patterns";

export type CitedCase = {
  /** 법제처 참조판례 원문의 한 토막 (예: "대법원 2010. 1. 28. 선고 2009다12345 판결") */
  label: string;
  /** 그 토막에서 읽은 사건번호 — 이 번호로 법제처에서 다시 찾는다 */
  caseNo: string;
};

/**
 * 법제처 판례의 참조판례 원문("[1] 대법원 2010. 1. 28. 선고 2009다12345 판결(공2010상, 401), 대법원 … / [2] …")에서
 * 사건번호가 든 토막만 뽑는다. 같은 사건번호는 한 번만, 자기 자신은 뺀다. 최대 max개
 */
export function citedCasesFrom(
  raw: string | null | undefined,
  selfCaseNo = "",
  max = 12,
): CitedCase[] {
  if (!raw) return [];
  const self = selfCaseNo.replace(/\s+/g, "");
  const seen = new Set<string>();
  const out: CitedCase[] = [];
  // 공보 표기 "(공2010상, 401)" 안의 쉼표에서 자르지 않도록 괄호 안 쉼표를 먼저 다른 글자로 바꾼다
  const text = raw.normalize("NFKC").replace(/\([^)]*\)/g, (m) => m.replace(/,/g, "·"));
  for (const part of text.split(/\[\d+\]|\/|,|\n/)) {
    const label = part
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!label) continue;
    for (const no of caseNumbersIn(label)) {
      if (no === self || seen.has(no)) continue;
      seen.add(no);
      out.push({ label: label.length > 60 ? `${label.slice(0, 59)}…` : label, caseNo: no });
      if (out.length >= max) return out;
    }
  }
  return out;
}

export type CitationStyle = "standard" | "short" | "withName";
export const CITATION_STYLES: { style: CitationStyle; label: string }[] = [
  { style: "standard", label: "기본" },
  { style: "short", label: "짧게" },
  { style: "withName", label: "사건명 포함" },
];

/**
 * 판례 인용 표기. 법제처가 준 법원·선고일·사건번호·판결유형·사건명을 정해진 순서로 잇기만 한다.
 * - 기본: 대법원 2021. 3. 11. 선고 2020다12345 판결
 * - 짧게: 대법원 2020다12345
 * - 사건명 포함: 대법원 2021. 3. 11. 선고 2020다12345 판결 (임대차보증금반환)
 */
export function caseCitation(
  c: {
    court: string | null;
    decidedAt: string | null;
    caseNo: string | null;
    caseName?: string | null;
    decisionType?: string | null;
  },
  style: CitationStyle,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.decidedAt ?? "");
  const date = m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}. 선고` : null;
  const type = c.decisionType?.trim() || null;
  if (style === "short") return [c.court, c.caseNo].filter(Boolean).join(" ");
  const head = [c.court, date, c.caseNo, type].filter(Boolean).join(" ");
  if (style === "withName" && c.caseName?.trim()) return `${head} (${c.caseName.trim()})`;
  return head;
}
