// ② 1차 검색과 ③ 에이전트 도구 실행 — 법제처 근거를 EvidenceSet에 모은다 (DEC-009).
// 검색어는 모두 safeQuery로 PII를 다시 검사한다. 판례는 판시사항·요지만 쓰고 전문은 담지 않는다 (DEC-007).
import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { EvidenceSet } from "@/lib/search/evidence";
import type { LawSource } from "@/lib/search/law-source";
import {
  LIMITS,
  describeArticle,
  describeCase,
  safeQuery,
  uniqueQueries,
  type Intent,
  type SearchRecord,
} from "./policy";

/** 판례 목록 → 상위 몇 건 상세(판시사항·요지)를 가져와 근거에 넣는다. 넣은 키를 돌려준다 */
async function addCases(source: LawSource, evidence: EvidenceSet, query: string, details: number) {
  const hits = await source.searchCases(query, LIMITS.searchPerQuery);
  const keys: string[] = [];
  const fresh = hits.filter((h) => !evidence.findCase(h.caseNo)).slice(0, details);
  const detailed = await Promise.allSettled(fresh.map((h) => source.getCase(h.id)));
  detailed.forEach((r, i) => {
    keys.push(evidence.addCase(r.status === "fulfilled" && r.value ? r.value : fresh[i]));
  });
  return { total: hits.length, keys };
}

/** ② 1차 검색: 조문 검색 + 지목된 조문 + 판례 검색을 동시에. 전부 실패하면 검색 실패 (F-006 AC2) */
export async function initialSearch(
  source: LawSource,
  intent: Intent,
  evidence: EvidenceSet,
): Promise<{ searches: SearchRecord[]; added: string[] }> {
  const keywords = uniqueQueries(intent.lawKeywords, LIMITS.keywords);
  if (keywords.length === 0) {
    const fallback = safeQuery(intent.goal);
    if (fallback) keywords.push(fallback);
  }
  const refs = intent.articleRefs
    .map((r) => ({ lawName: safeQuery(r.lawName), articleNo: safeQuery(r.articleNo) }))
    .filter((r): r is { lawName: string; articleNo: string } => !!r.lawName && !!r.articleNo)
    .slice(0, LIMITS.articleRefs);

  const articleTasks = keywords.map(async (q) => {
    const hits = await source.searchArticles(q, LIMITS.searchPerQuery);
    return { keyword: q, total: hits.length, keys: hits.map((a) => evidence.addArticle(a)) };
  });
  const refTasks = refs.map(async (r) => {
    const a = await source.getArticle(r.lawName, r.articleNo);
    return { keys: a ? [evidence.addArticle(a)] : [] };
  });
  // 판례 상세는 검색어 앞쪽부터 나눠 가져온다 (요청 수 제한)
  const perQuery = Math.max(1, Math.ceil(LIMITS.caseDetails / Math.max(1, keywords.length)));
  const caseTasks = keywords.map(async (q) => {
    const r = await addCases(source, evidence, q, perQuery);
    return { keyword: q, total: r.total, keys: r.keys };
  });

  const [articles, articleRefs, cases] = await Promise.all([
    Promise.allSettled(articleTasks),
    Promise.allSettled(refTasks),
    Promise.allSettled(caseTasks),
  ]);
  const all = [...articles, ...articleRefs, ...cases];
  if (all.length > 0 && all.every((r) => r.status === "rejected")) {
    throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "initial" });
  }

  const searches: SearchRecord[] = keywords.map((keyword) => {
    let total = 0;
    for (const r of [...articles, ...cases]) {
      if (r.status === "fulfilled" && r.value.keyword === keyword) total += r.value.total;
    }
    return { keyword, total };
  });
  const added = all.flatMap((r) => (r.status === "fulfilled" ? r.value.keys : []));
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

/** ③ 에이전트 도구 1건 실행. 결과 텍스트는 근거 키·식별정보·본문 앞부분만 */
export async function runTool(
  source: LawSource,
  evidence: EvidenceSet,
  name: string,
  input: unknown,
): Promise<ToolOutcome> {
  const before = new Set(evidence.list().map((i) => i.key));
  const isNew = (k: string) => !before.has(k);
  try {
    if (name === "search_law") {
      const q = safeQuery(field(input, "query"));
      if (!q)
        return rejected("law", "검색어가 비었거나 개인 정보가 있을 수 있어 검색하지 않았습니다.");
      const hits = await source.searchArticles(q, LIMITS.searchPerQuery);
      const keys = hits.map((a) => evidence.addArticle(a));
      const text = hits.map((a) => describeArticle(a, LIMITS.toolResultChars)).join("\n\n");
      return done("law", q, keys.filter(isNew), text || "결과 없음");
    }
    if (name === "get_article") {
      const lawName = safeQuery(field(input, "lawName"));
      const articleNo = safeQuery(field(input, "articleNo"));
      if (!lawName || !articleNo) return rejected("law", "법령 이름과 조문 번호가 필요합니다.");
      const a = await source.getArticle(lawName, articleNo);
      const query = `${lawName} ${articleNo}`;
      if (!a) return done("law", query, [], "해당 조문을 찾지 못했습니다.");
      const key = evidence.addArticle(a);
      return done("law", query, [key].filter(isNew), describeArticle(a, LIMITS.toolResultChars));
    }
    if (name === "search_precedent") {
      const q = safeQuery(field(input, "query"));
      if (!q)
        return rejected(
          "precedent",
          "검색어가 비었거나 개인 정보가 있을 수 있어 검색하지 않았습니다.",
        );
      const r = await addCases(source, evidence, q, 2);
      const text = r.keys
        .map((k) => {
          const item = evidence.get(k);
          return item?.kind === "case" ? describeCase(k, item.ref, LIMITS.toolResultChars) : "";
        })
        .filter(Boolean)
        .join("\n\n");
      return done("precedent", q, r.keys.filter(isNew), text || "새로 찾은 판례 없음");
    }
    return rejected("law", "알 수 없는 도구입니다.");
  } catch {
    // 업스트림 오류 문구는 버린다 (질의가 섞일 수 있음)
    return {
      tool: name === "search_precedent" ? "precedent" : "law",
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
