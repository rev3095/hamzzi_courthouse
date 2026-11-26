// 검색 '물어보기' AI 답 (DEC-076) — 찾은 자료 모으기 (server-only, 모델 없음).
// 검색어와 해석(Haiku)이 고른 낱말로 법제처(법령 이름·판례 본문)와 각국 공식 사이트(searchWorldLaws)를 그 요청에서 조회한다.
// 해석이 댄 법령 이름은 법제처에서 찾아 실제로 있을 때만 싣는다. 판례는 일련번호·사건번호·사건명·법원·선고일·주소만(DEC-007).
// 출처 하나가 실패해도 나머지로 간다. 관련도 점수는 매기지 않고 순서는 lib/search/rank.ts 고정 규칙으로 정한다.
import "server-only";
import { createLawSource } from "@/lib/search/law-source";
import { searchWorldLaws } from "@/lib/search/world/source";
import type { LawHit } from "@/lib/search/types";
import {
  arrangeLaws,
  ANSWER_LIMITS,
  type AnswerCase,
  type AnswerFocus,
  type AnswerLaw,
} from "./policy";

const KR_SOURCE = "법제처 국가법령정보센터";
const HANGUL = /[가-힣]/;
const compact = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

const krLaw = (l: LawHit): AnswerLaw => ({
  name: l.name,
  kind: l.kind,
  country: "kr",
  href: `/laws/${encodeURIComponent(l.name)}`,
  sourceUrl: l.sourceUrl,
  source: KR_SOURCE,
});

export type Found = {
  laws: { domestic: AnswerLaw[]; foreign: AnswerLaw[] };
  cases: AnswerCase[];
  casesTotal: number | null;
  searched: { ko: string[]; en: string[]; ja: string[] };
};

export async function gatherFound(input: {
  query: string;
  focus: AnswerFocus;
  mode: "search" | "research";
  koTerms: string[];
  lawNames: string[];
  en: string[];
  ja: string[];
}): Promise<Found> {
  const source = createLawSource({ timeoutMs: 12_000 });
  const settle = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const caseQuery = input.focus === "cases" ? input.query : (input.koTerms[0] ?? input.query);
  const maxCases = ANSWER_LIMITS.cases[input.mode];

  const nameQueries = [
    ...(HANGUL.test(input.query) ? [input.query] : []),
    ...input.lawNames,
    ...input.koTerms,
  ].filter((v, i, a) => a.findIndex((x) => compact(x) === compact(v)) === i);

  const [world, byName, page] = await Promise.all([
    settle(
      searchWorldLaws(input.query, {
        extra: { ko: input.koTerms, en: input.en, ja: input.ja },
      }),
      null,
    ),
    Promise.all(
      nameQueries.slice(0, 5).map((q) => settle(source.searchLaws(q, 12), [] as LawHit[])),
    ),
    settle(
      source
        .searchCasesPage(caseQuery, {
          court: null,
          fromYear: null,
          toYear: null,
          sort: "source",
          page: 1,
        })
        .then((r) => ({
          total: r.total,
          items: r.items as {
            id: string;
            caseNo: string;
            caseName: string;
            court: string;
            decidedAt: string | null;
            sourceUrl: string;
          }[],
        })),
      null,
    ),
  ]);

  // 해석이 댄 법령 이름은 법제처 이름 검색 결과와 이름이 같을 때만 쓴다 (없는 법령을 싣지 않는다)
  const domesticHits: LawHit[] = [];
  byName.forEach((hits, i) => {
    const q = nameQueries[i];
    const isName = input.lawNames.some((n) => compact(n) === compact(q));
    for (const h of hits) {
      if (isName && !compact(h.name).startsWith(compact(q))) continue;
      domesticHits.push(h);
    }
  });

  const worldLaws: AnswerLaw[] = (world?.items ?? []).map((h) => ({
    name: h.title,
    kind: h.kind,
    country: h.country,
    href: h.internal ?? null,
    sourceUrl: h.sourceUrl,
    source: h.source,
    ...(h.titleKo && { titleKo: h.titleKo }),
    ...(h.curated && { core: true }),
  }));

  const laws = arrangeLaws([...domesticHits.map(krLaw), ...worldLaws]);
  const cases: AnswerCase[] = (page?.items ?? []).slice(0, maxCases).map((c) => ({
    id: c.id,
    caseNo: c.caseNo,
    caseName: c.caseName,
    court: c.court,
    decidedAt: c.decidedAt,
    sourceUrl: c.sourceUrl,
  }));
  return {
    laws,
    cases,
    casesTotal: page ? page.total : null,
    searched: {
      ko: [input.query, ...input.koTerms].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6),
      en: world?.translated.en ? [world.translated.en] : [],
      ja: world?.translated.ja ? [world.translated.ja] : [],
    },
  };
}
