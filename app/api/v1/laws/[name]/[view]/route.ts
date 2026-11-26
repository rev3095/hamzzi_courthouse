// GET /api/v1/laws/{name}/{view} — 법령 도구 (DEC-029 제안). view = easy | articles | three-tier | old-new | history | annexes | impact.
// 법제처에 등록된 관계·대조표만 정리해 주고, 영향 크기·중요도 같은 판단은 붙이지 않는다 (절대 규칙 2).
// easy(DEC-074)만 AI를 쓴다: 조문 원문을 쉬운 말로 푼 Haiku 1회(1건 $0.004 상한, 주간·기간 예산은 분석과 함께 센다).
// 하루 질문 횟수는 쓰지 않는다. 실제 판례는 법제처 검색 결과만 싣고, 모델이 만든 사례는 가상 사례로 따로 표시한다. 결과는 저장하지 않는다.
import { explainLaw } from "@/lib/ai/law-easy";
import { aiMode } from "@/lib/ai/mode";
import { LAW_EASY_WEIGHT } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, SEARCH_NOTICE, ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import {
  LAW_EASY_RATE,
  LOOKUP_RATE,
  assertRateLimit,
  settleAiQuota,
  tryAiQuota,
} from "@/lib/auth/rate-limit";
import { findEasyLaw } from "@/lib/search/easy/data";
import {
  EASY_REAL_CASES_ENOUGH,
  EASY_SOURCE_NOTE,
  EASY_VIRTUAL_NOTICE,
  fallbackEasy,
  type EasyAiState,
  type EasyLaw,
  type EasyLawView,
} from "@/lib/search/easy/policy";
import {
  DELEGATION_NOTE,
  IMPACT_NOTE,
  delegationChecks,
  lawUrl,
  parseLawName,
  parseLawView,
  withNotice,
} from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";
import { searchWorldCases } from "@/lib/search/world/source";

type Ctx = { params: Promise<{ name: string; view: string }> };

/** 쉬운 설명 화면에 싣는 실제 판례 수 */
const REAL_CASES = 4;
/** 해외 공개 기록을 함께 싣는 법령 이름 */
const MEDICAL_DEVICE_LAW = /의료기기|체외진단/;
const FOREIGN_RECORDS = 3;

const found = <T>(v: T | null): T => {
  if (v === null) throw new ApiError("NOT_FOUND");
  return v;
};

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const p = await ctx.params;
  const name = parseLawName(p.name);
  const view = parseLawView(p.view);
  const mst = new URL(req.url).searchParams.get("mst") ?? undefined;
  if (mst !== undefined && !/^\d{1,12}$/.test(mst)) {
    throw new ApiError("VALIDATION_ERROR", { field: "mst" });
  }
  await assertRateLimit(view === "easy" ? LAW_EASY_RATE : LOOKUP_RATE, req.headers);
  const source = createLawSource({ timeoutMs: 15_000 });
  const done = <T extends { lawName: string }>(data: T) =>
    ok(withNotice({ ...data, sourceUrl: lawUrl(data.lawName) }), scope.requestId);

  if (view === "easy") {
    const law = found(await source.getLawArticles(name));
    const articles = law.articles.map((a) => ({
      articleNo: a.articleNo,
      title: a.title,
      text: a.text,
      effectiveFrom: a.effectiveFrom,
    }));
    // 실제 판례는 법제처 검색 결과뿐이다 — 모델 출력에서 가져오지 않는다. 판례 검색이 실패해도 설명은 보여 준다
    let realCasesFailed = false;
    const [realCases, foreignRecords] = await Promise.all([
      source.searchCases(law.lawName, REAL_CASES).then(
        (hits) =>
          hits.slice(0, REAL_CASES).map((c) => ({
            id: c.id,
            caseNo: c.caseNo,
            caseName: c.caseName,
            court: c.court,
            decidedAt: c.decidedAt,
            sourceUrl: c.sourceUrl,
          })),
        () => {
          realCasesFailed = true;
          return [];
        },
      ),
      // 의료기기 법령이면 미국 FDA 공개 리콜 기록을 함께 싣는다 (공식 공개 API, 모델 없음, 실패하면 빈 목록)
      MEDICAL_DEVICE_LAW.test(law.lawName)
        ? searchWorldCases("us", "리콜").then((rows) =>
            rows.slice(0, FOREIGN_RECORDS).map((r) => ({
              id: r.id,
              kind: r.kind,
              title: r.title,
              summary: r.summary,
              date: r.date,
              sourceUrl: r.sourceUrl,
              source: r.source,
            })),
          )
        : Promise.resolve([]),
    ]);
    // 판례 검색이 실패했으면 "판례가 적다"고 볼 수 없으므로 가상 사례를 만들지 않는다
    const needVirtual = !realCasesFailed && realCases.length < EASY_REAL_CASES_ENOUGH;

    let easy: EasyLaw | null = findEasyLaw(law.lawName, articles, { allowVirtual: needVirtual });
    let ai: EasyAiState = { used: true };
    if (!easy) {
      if (articles.length === 0) ai = { used: false, reason: "no_articles" };
      else if (aiMode() === "free") ai = { used: false, reason: "free_mode" };
      else if (!(await tryAiQuota(LAW_EASY_WEIGHT))) ai = { used: false, reason: "budget" };
      else {
        // 실제로 쓴 금액만 예산에 남긴다 (DEC-040). 예외가 나도 잡아 둔 금액은 돌려준다
        let costUsd = 0;
        try {
          const out = await explainLaw({ lawName: law.lawName, articles, needVirtual });
          costUsd = out.costUsd;
          if (out.ok) easy = out.easy;
          else ai = { used: false, reason: out.reason };
        } finally {
          await settleAiQuota(LAW_EASY_WEIGHT, costUsd);
        }
      }
    }
    const body: EasyLawView = {
      lawName: law.lawName,
      easy: easy ?? fallbackEasy(law.lawName, articles),
      articles,
      realCases,
      realCasesFailed,
      foreignRecords,
      ai,
      notice: easy ? AI_NOTICE : SEARCH_NOTICE,
      virtualNotice: easy && easy.virtualCases.length > 0 ? EASY_VIRTUAL_NOTICE : null,
      sourceNote: easy ? EASY_SOURCE_NOTE : null,
      sourceUrl: lawUrl(law.lawName),
    };
    const res = ok(body, scope.requestId);
    // 같은 브라우저가 다시 열 때 모델을 또 부르지 않게 한다. 서버에는 저장하지 않는다
    // 실패·대체 응답은 붙잡아 두지 않는다 — 다시 열면 새로 시도한다
    res.headers.set(
      "cache-control",
      realCasesFailed || !ai.used ? "no-store" : "private, max-age=600",
    );
    return res;
  }

  if (view === "articles") {
    // 법령 전문(조문 단위). 화면이 보고 있는 조문을 따라 판례 패널을 갱신한다
    const law = found(await source.getLawArticles(name));
    return done({
      lawName: law.lawName,
      articles: law.articles.map((a) => ({
        articleNo: a.articleNo,
        title: a.title,
        text: a.text,
        effectiveFrom: a.effectiveFrom,
      })),
    });
  }
  if (view === "three-tier") return done(found(await source.getThreeTier(name)));
  if (view === "old-new") return done(found(await source.compareOldNew(name, mst)));
  if (view === "history") return done(found(await source.listVersions(name)));
  if (view === "annexes") return done(found(await source.listAnnexes(name)));

  const law = found(await source.getLawArticles(name));
  const [tier, ordinances] = await Promise.all([
    source.getThreeTier(law.lawName),
    source.linkedOrdinances(law.lawName),
  ]);
  const rows = tier?.rows ?? [];
  return done({
    lawName: law.lawName,
    articleCount: law.articles.length,
    // 조문별 하위법령 연결 (본문은 3단 비교 화면에서 본다)
    lower: rows
      .filter((r) => r.delegations.length > 0)
      .map((r) => ({
        articleNo: r.articleNo,
        title: r.title,
        delegations: r.delegations.map((d) => ({
          type: d.type,
          lawName: d.lawName,
          articleNo: d.articleNo,
          title: d.title,
        })),
      })),
    ordinances,
    checks: delegationChecks(law.articles, { lawName: law.lawName, rows }),
    impactNote: IMPACT_NOTE,
    delegationNote: DELEGATION_NOTE,
  });
});
