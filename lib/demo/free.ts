// 무료 모드 분석 실행 (DEC-015). Claude를 부르지 않는다 — 법제처 Open API(무료)만 쓴다.
import "server-only";
import type { StepEvent } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import type { CitationRow, DemoAnalysisResult } from "@/lib/citations/policy";
import { createLawSource, type LawSource, type LawExplorer } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail, CaseHit } from "@/lib/search/types";
import {
  FREE_STEP_MESSAGES,
  caseQueriesFrom,
  withCaseHint,
  findExample,
  replayCitations,
  replayResult,
  searchOnlyResult,
  searchSentence,
} from "./policy";

export type FreeAnalysis = {
  result: DemoAnalysisResult;
  citations: CitationRow[];
  stats: { total: number; removed: number };
  /** analysis_results.model — 실제로 모델을 부르지 않았음을 남긴다 */
  model: "replay" | "search_only";
};

const ARTICLES = 5;
const CASES_PER_QUERY = 6;
const CASE_DETAILS = 5;

export async function runFreeAnalysis(
  maskedText: string,
  deps: { lawSource?: LawSource; onStep?: (e: StepEvent) => void; caseHint?: string | null } = {},
): Promise<FreeAnalysis> {
  const example = findExample(maskedText);
  if (example) {
    deps.onStep?.({ stage: "answer", message: FREE_STEP_MESSAGES.replay });
    const result = replayResult(example);
    return {
      result,
      citations: replayCitations(result),
      stats: { total: result.answer.points.length, removed: 0 },
      model: "replay",
    };
  }

  const { articles, cases, searches } = await freeSearch(maskedText, deps);
  return {
    result: searchOnlyResult({ articles, cases, searches }),
    citations: [],
    stats: { total: 0, removed: 0 },
    model: "search_only",
  };
}

export type FreeSearch = {
  articles: ArticleHit[];
  cases: (CaseHit | CaseDetail)[];
  searches: { keyword: string; total: number }[];
};

/** LLM 없이 법제처만으로 근거를 찾는다 (무료). 무료 모드와 라이트 답변(DEC-020)이 같이 쓴다 */
export async function freeSearch(
  maskedText: string,
  deps: {
    lawSource?: LawSource;
    onStep?: (e: StepEvent) => void;
    caseHint?: string | null;
    /** 질문 해석 호출(DEC-033)이 법률 용어로 바꿔 쓴 검색 문장. 있으면 질문 문장 대신 쓴다 */
    lawQuery?: string | null;
    /** 질문 해석 호출이 뽑은 판례 검색어 */
    caseQueries?: string[];
  } = {},
): Promise<FreeSearch> {
  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  deps.onStep?.({ stage: "search", message: FREE_STEP_MESSAGES.search });

  // ① 질문 문장으로 지능형 법령검색 (LLM 없이 자연어 → 조문)
  // 질문 문장에 개인정보 모양이 남아 검색을 포기하는 경우에는 해석한 문장도 쓰지 않는다 (F-007)
  const asked = searchSentence(maskedText);
  const rewritten = asked && deps.lawQuery ? searchSentence(deps.lawQuery) : null;
  const sentence = rewritten ?? asked;
  let articlesFailed = false;
  const articles = sentence
    ? await source.searchArticles(sentence, ARTICLES).catch(() => {
        articlesFailed = true;
        return [];
      })
    : [];

  // ② 찾은 조문 제목으로 판례 검색 → 중복 제거 → 상세
  // 홈 카테고리(DEC-028)를 골랐으면 그 분야의 고정 판례 검색어를 먼저 쓴다
  const understood = deps.caseQueries ?? [];
  const queries = withCaseHint(caseQueriesFrom(articles), deps.caseHint, 3, understood);
  const caseResults = await Promise.allSettled(
    queries.map((q) => source.searchCases(q, CASES_PER_QUERY)),
  );
  if (articlesFailed && caseResults.every((r) => r.status === "rejected")) {
    throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "free_search" });
  }
  const seen = new Set<string>();
  const hits: CaseHit[] = [];
  const lists = caseResults.map((r) => (r.status === "fulfilled" ? r.value : []));
  // 카테고리 검색어가 있으면 검색어마다 번갈아 고른다 — 한 검색어 결과가 상세 조회 자리를 다 차지하지 않게
  const ordered = deps.caseHint || understood.length > 0 ? interleave(lists) : lists.flat();
  for (const h of ordered) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    hits.push(h);
  }
  // ③ 키워드 검색 판례가 모자라면 찾은 조문이 본문에 나오는 판례로 채운다 (DEC-029 탐색 확장, 조문 2개까지만 추가 조회)
  const citing: { keyword: string; total: number }[] = [];
  const explorer = source as Partial<LawExplorer>;
  if (hits.length < CASE_DETAILS && explorer.casesCiting) {
    const targets = articles.slice(0, 2);
    const extra = await Promise.allSettled(
      targets.map((a) => explorer.casesCiting!(a.lawName, a.articleNo, CASE_DETAILS)),
    );
    extra.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const list = r.value;
      citing.push({
        keyword: `${targets[i].lawName} ${targets[i].articleNo} (조문이 나오는 판례)`,
        total: list.length,
      });
      for (const h of list) {
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        hits.push(h);
      }
    });
  }
  const picked = hits.slice(0, CASE_DETAILS);
  const details = await Promise.allSettled(picked.map((h) => source.getCase(h.id)));
  const cases = picked.map((h, i) => {
    const d = details[i];
    return d.status === "fulfilled" && d.value ? d.value : h;
  });

  const searches = [
    // 모델이 바꿔 쓴 문장 자체는 결과에 싣지 않는다 — 고정 문구만 (화면·DB에 질문 의역문을 남기지 않기)
    ...(sentence
      ? [
          {
            keyword: rewritten
              ? "질문을 법률 용어로 바꾼 문장 (지능형 법령검색)"
              : "질문 문장 (지능형 법령검색)",
            total: articles.length,
          },
        ]
      : []),
    ...queries.map((q, i) => {
      const r = caseResults[i];
      return { keyword: q, total: r.status === "fulfilled" ? r.value.length : 0 };
    }),
    ...citing,
  ];
  deps.onStep?.({
    stage: "search",
    message: FREE_STEP_MESSAGES.search,
    added: [...articles.map((a) => a.id), ...cases.map((c) => `case:${c.caseNo}`)],
  });
  return { articles, cases, searches };
}

/** [[a1,a2],[b1]] → [a1,b1,a2] */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}
