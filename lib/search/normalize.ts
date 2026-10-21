// 법제처 응답 → 검색 타입 변환에 쓰는 순수 함수. 네트워크·korean-law-mcp에 의존하지 않는다 (단위 테스트 대상).

import { maskPii } from "@/lib/pii/detect";
import type { CitationCheck } from "./types";
import { caseNumbersIn } from "@/lib/citations/patterns";

const BR = /<br\s*\/?>/gi;
const TAG = /<[^>]+>/g;

export function stripHtml(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(BR, "\n")
    .replace(TAG, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/[ \t　]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text || null;
}

/** "20260409", "2026.04.09", "20260102120100" → "2026-04-09" */
export function isoDate(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  const [y, m, d] = [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)];
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? null : `${y}-${m}-${d}`;
}

/** 조문번호·가지번호("0003","02" / 3, 2) → "제3조의2" */
export function articleLabel(no: unknown, branch?: unknown): string | null {
  const n = Number.parseInt(String(no ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const b = Number.parseInt(String(branch ?? ""), 10);
  return Number.isFinite(b) && b > 0 ? `제${n}조의${b}` : `제${n}조`;
}

/** "제3조의2 제1항" → "제3조의2" (조 단위로 정규화) */
export function normalizeArticleNo(value: string): string | null {
  const m = value.replace(/\s+/g, "").match(/제(\d+)조(?:의(\d+))?/);
  return m ? articleLabel(m[1], m[2]) : null;
}

export const statuteKey = (lawName: string, articleNo: string) =>
  `law:${lawName.replace(/\s+/g, "")}:${articleNo}`;
export const caseKey = (caseNo: string) => `case:${caseNo.replace(/\s+/g, "")}`;

// 법제처 공개 주소. API 응답의 상세링크에는 인증키가 들어 있어 쓰지 않는다.
export const caseUrl = (id: string) =>
  `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${encodeURIComponent(id)}`;
export const statuteUrl = (lawName: string, articleNo: string) =>
  `https://www.law.go.kr/${encodeURIComponent("법령")}/${encodeURIComponent(lawName)}/${encodeURIComponent(articleNo)}`;

const asArray = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

function texts(value: unknown): string[] {
  if (typeof value === "string") {
    const t = stripHtml(value);
    return t ? [t] : [];
  }
  return Array.isArray(value) ? value.flatMap(texts) : [];
}

type Unit = Record<string, unknown>;

/** 법제처 조문단위 → 본문 (조문내용 + 항·호·목). 값이 문자열·배열·객체 어느 형태로 와도 받는다 */
export function articleBody(unit: Unit): string {
  const lines = texts(unit["조문내용"]);
  for (const hang of asArray(unit["항"]) as Unit[]) {
    lines.push(...texts(hang?.["항내용"]));
    for (const ho of asArray(hang?.["호"]) as Unit[]) {
      lines.push(...texts(ho?.["호내용"]));
      for (const mok of asArray(ho?.["목"]) as Unit[]) lines.push(...texts(mok?.["목내용"]));
    }
  }
  return lines.join("\n");
}

/** 법령 응답(JSON)의 조문 단위 목록. 장·절 제목(조문여부='전문')은 뺀다 */
export function articleUnits(json: unknown): Unit[] {
  const units = asArray((json as Unit)?.["법령"] && ((json as Unit)["법령"] as Unit)["조문"]);
  const list = units.flatMap((u) => asArray((u as Unit)?.["조문단위"])) as Unit[];
  return list.filter((u) => u["조문여부"] === "조문");
}

/** 조문 응답(JSON)에서 해당 조문 단위를 찾는다 */
export function findArticleUnit(json: unknown, articleNo: string): Unit | null {
  return (
    articleUnits(json).find((u) => articleLabel(u["조문번호"], u["조문가지번호"]) === articleNo) ??
    null
  );
}

/**
 * 법령 전문에서 키워드가 든 조문을 고른다 (프로토타입 findArticles와 같은 점수, DEC-014):
 * 키워드가 조문 제목에 있으면 3점, 본문에 있으면 2점. 점수 0은 버리고 높은 순으로 limit개.
 */
export function scoreArticles<T extends { title: string; text: string }>(
  articles: T[],
  keywords: string[],
  limit: number,
): T[] {
  return articles
    .map((a, i) => ({
      a,
      i,
      score: keywords.reduce(
        (n, k) => n + (a.text.includes(k) ? 2 : 0) + (a.title.includes(k) ? 3 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, limit)
    .map((x) => x.a);
}

const PARTY_HEADER =
  /^【\s*(원\s*고|피\s*고|피\s*고\s*인|신\s*청\s*인|피\s*신\s*청\s*인|청\s*구\s*인|상\s*고\s*인|피\s*상\s*고\s*인|항\s*소\s*인|피\s*항\s*소\s*인|변\s*호\s*인|검\s*사|소\s*송\s*대\s*리\s*인|원\s*심\s*판\s*결|제\s*1\s*심\s*판\s*결)[^】]*】/;

/**
 * 판례 본문 일부 (판시사항·요지가 없을 때만 근거로 씀, API.md 4.1 fromBody).
 * 당사자·대리인·원심 표시 줄을 떼고, 남은 부분도 개인정보를 가린다 (F-007). 반환값은 저장하지 않는다 (DEC-007).
 */
export function bodyExcerpt(body: unknown, maxChars = 1400): string | null {
  const text = stripHtml(body);
  if (!text) return null;
  const lines = text.split("\n");
  const reason = lines.findIndex((l) => /^【\s*이\s*유\s*】/.test(l));
  const kept = (reason >= 0 ? lines.slice(reason + 1) : lines).filter((l) => !PARTY_HEADER.test(l));
  const excerpt = kept.join("\n").slice(0, maxChars).trim();
  return excerpt ? maskPii(excerpt).maskedText : null;
}

const STATUTE_HEADER =
  /법령 인용 (\d+)건 \| ✓ (\d+) 실존 \| ✗ (\d+) 오류 \| ⌛ (\d+) 폐지 \| ⚠ (\d+) 확인필요/;

/** verify_citations 텍스트 결과(인용 1건 단위 호출) → 실존 여부. 라이브러리가 구조화 결과를 주지 않아 머리줄을 읽는다 */
export function parseStatuteVerify(citation: string, text: string): CitationCheck {
  if (text.includes("[NO_CITATIONS_FOUND]")) {
    return { citation, exists: null, note: "인용 형식을 인식하지 못함" };
  }
  const m = text.match(STATUTE_HEADER);
  if (!m) return { citation, exists: null, note: "재조회 결과를 해석하지 못함" };
  const [ok, bad, repealed, unsure] = [m[2], m[3], m[4], m[5]].map(Number);
  const detail = text
    .split("\n")
    .find((l) => /^[✗⌛⚠]\s/.test(l))
    ?.replace(/^[✗⌛⚠]\s*/, "")
    .slice(0, 120);
  if (bad > 0) return { citation, exists: false, note: detail ?? "조문 없음" };
  if (repealed > 0) return { citation, exists: false, note: detail ?? "폐지된 법령" };
  if (unsure > 0 || ok === 0) return { citation, exists: null, note: detail ?? "확인 필요" };
  return { citation, exists: true };
}

/** verifyCaseCitations의 결과 줄들에서 사건번호별 실존 여부를 고른다 */
export function parseCaseVerify(caseNo: string, lines: string[]): CitationCheck {
  const no = caseNo.replace(/\s+/g, "");
  // 부분 일치("2020다1234"가 "2020다12345" 줄에 맞는 것)를 막으려고 줄에서 사건번호를 뽑아 같은지 본다
  const line = lines.find((l) => caseNumbersIn(l).includes(no));
  if (!line) return { citation: caseNo, exists: null, note: "재조회 결과 없음" };
  if (line.startsWith("✓")) return { citation: caseNo, exists: true };
  const note = line.replace(/^[✓✗⚠]\s*/, "").slice(0, 120);
  return { citation: caseNo, exists: line.startsWith("✗") ? false : null, note };
}
