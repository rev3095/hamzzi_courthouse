import "server-only";

// korean-law-mcp 어댑터 (DEC-009, ARCHITECTURE 4.2). 서비스 코드에서 korean-law-mcp를 import하는 곳은 이 파일 하나뿐이다.
// MCP 서버를 띄우지 않고 라이브러리 함수를 서버에서 직접 호출한다. 반환은 lib/search/types의 우리 타입만 쓴다.
// - 인증키: OPEN_LAW_API_KEY (서버 환경변수). 키·요청 URL·라이브러리 오류 문구는 응답·로그에 넘기지 않는다.
// - 판례 전문은 반환·저장하지 않는다. 요지가 없을 때만 가린 본문 일부를 쓴다 (DEC-007, F-007).
// - 국세법령정보시스템 출처 판례(법원명 없음, 본문 HTML 전용)는 제외한다 (DEC-008).

import { LawApiClient } from "korean-law-mcp/lib/api-client";
import { verifyCaseCitations } from "korean-law-mcp/lib/case-citation";
import { buildJO } from "korean-law-mcp/lib/law-parser";
import { findLaws, resolvedLawMatches } from "korean-law-mcp/lib/law-search";
import { searchAiLawStructured } from "korean-law-mcp/tools/life-law";
import { searchPrecedentsStructured } from "korean-law-mcp/tools/precedent-search-core";
import { getPrecedentRecord } from "korean-law-mcp/tools/precedents";
import { verifyCitations } from "korean-law-mcp/tools/verify-citations";
import { ApiError } from "@/lib/api/errors";
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
import type { ArticleHit, CaseDetail, CaseHit, CitationCheck } from "./types";

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

export type LawSourceOptions = {
  apiKey?: string;
  /** 호출 1건 시간 한도. 데모 분석 전체 p95 ≤ 60초(DEC-013) 안에 들도록 짧게 둔다 */
  timeoutMs?: number;
  /** 재조회 동시 실행 수 (법제처 트래픽 제한 고려) */
  concurrency?: number;
};

const MAX_VERIFY = 20;

export function createLawSource(options: LawSourceOptions = {}): LawSource {
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

  return {
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
      const laws = await call("law", () => findLaws(client, lawName));
      const law = laws.find((l) => resolvedLawMatches(lawName, l.lawName));
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
      const laws = await call("law", () => findLaws(client, lawName));
      const law = laws.find((l) => resolvedLawMatches(lawName, l.lawName));
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
      const res = await call("cases", () =>
        // 판례명과 본문을 함께 검색 (프로토타입과 같음, DEC-014)
        searchPrecedentsStructured(client, {
          query,
          search: "both",
          display: Math.min(limit * 2, 50),
          page: 1,
        }),
      );
      return res.hits
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
          return [citation, parseStatuteVerify(citation, text)] as const;
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
