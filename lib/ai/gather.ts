// ② 1차 검색과 ③ 에이전트 도구 실행 — 법제처 근거를 EvidenceSet에 모은다 (DEC-009).
// 검색 방식·폭은 참고 프로토타입과 같다 (DEC-014): 법령은 법률 전문에서 키워드 점수로, 판례는 판례명+본문 검색.
// 검색어는 모두 safeQuery로 PII를 다시 검사한다. 판례는 판시사항·요지만 쓰고 전문은 담지 않는다 (DEC-007).
import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { EvidenceSet } from "@/lib/search/evidence";
import type { LawSource } from "@/lib/search/law-source";
import type { CaseHit } from "@/lib/search/types";
import {
  LIMITS,
  describeArticle,
  describeCase,
  safeQuery,
  uniqueQueries,
  type Intent,
  type SearchRecord,
} from "./policy";

/** 판례 목록에서 새 판례 상세(판시사항·요지)를 가져와 근거에 넣는다. 넣은 키를 돌려준다 */
async function addCaseDetails(source: LawSource, evidence: EvidenceSet, hits: CaseHit[]) {
  const detailed = await Promise.allSettled(hits.map((h) => source.getCase(h.id)));
  return detailed.map((r, i) =>
    evidence.addCase(r.status === "fulfilled" && r.value ? r.value : hits[i]),
  );
}

/**
 * ② 1차 검색 (프로토타입 3·4단계): 관련 법률(최대 2개)마다 조문 키워드 점수로 상위 3개(합계 5개) +
 * 판례 검색어(최대 3개)마다 6건 검색 → 중복 제거 후 상세 8건. 동시에 돌리고, 전부 실패하면 검색 실패 (F-006 AC2).
 * 키워드로 조문을 하나도 못 찾으면 목표 문장으로 지능형 법령 검색을 한 번 보조로 쓴다.
 */
export async function initialSearch(
  source: LawSource,
  intent: Intent,
  evidence: EvidenceSet,
): Promise<{ searches: SearchRecord[]; added: string[] }> {
  const laws = uniqueQueries(intent.laws, LIMITS.laws);
  const lawKeywords = uniqueQueries(intent.lawKeywords, LIMITS.lawKeywords);
  const precKeywords = uniqueQueries(intent.precKeywords, LIMITS.precKeywords);
  if (precKeywords.length === 0) {
    const fallback = safeQuery(intent.goal);
    if (fallback) precKeywords.push(fallback);
  }

  const lawTasks = laws.map((l) => source.findArticles(l, lawKeywords, LIMITS.articlesPerLaw));
  const caseTasks = precKeywords.map(async (q) => ({
    keyword: q,
    hits: await source.searchCases(q, LIMITS.searchPerQuery),
  }));
  const [lawResults, caseResults] = await Promise.all([
    Promise.allSettled(lawTasks),
    Promise.allSettled(caseTasks),
  ]);

  const all = [...lawResults, ...caseResults];
  if (all.length > 0 && all.every((r) => r.status === "rejected")) {
    throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "initial" });
  }

  const added: string[] = [];
  let articles = lawResults
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .slice(0, LIMITS.initialArticles);
  if (articles.length === 0) {
    const goal = safeQuery(intent.goal);
    if (goal) {
      articles = await source.searchArticles(goal, LIMITS.articlesPerLaw).catch(() => []);
    }
  }
  for (const a of articles) added.push(evidence.addArticle(a));

  // 판례: 검색어 순서대로 중복을 빼고 앞에서 8건만 상세 조회
  const seen = new Set<string>();
  const unique: CaseHit[] = [];
  for (const r of caseResults) {
    if (r.status !== "fulfilled") continue;
    for (const h of r.value.hits) {
      if (seen.has(h.id) || evidence.findCase(h.caseNo)) continue;
      seen.add(h.id);
      unique.push(h);
    }
  }
  added.push(...(await addCaseDetails(source, evidence, unique.slice(0, LIMITS.caseDetails))));

  const searches: SearchRecord[] = caseResults.flatMap((r) =>
    r.status === "fulfilled" ? [{ keyword: r.value.keyword, total: r.value.hits.length }] : [],
  );
  return { searches, added: [...new Set(added)] };
}

export type ToolOutcome = {
  tool: "law" | "precedent";
  query: string;
  added: string[];
  content: string;
  isError: boolean;
};

const field = (input: unknown, key: string): unknown =>
  input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;

/** ③ 에이전트 도구 1건 실행 (프로토타입 도구 2개). 결과 텍스트는 근거 키·식별정보·본문 앞부분만 */
export async function runTool(
  source: LawSource,
  evidence: EvidenceSet,
  name: string,
  input: unknown,
): Promise<ToolOutcome> {
  const before = new Set(evidence.list().map((i) => i.key));
  const isNew = (k: string) => !before.has(k);
  try {
    if (name === "search_law_articles") {
      const lawName = safeQuery(field(input, "lawName"));
      const raw = field(input, "keywords");
      const keywords = uniqueQueries(Array.isArray(raw) ? raw : [], LIMITS.lawKeywords);
      if (!lawName || keywords.length === 0) {
        return rejected("law", "법률 이름과 키워드가 필요합니다.");
      }
      const found = await source.findArticles(lawName, keywords, LIMITS.articlesPerLaw);
      const fresh = found.filter((a) => !evidence.findStatute(a.lawName, a.articleNo));
      const keys = fresh.map((a) => evidence.addArticle(a));
      const text = fresh.map((a) => describeArticle(a, LIMITS.toolResultChars)).join("\n\n");
      // 조각마다 검사했어도 합치면 개인정보 패턴이 될 수 있어 기록용 문자열을 한 번 더 본다 (F-007)
      const label = safeQuery(`${lawName} · ${keywords.join(" ")}`) ?? lawName;
      return done("law", label, keys.filter(isNew), text || "새로 찾은 조문 없음");
    }
    if (name === "search_precedents") {
      const q = safeQuery(field(input, "query"));
      if (!q) {
        return rejected(
          "precedent",
          "검색어가 비었거나 개인 정보가 있을 수 있어 검색하지 않았습니다.",
        );
      }
      const hits = await source.searchCases(q, LIMITS.searchPerQuery);
      const fresh = hits.filter((h) => !evidence.findCase(h.caseNo)).slice(0, LIMITS.agentNewCases);
      const keys = await addCaseDetails(source, evidence, fresh);
      const text = keys
        .map((k) => {
          const item = evidence.get(k);
          return item?.kind === "case" ? describeCase(k, item.ref, LIMITS.toolResultChars) : "";
        })
        .filter(Boolean)
        .join("\n\n");
      return done("precedent", q, keys.filter(isNew), text || "새로 찾은 판례 없음");
    }
    return rejected("law", "알 수 없는 도구입니다.");
  } catch {
    // 업스트림 오류 문구는 버린다 (질의가 섞일 수 있음)
    return {
      tool: name === "search_precedents" ? "precedent" : "law",
      query: "",
      added: [],
      content: "법제처 조회에 실패했습니다.",
      isError: true,
    };
  }
}

function done(
  tool: ToolOutcome["tool"],
  query: string,
  added: string[],
  content: string,
): ToolOutcome {
  return { tool, query, added, content, isError: false };
}

function rejected(tool: ToolOutcome["tool"], content: string): ToolOutcome {
  return { tool, query: "", added: [], content, isError: true };
}
