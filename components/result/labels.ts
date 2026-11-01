// 결과 화면 표시 규칙 (순수 함수, 단위 테스트 대상). 사건번호·조문은 응답 값 그대로 쓰고 새로 만들지 않는다 (절대 규칙 1).
import type { DemoAnalysisResult } from "@/lib/citations/policy";

export type SourceRef = { label: string; url: string | null };

/** 근거 키("law:민법:제565조" / "case:2024다321973") → 화면 이름과 법제처 원문 주소. 응답에 없는 근거면 키를 그대로 */
export function sourceRef(
  key: string,
  r: Pick<DemoAnalysisResult, "articles" | "cases">,
): SourceRef {
  if (key.startsWith("case:")) {
    // 답변 근거 키는 사건번호, 재검색 키는 판례 일련번호일 수 있다
    const ref = key.slice("case:".length);
    const c = r.cases.find((x) => x.caseNo === ref || x.id === ref);
    return c ? { label: `${c.court} ${c.caseNo}`, url: c.sourceUrl } : { label: ref, url: null };
  }
  const a = r.articles.find((x) => x.id === key);
  if (a) return { label: `${a.lawName} ${a.articleNo}`, url: a.sourceUrl };
  return { label: key.replace(/^law:/, "").replace(/:/g, " "), url: null };
}

/** "2026-06-24" → "2026.06.24". 형식이 다르면 그대로 */
export function dotDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

/** 결과 머리 제목 (D+ "대여금 반환 사건으로 보여요"). 분야는 분석 결과 값 그대로, 괄호 설명은 뺀다 */
export function resultTitle(r: Pick<DemoAnalysisResult, "mode" | "outcome" | "intent">): string {
  if (r.mode === "search_only") return "법제처에서 찾은 법령·판례예요";
  const area = r.intent.area.split("(")[0].trim();
  return area ? `${area} 문제로 보여요` : "햄찌 판사가 정리했어요";
}

export const TRACE_TOOL: Record<string, string> = { law: "법령 검색", precedent: "판례 검색" };

export type ResultTab = "answer" | "articles" | "cases" | "verify";

/** 검색 전용(무료 모드 자유 질문)은 답변 문단이 없어 법령 탭부터 연다 */
export function firstTab(r: Pick<DemoAnalysisResult, "answer">): ResultTab {
  return r.answer.points.length > 0 ? "answer" : "articles";
}
