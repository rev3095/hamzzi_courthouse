// 조문 시점 비교·개정 이력 순수 규칙 (DEC-072 ⓔ). 두 날짜에 시행 중이던 같은 번호 조문을 법제처에서 가져와 줄 단위로 비교하고,
// 법제처 조문 개정 이력(lsJoHstInf)을 날짜·개정 구분·변경 사유 그대로 옮긴다. 개정의 영향·유불리는 판단하지 않는다 (절대 규칙 2).
import { ApiError } from "@/lib/api/errors";
import { AT_DATE_NOTES, diffLines, type DiffPart } from "./explore";
import { isoDate } from "./normalize";
import type { ArticleAtDate, LawVersion } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 달력에 있는 날짜인지 (2월 30일 같은 날은 아니다), 연도는 1948~2099 */
export function isRealDate(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m || Number(m[1]) < 1948 || Number(m[1]) > 2099) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD — 둘 다 있어야 하고 from < to */
export function parseCompareDates(params: URLSearchParams): { from: string; to: string } {
  const read = (field: "from" | "to") => {
    const v = params.get(field) ?? "";
    if (!isRealDate(v)) throw new ApiError("VALIDATION_ERROR", { field, format: "YYYY-MM-DD" });
    return v;
  };
  const from = read("from");
  const to = read("to");
  if (from >= to) throw new ApiError("VALIDATION_ERROR", { field: "to", reason: "not_after_from" });
  return { from, to };
}

export type CompareSide =
  | {
      date: string;
      found: true;
      lawName: string;
      articleNo: string;
      articleTitle: string;
      body: string;
      version: LawVersion;
    }
  | { date: string; found: false; note: string; version: LawVersion | null };

function side(date: string, at: ArticleAtDate | null): CompareSide {
  if (!at) return { date, found: false, note: AT_DATE_NOTES.unavailable, version: null };
  if (at.status === "not_in_force")
    return { date, found: false, note: AT_DATE_NOTES.notInForce, version: null };
  if (at.status === "no_article")
    return { date, found: false, note: AT_DATE_NOTES.noArticle, version: at.version };
  return {
    date,
    found: true,
    lawName: at.article.lawName,
    articleNo: at.article.articleNo,
    articleTitle: at.article.title,
    body: at.article.text,
    version: at.version,
  };
}

/** 두 날짜 조문 비교 응답. 둘 다 찾았을 때만 줄 비교(from → to)를 싣는다 */
export function compareResponse(
  from: { date: string; at: ArticleAtDate | null },
  to: { date: string; at: ArticleAtDate | null },
) {
  const a = side(from.date, from.at);
  const b = side(to.date, to.at);
  const diff: DiffPart[] | null = a.found && b.found ? diffLines(a.body, b.body) : null;
  return {
    from: a,
    to: b,
    diff,
    same: diff ? diff.every((d) => d.type === "same") : null,
    // 두 날짜가 같은 시행 버전이면 법제처 기준으로 같은 조문이다
    sameVersion: !!(a.version && b.version && a.version.mst === b.version.mst),
  };
}

export type ArticleRevision = {
  /** 이 개정이 들어간 법령 버전 (법령일련번호) */
  mst: string | null;
  promulgatedAt: string | null;
  effectiveFrom: string | null;
  /** 법제처 제개정구분명 (일부개정·전부개정·타법개정 …) */
  revisionType: string | null;
  /** 법제처 변경사유 (조문 단위: 조문개정·조문신설 …) */
  changeReason: string | null;
};

const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(block);
  return m?.[1].trim() || null;
};

/**
 * 법제처 조문 개정 이력 응답(lawSearch target=lsJoHstInf)을 개정 목록으로. 조문 시행일(없으면 법령 시행일) 내림차순,
 * 같은 버전·같은 시행일은 한 번만. 법제처 문구를 그대로 옮기고 해석하지 않는다
 */
export function articleRevisions(xml: string): ArticleRevision[] {
  const out: ArticleRevision[] = [];
  const seen = new Set<string>();
  for (const law of xml.matchAll(/<law(?:\s[^>]*)?>([\s\S]*?)<\/law>/g)) {
    const info = /<법령정보>([\s\S]*?)<\/법령정보>/.exec(law[1])?.[1] ?? law[1];
    const base = {
      mst: tag(info, "법령일련번호"),
      promulgatedAt: isoDate(tag(info, "공포일자")),
      lawEffective: isoDate(tag(info, "시행일자")),
      revisionType: tag(info, "제개정구분명"),
    };
    const jos = [...law[1].matchAll(/<jo(?:\s[^>]*)?>([\s\S]*?)<\/jo>/g)];
    for (const jo of jos.length > 0 ? jos : [[null, ""] as unknown as RegExpExecArray]) {
      const effectiveFrom = isoDate(tag(jo[1] ?? "", "조문시행일")) ?? base.lawEffective;
      const key = `${base.mst}|${effectiveFrom}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        mst: base.mst,
        promulgatedAt: base.promulgatedAt,
        effectiveFrom,
        revisionType: base.revisionType,
        changeReason: tag(jo[1] ?? "", "변경사유"),
      });
    }
  }
  return out.sort((x, y) => (y.effectiveFrom ?? "").localeCompare(x.effectiveFrom ?? ""));
}

/** 하루 전 날짜 (YYYY-MM-DD). 개정 이력에서 '이 개정 전후 비교'를 만들 때 쓴다 */
export function dayBefore(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
