// 무료 모드 분석 실행 (DEC-015). Claude를 부르지 않는다 — 법제처 Open API(무료)만 쓴다.
import "server-only";
import type { StepEvent } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import type { CitationRow, DemoAnalysisResult } from "@/lib/citations/policy";
import { createLawSource, type LawSource } from "@/lib/search/law-source";
import type { CaseHit } from "@/lib/search/types";
import {
  FREE_STEP_MESSAGES,
  caseQueriesFrom,
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
  deps: { lawSource?: LawSource; onStep?: (e: StepEvent) => void } = {},
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

  const source = deps.lawSource ?? createLawSource({ timeoutMs: 8_000 });
  deps.onStep?.({ stage: "search", message: FREE_STEP_MESSAGES.search });

  // ① 질문 문장으로 지능형 법령검색 (LLM 없이 자연어 → 조문)
  const sentence = searchSentence(maskedText);
  let articlesFailed = false;
  const articles = sentence
    ? await source.searchArticles(sentence, ARTICLES).catch(() => {
        articlesFailed = true;
        return [];
      })
    : [];

  // ② 찾은 조문 제목으로 판례 검색 → 중복 제거 → 상세
  const queries = caseQueriesFrom(articles);
  const caseResults = await Promise.allSettled(
    queries.map((q) => source.searchCases(q, CASES_PER_QUERY)),
  );
  if (articlesFailed && caseResults.every((r) => r.status === "rejected")) {
    throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "free_search" });
  }
  const seen = new Set<string>();
  const hits: CaseHit[] = [];
  for (const r of caseResults) {
    if (r.status !== "fulfilled") continue;
    for (const h of r.value) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      hits.push(h);
    }
  }
  const picked = hits.slice(0, CASE_DETAILS);
  const details = await Promise.allSettled(picked.map((h) => source.getCase(h.id)));
  const cases = picked.map((h, i) => {
    const d = details[i];
    return d.status === "fulfilled" && d.value ? d.value : h;
  });

  const searches = [
    ...(sentence ? [{ keyword: "질문 문장 (지능형 법령검색)", total: articles.length }] : []),
    ...queries.map((q, i) => {
      const r = caseResults[i];
      return { keyword: q, total: r.status === "fulfilled" ? r.value.length : 0 };
    }),
  ];
  deps.onStep?.({
    stage: "search",
    message: FREE_STEP_MESSAGES.search,
    added: [...articles.map((a) => a.id), ...cases.map((c) => `case:${c.caseNo}`)],
  });

  return {
    result: searchOnlyResult({ articles, cases, searches }),
    citations: [],
    stats: { total: 0, removed: 0 },
    model: "search_only",
  };
}
