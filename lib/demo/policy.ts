// 무료 모드 순수 규칙 (DEC-015). Claude를 부르지 않는다 — 운영자 비용 0원.
// - 예시 질문: 미리 만들어 검증까지 마친 분석을 그대로 재생 (examples.json, P9 평가 결과에서 검증 통과분만)
// - 자유 질문: 법제처 검색(무료) 결과만 보여 준다. AI 답변 문단은 없다
import { AI_NOTICE } from "@/lib/api/respond";
import type { CitationRow, DemoAnalysisResult } from "@/lib/citations/policy";
import { scanInput } from "@/lib/pii";
import type { ArticleHit, CaseDetail, CaseHit } from "@/lib/search/types";
import data from "./examples.json";

export const FREE_PROMPT_VERSION = "free-2026-10-22";

export const FREE_STEP_MESSAGES = {
  replay: "미리 분석해 둔 예시 답변을 불러오고 있어요",
  search: "무료 모드: 법제처에서 관련 법령·판례를 찾고 있어요",
} as const;

export const SEARCH_ONLY_NOTE =
  "무료 모드에서는 AI 답변 없이, 국가법령정보센터(법제처)에서 이 질문으로 찾은 현행 법령 조문과 판례 목록만 보여 드립니다. 질문과 관련이 없는 항목이 섞일 수 있으니 원문을 확인해 주세요.";

export const REPLAY_NOTE =
  "미리 분석해 둔 예시 질문의 답변입니다. 국가법령정보센터(법제처)에서 찾은 현행 법령 조문과 판례만 근거로 썼고, 인용은 법제처 재조회로 확인했습니다.";

export type DemoExample = {
  id: string;
  tags: string[];
  question: string;
  result: DemoAnalysisResult;
};

const EXAMPLES = (data as { examples: DemoExample[] }).examples;

// 예시 피드 분야 이름. 평가용 태그("함정" 등)는 화면에 보이지 않게 분석 결과의 분야로 바꾼다
const AREA_LABEL: Record<string, string> = { 임금: "노동", 이웃분쟁: "이웃 분쟁" };

/** 예시 피드(S-01)에 보일 분야 */
export function exampleArea(e: Pick<DemoExample, "tags" | "result">): string {
  const tag =
    e.tags[0] && e.tags[0] !== "함정" ? e.tags[0] : e.result.intent.area.split(/[\s(·]/)[0];
  return AREA_LABEL[tag] ?? tag;
}

/** 화면(P6) 예시 질문 목록 — 직접 작성한 질문이다 (DEC-012) */
export function demoExamples(): { id: string; tags: string[]; question: string; area: string }[] {
  return EXAMPLES.map((e) => ({
    id: e.id,
    tags: e.tags,
    question: e.question,
    area: exampleArea(e),
  }));
}

const normalize = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

/** 질문이 예시 질문과 같으면(공백·전각 차이 무시) 그 예시. 아니면 null */
export function findExample(maskedText: string): DemoExample | null {
  const q = normalize(maskedText);
  return EXAMPLES.find((e) => normalize(e.question) === q) ?? null;
}

/** 재생 결과 — 저장된 분석에 무료 모드 표시와 안내만 바꿔 붙인다 */
export function replayResult(example: DemoExample): DemoAnalysisResult {
  return { ...example.result, mode: "replay", aiNotice: AI_NOTICE, searchScopeNote: REPLAY_NOTE };
}

/** 재생 결과의 인용 행 (result_citations). 판례 본문은 없고 60자 이내 구절만 (DEC-007) */
export function replayCitations(result: DemoAnalysisResult): CitationRow[] {
  return result.answer.points.map((p) => {
    const isCase = p.source.startsWith("case:");
    const claimedRef = isCase
      ? p.source.slice("case:".length)
      : p.source.replace(/^law:/, "").replace(/:/g, " ");
    const verified = p.check === "verified";
    return {
      kind: isCase ? "case" : "statute",
      claimedRef,
      status: verified ? "verified" : "unverified",
      source: "law_open_api_live",
      sourceRef: p.source,
      quote: verified && p.quote.length <= 60 ? p.quote : null,
    };
  });
}

/**
 * 법제처 검색에 보낼 질문 문장. 마스킹 표시([이름1] 등)를 빼고, 남은 문장에 개인정보 가능성이 있으면 보내지 않는다 (F-007).
 * 지능형 법령검색은 자연어를 받으므로 LLM 없이 질문 문장을 그대로 쓴다.
 */
export function searchSentence(maskedText: string, maxChars = 200): string | null {
  const full = maskedText
    .normalize("NFKC")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 자르기 전에 전체 문장을 검사한다 — 자른 자리에 걸린 개인정보 조각이 패턴을 피하지 않게
  if (scanInput(full).findings.length > 0) return null;
  const t = full.slice(0, maxChars);
  if (t.length < 5) return null;
  return scanInput(t).findings.length > 0 ? null : t;
}

/** 판례 검색어: 찾은 조문의 제목(법률 용어)을 쓴다. 중복 없이 최대 max개 */
export function caseQueriesFrom(articles: ArticleHit[], max = 2): string[] {
  const out: string[] = [];
  for (const a of articles) {
    const t = a.title.trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** 검색 전용 결과 (API.md 4.1 형식, mode=search_only, 답변 문단 없음) */
export function searchOnlyResult(input: {
  articles: ArticleHit[];
  cases: (CaseHit | CaseDetail)[];
  searches: { keyword: string; total: number }[];
}): DemoAnalysisResult {
  const laws = [...new Set(input.articles.map((a) => a.lawName))];
  const found = input.articles.length + input.cases.length > 0;
  return {
    mode: "search_only",
    outcome: found ? "grounded" : "no_result_in_scope",
    aiNotice: AI_NOTICE,
    intent: { area: "", goal: "", laws, lawKeywords: input.searches.map((s) => s.keyword) },
    answer: { points: [] },
    articles: input.articles.map((a) => ({
      id: a.id,
      lawName: a.lawName,
      articleNo: a.articleNo,
      title: a.title,
      effectiveFrom: a.effectiveFrom,
      sourceUrl: a.sourceUrl,
      used: false,
    })),
    cases: input.cases.map((c) => ({
      id: c.id,
      caseNo: c.caseNo,
      caseName: c.caseName,
      court: c.court,
      decidedAt: c.decidedAt,
      sourceUrl: c.sourceUrl,
      fromBody: "fromBody" in c ? c.fromBody : false,
      used: false,
    })),
    searches: input.searches,
    trace: [],
    recheck: { ok: true, items: [], removed: 0 },
    searchScopeNote: SEARCH_ONLY_NOTE,
  };
}
