import "server-only";

// korean-law-mcp 어댑터 (DEC-009, ARCHITECTURE 4.2). 서비스 코드에서 korean-law-mcp를 import하는 곳은 이 파일 하나뿐이다.
// MCP 서버를 띄우지 않고 라이브러리 함수를 서버에서 직접 호출한다. 반환은 lib/search/types의 우리 타입만 쓴다.
// - 인증키: OPEN_LAW_API_KEY (서버 환경변수). 키·요청 URL·라이브러리 오류 문구는 응답·로그에 넘기지 않는다.
// - 판례 전문은 반환·저장하지 않는다. 요지가 없을 때만 가린 본문 일부를 쓴다 (DEC-007, F-007).
// - 국세법령정보시스템 출처 판례(법원명 없음, 본문 HTML 전용)는 제외한다 (DEC-008).

import { LawApiClient } from "korean-law-mcp/lib/api-client";
import { verifyCaseCitations } from "korean-law-mcp/lib/case-citation";
import { fetchLawVersions, versionInForce } from "korean-law-mcp/lib/law-lineage";
import { buildJO } from "korean-law-mcp/lib/law-parser";
import { findLaws, resolvedLawMatches } from "korean-law-mcp/lib/law-search";
import { parseThreeTierDelegation } from "korean-law-mcp/lib/three-tier-parser";
import { collectAnnexList } from "korean-law-mcp/tools/annex-list";
import { searchAiLawStructured } from "korean-law-mcp/tools/life-law";
import { searchPrecedentsStructured } from "korean-law-mcp/tools/precedent-search-core";
import { getPrecedentRecord } from "korean-law-mcp/tools/precedents";
import { verifyCitations } from "korean-law-mcp/tools/verify-citations";
import { ApiError } from "@/lib/api/errors";
import { caseNumbersIn } from "@/lib/citations/patterns";
import { required } from "@/lib/supabase/env";
import {
  articleBody,
  articleLabel,
  articleUnits,
  bodyExcerpt,
  caseUrl,
  findArticleUnit,
  isoDate,
  normalizeArticleNo,
  parseCaseVerify,
  parseStatuteVerify,
  scoreArticles,
  statuteKey,
  statuteUrl,
  stripHtml,
} from "./normalize";
import {
  DECISION_DOMAINS,
  adminRuleHits,
  annexRefs,
  decisionDetail,
  decisionHit,
  decisionRows,
  lawNameByAbbreviation,
  lawVersion,
  ordinanceDetail,
  ordinanceHits,
  ordinanceLinks,
  parseOldNew,
  threeTier,
} from "./explore";
import type {
  AdminRuleHit,
  AnnexRef,
  ArticleAtDate,
  ArticleHit,
  CaseDetail,
  CaseHit,
  CitationCheck,
  DecisionDetail,
  DecisionDomain,
  DecisionHit,
  LawVersion,
  OldNewCompare,
  OrdinanceDetail,
  OrdinanceHit,
  OrdinanceLink,
  ThreeTier,
} from "./types";

export type LawSource = {
  /** 자연어 → 관련 조문 (지능형 법령정보지식베이스) */
  searchArticles(query: string, limit?: number): Promise<ArticleHit[]>;
  /** 법령 전문에서 키워드 점수(제목 3·본문 2)로 조문 고르기 (프로토타입 방식, DEC-014). 법령이 없으면 [] */
  findArticles(lawName: string, keywords: string[], limit?: number): Promise<ArticleHit[]>;
  /** 법령명 + 조문번호로 조문 1개. 없으면 null */
  getArticle(lawName: string, articleNo: string): Promise<ArticleHit | null>;
  searchCases(query: string, limit?: number): Promise<CaseHit[]>;
  /** 판례 상세. 없거나 제외 대상이면 null */
  getCase(id: string): Promise<CaseDetail | null>;
  /** 조문 인용 실존 재조회 (F-005 AC2 ③). 입력 순서대로 반환 */
  verifyStatutes(citations: string[]): Promise<CitationCheck[]>;
  /** 사건번호 실존 재조회 (F-005 AC2 ③). 입력 순서대로 반환 */
  verifyCases(caseNos: string[]): Promise<CitationCheck[]>;
};

/** 탐색 확장 (DEC-029 제안). 모두 법제처 실시간 조회이고 저장하지 않는다 */
export type LawExplorer = {
  /** 조문을 본문에서 언급한 판례 ("법령명 제N조" 본문 검색). 느슨한 대체 검색은 하지 않는다 */
  casesCiting(lawName: string, articleNo: string, limit?: number): Promise<CaseHit[]>;
  searchDecisions(domain: DecisionDomain, query: string, limit?: number): Promise<DecisionHit[]>;
  getDecision(domain: DecisionDomain, id: string): Promise<DecisionDetail | null>;
  /** 법령의 시행 버전 목록 (시행일 내림차순). 법령이 없으면 null */
  listVersions(lawName: string): Promise<{ lawName: string; versions: LawVersion[] } | null>;
  /** 그 날짜(YYYY-MM-DD)에 시행 중이던 조문. 법령이 없으면 null */
  getArticleAt(lawName: string, articleNo: string, asOf: string): Promise<ArticleAtDate | null>;
  /** 신구조문 대조. mst를 주면 그 버전과 직전 버전, 없으면 현행과 직전. 법령이 없거나 다른 법령의 mst면 null */
  compareOldNew(lawName: string, mst?: string): Promise<OldNewCompare | null>;
  /** 법률 → 시행령 → 시행규칙 위임조문 3단비교 */
  getThreeTier(lawName: string): Promise<ThreeTier | null>;
  listAnnexes(lawName: string): Promise<{ lawName: string; items: AnnexRef[] } | null>;
  /** 법령 전체 조문 (위임 문구 대조용) */
  getLawArticles(lawName: string): Promise<{ lawName: string; articles: ArticleHit[] } | null>;
  /** 이 법령과 그 시행령·시행규칙 조문에 연계된 자치법규 조문 */
  linkedOrdinances(lawName: string, limit?: number): Promise<OrdinanceLink[]>;
  searchOrdinances(query: string, limit?: number): Promise<OrdinanceHit[]>;
  getOrdinance(id: string): Promise<OrdinanceDetail | null>;
  searchAdminRules(query: string, limit?: number): Promise<AdminRuleHit[]>;
};

export type LawSourceOptions = {
  apiKey?: string;
  /** 호출 1건 시간 한도. 데모 분석 전체 p95 ≤ 60초(DEC-013) 안에 들도록 짧게 둔다 */
  timeoutMs?: number;
  /** 재조회 동시 실행 수 (법제처 트래픽 제한 고려) */
  concurrency?: number;
};

const MAX_VERIFY = 20;

export function createLawSource(options: LawSourceOptions = {}): LawSource & LawExplorer {
  const apiKey = options.apiKey ?? required("OPEN_LAW_API_KEY", process.env.OPEN_LAW_API_KEY);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const concurrency = options.concurrency ?? 3;
  const client = new LawApiClient({ apiKey });

  /** 업스트림 실패를 표준 에러로 바꾼다. 라이브러리 오류 문구에는 질의·URL이 섞일 수 있어 버린다 */
  async function call<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new ApiError("SEARCH_UPSTREAM_FAILED", { stage, reason: "timeout" })),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([fn(), timeout]);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage });
    } finally {
      clearTimeout(timer);
    }
  }

  async function mapLimited<I, O>(items: I[], fn: (item: I) => Promise<O>): Promise<O[]> {
    const out: O[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return out;
  }

  const toArticle = (
    lawName: string,
    articleNo: string,
    title: string,
    text: string,
    date: unknown,
  ): ArticleHit => ({
    id: statuteKey(lawName, articleNo),
    lawName,
    articleNo,
    title,
    text,
    effectiveFrom: isoDate(date),
    sourceUrl: statuteUrl(lawName, articleNo),
  });

  const parse = (stage: string, raw: string): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage, reason: "parse" });
    }
  };

  async function resolveLaw(lawName: string) {
    if (!lawName.trim()) return null;
    const laws = await call("law", () => findLaws(client, lawName));
    const byName = laws.find((l) => resolvedLawMatches(lawName, l.lawName));
    if (byName || laws.length === 0) return byName ?? null;
    // 법제처 공식 약칭("주택임대차법")은 검색에는 걸리지만 이름 대조에서 빠진다 — 검색 응답의 약칭과 같을 때만 받는다
    const xml = await call("law", () => client.searchLaw(lawName, undefined, 20));
    const official = lawNameByAbbreviation(xml, lawName);
    return (official && laws.find((l) => l.lawName === official)) || null;
  }

  const unitsToArticles = (json: unknown, lawName: string, fallbackDate: unknown): ArticleHit[] =>
    articleUnits(json).flatMap((u) => {
      const no = articleLabel(u["조문번호"], u["조문가지번호"]);
      const text = articleBody(u);
      if (!no || !text) return [];
      const title = typeof u["조문제목"] === "string" ? u["조문제목"] : "";
      return [toArticle(lawName, no, title, text, u["조문시행일자"] ?? fallbackDate)];
    });

  const toCaseHits = (
    hits: { id: string; title: string; caseNumber?: string; court?: string; date?: string }[],
    limit: number,
  ): CaseHit[] =>
    hits
      .filter((h) => h.court && h.caseNumber)
      .slice(0, limit)
      .map((h) => ({
        id: h.id,
        caseNo: h.caseNumber!,
        caseName: h.title,
        court: h.court!,
        decidedAt: isoDate(h.date),
        sourceUrl: caseUrl(h.id),
      }));

  return {
    async casesCiting(lawName, articleNo, limit = 6) {
      const no = normalizeArticleNo(articleNo);
      if (!no || !lawName.trim()) return [];
      const res = await call("cases", () =>
        searchPrecedentsStructured(
          client,
          { query: `${lawName} ${no}`, search: 2, display: Math.min(limit * 2, 50), page: 1 },
          { fallbackPolicy: "none" },
        ),
      );
      return toCaseHits(res.hits, limit);
    },

    async searchDecisions(domain, query, limit = 10) {
      const xml = await call("decisions", () =>
        client.fetchApi({
          endpoint: "lawSearch.do",
          target: DECISION_DOMAINS[domain].target,
          extraParams: { query, display: String(Math.min(limit, 50)), page: "1" },
        }),
      );
      return decisionRows(xml)
        .flatMap((row) => decisionHit(domain, row) ?? [])
        .slice(0, limit);
    },

    async getDecision(domain, id) {
      if (!DECISION_DOMAINS[domain].hasDetail) return null;
      const raw = await call("decision", () =>
        client.fetchApi({
          endpoint: "lawService.do",
          target: DECISION_DOMAINS[domain].target,
          type: "JSON",
          extraParams: { ID: id },
        }),
      );
      return decisionDetail(domain, id, parse("decision", raw));
    },

    async listVersions(lawName) {
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const res = await call("versions", () =>
        fetchLawVersions(client, law.lawName, undefined, law.lawId),
      );
      return {
        lawName: law.lawName,
        versions: res.versions.filter((v) => !v.priorLaw).map(lawVersion),
      };
    },

    async getArticleAt(lawName, articleNo, asOf) {
      const no = normalizeArticleNo(articleNo);
      const ymd = asOf.replace(/\D/g, "");
      if (!no || ymd.length !== 8) return null;
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const res = await call("versions", () =>
        fetchLawVersions(client, law.lawName, undefined, law.lawId, ymd),
      );
      const v = versionInForce(res.versions, ymd);
      if (!v) return { status: "not_in_force" };
      const version = lawVersion(v);
      const raw = await call("article_at", () =>
        client.getLawText({ mst: v.mst, jo: buildJO(no), efYd: v.efYd }),
      );
      const unit = findArticleUnit(parse("article_at", raw), no);
      const text = unit ? articleBody(unit) : "";
      if (!unit || !text) return { status: "no_article", version };
      const title = typeof unit["조문제목"] === "string" ? unit["조문제목"] : "";
      return {
        status: "found",
        version,
        article: toArticle(
          version.lawName || law.lawName,
          no,
          title,
          text,
          unit["조문시행일자"] ?? v.efYd,
        ),
      };
    },

    async compareOldNew(lawName, mst) {
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const xml = await call("old_new", () => client.compareOldNew({ mst: mst ?? law.mst }));
      // 다른 법령의 일련번호를 넣어도 그 법령의 대조표가 오므로 법령ID로 막는다
      const ids = [...xml.matchAll(/<법령ID>\s*(\d+)\s*<\/법령ID>/g)].map((m) => m[1]);
      if (ids.length > 0 && !ids.includes(law.lawId)) return null;
      return parseOldNew(xml, law.lawName);
    },

    async getThreeTier(lawName) {
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const raw = await call("three_tier", () => client.getThreeTier({ mst: law.mst, knd: "2" }));
      return threeTier(parseThreeTierDelegation(parse("three_tier", raw)), law.lawName);
    },

    async listAnnexes(lawName) {
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const res = await call("annexes", () => collectAnnexList(client, { lawName: law.lawName }));
      return {
        lawName: law.lawName,
        items: annexRefs(res.list as Record<string, unknown>[], law.lawName),
      };
    },

    async getLawArticles(lawName) {
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const raw = await call("law_text", () => client.getLawText({ mst: law.mst }));
      return {
        lawName: law.lawName,
        articles: unitsToArticles(parse("law_text", raw), law.lawName, law.effectiveDate),
      };
    },

    async linkedOrdinances(lawName, limit = 50) {
      const xml = await call("linkage", () =>
        client.fetchApi({
          endpoint: "lawSearch.do",
          target: "lnkLsOrdJo",
          extraParams: { query: lawName, display: String(Math.min(limit, 100)), page: "1" },
        }),
      );
      const base = lawName.replace(/\s+/g, "");
      // 법제처는 이름 부분 일치로 찾으므로 이 법령과 그 시행령·시행규칙만 남긴다
      return ordinanceLinks(xml).filter((l) => {
        const n = l.lawName.replace(/\s+/g, "");
        return n === base || n === `${base}시행령` || n === `${base}시행규칙`;
      });
    },

    async searchOrdinances(query, limit = 20) {
      const xml = await call("ordinances", () =>
        client.searchOrdinance({ query, display: Math.min(limit, 100) }),
      );
      return ordinanceHits(xml).slice(0, limit);
    },

    async getOrdinance(id) {
      const raw = await call("ordinance", () => client.getOrdinance(id));
      return ordinanceDetail(id, parse("ordinance", raw));
    },

    async searchAdminRules(query, limit = 20) {
      const xml = await call("admin_rules", () =>
        client.searchAdminRule({ query, display: Math.min(limit * 2, 100), page: 1 }),
      );
      return adminRuleHits(xml).slice(0, limit);
    },

    async searchArticles(query, limit = 5) {
      const res = await call("articles", () =>
        searchAiLawStructured(client, { query, search: "0", display: limit, page: 1 }),
      );
      const out: ArticleHit[] = [];
      for (const s of res.articleSignals) {
        const no = articleLabel(s.articleNo, s.articleBranchNo);
        const text = stripHtml(s.articleContent);
        if (!no || !text || !s.lawName) continue;
        out.push(toArticle(s.lawName, no, s.articleTitle ?? "", text, s.effectiveDate));
      }
      return out;
    },

    async findArticles(lawName, keywords, limit = 3) {
      const words = keywords.map((k) => k.trim()).filter(Boolean);
      if (!lawName.trim() || words.length === 0) return [];
      const law = await resolveLaw(lawName);
      if (!law) return [];
      const raw = await call("law_text", () => client.getLawText({ mst: law.mst }));
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "law_text", reason: "parse" });
      }
      const all = articleUnits(json).flatMap((u) => {
        const no = articleLabel(u["조문번호"], u["조문가지번호"]);
        const text = articleBody(u);
        if (!no || !text) return [];
        const title = typeof u["조문제목"] === "string" ? u["조문제목"] : "";
        return [toArticle(law.lawName, no, title, text, u["조문시행일자"] ?? law.effectiveDate)];
      });
      return scoreArticles(all, words, limit);
    },

    async getArticle(lawName, articleNo) {
      const no = normalizeArticleNo(articleNo);
      if (!no || !lawName.trim()) return null;
      const law = await resolveLaw(lawName);
      if (!law) return null;
      const raw = await call("article", () => client.getLawText({ mst: law.mst, jo: buildJO(no) }));
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "article", reason: "parse" });
      }
      const unit = findArticleUnit(json, no);
      if (!unit) return null;
      const text = articleBody(unit);
      if (!text) return null;
      const title = typeof unit["조문제목"] === "string" ? unit["조문제목"] : "";
      return toArticle(law.lawName, no, title, text, unit["조문시행일자"] ?? law.effectiveDate);
    },

    async searchCases(query, limit = 5) {
      // 사건번호만 적었으면 사건번호로 찾는다 (바로 가기)
      const nos = caseNumbersIn(query);
      const byNo = nos.length === 1 && nos[0] === query.replace(/\s+/g, "");
      const res = await call("cases", () =>
        // 판례명과 본문을 함께 검색 (프로토타입과 같음, DEC-014)
        searchPrecedentsStructured(
          client,
          byNo
            ? { caseNumber: nos[0], display: 20, page: 1 }
            : { query, search: "both", display: Math.min(limit * 2, 50), page: 1 },
        ),
      );
      return toCaseHits(res.hits, limit);
    },

    async getCase(id) {
      const rec = await call("case", () => getPrecedentRecord(client, { id }));
      const caseNo = typeof rec?.["사건번호"] === "string" ? rec["사건번호"].trim() : "";
      const court = typeof rec?.["법원명"] === "string" ? rec["법원명"].trim() : "";
      if (!rec || !caseNo || !court) return null;
      const holding = stripHtml(rec["판시사항"]);
      const summary = stripHtml(rec["판결요지"]);
      const fromBody = !holding && !summary;
      return {
        id,
        caseNo,
        caseName: stripHtml(rec["사건명"]) ?? "",
        court,
        decidedAt: isoDate(rec["선고일자"]),
        sourceUrl: caseUrl(id),
        holding,
        summary,
        refs: stripHtml(rec["참조조문"]),
        fromBody,
        bodyExcerpt: fromBody ? bodyExcerpt(rec["판례내용"]) : null,
      };
    },

    async verifyStatutes(citations) {
      const unique = [...new Set(citations.map((c) => c.trim()).filter(Boolean))].slice(
        0,
        MAX_VERIFY,
      );
      const checked = new Map(
        await mapLimited(unique, async (citation) => {
          const res = await call("verify", () =>
            verifyCitations(client, { text: citation, maxCitations: 1 }),
          );
          const text = res.content.map((c) => c.text).join("\n");
          const check = parseStatuteVerify(citation, text);
          if (check.exists !== null) return [citation, check] as const;
          // verify_citations는 긴 법령 이름(예: "전기통신금융사기 피해 방지 및 피해자산 환급에 관한 특별법")을 잘라 읽어
          // 정확한 인용도 "확인 필요"로 돌려준다. 그럴 때만 그 법령의 그 조문을 법제처에서 직접 다시 가져와 본다 —
          // 이름이 글자 그대로 같은 법령에서 조문이 나와야 실존으로 친다 (줄임말·부분 이름은 그대로 미확인)
          const m = citation.match(/^(.+?)\s+(제\d+조(?:의\d+)?)$/);
          if (!m) return [citation, check] as const;
          const art = await this.getArticle(m[1], m[2]).catch(() => null);
          const same = (a: string, b: string) =>
            a.normalize("NFKC").replace(/\s+/g, "") === b.normalize("NFKC").replace(/\s+/g, "");
          return [
            citation,
            art && same(art.lawName, m[1]) && same(art.articleNo, m[2])
              ? { citation, exists: true }
              : check,
          ] as const;
        }),
      );
      return citations.map(
        (c) =>
          checked.get(c.trim()) ?? { citation: c, exists: null, note: "재조회 한도를 넘어 미확인" },
      );
    },

    async verifyCases(caseNos) {
      const unique = [...new Set(caseNos.map((c) => c.trim()).filter(Boolean))].slice(
        0,
        MAX_VERIFY,
      );
      if (unique.length === 0) return [];
      const report = await call("verify", () =>
        verifyCaseCitations(client, unique.join("\n"), undefined, unique.length),
      );
      return caseNos.map((c) =>
        unique.includes(c.trim())
          ? parseCaseVerify(c, report.lines)
          : { citation: c, exists: null, note: "재조회 한도를 넘어 미확인" },
      );
    },
  };
}
