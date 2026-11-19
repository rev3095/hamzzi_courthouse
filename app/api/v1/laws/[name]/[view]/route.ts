// GET /api/v1/laws/{name}/{view} — 법령 도구 (DEC-029 제안). view = articles | three-tier | old-new | history | annexes | impact.
// 법제처에 등록된 관계·대조표만 정리해 주고, 영향 크기·중요도 같은 판단은 붙이지 않는다 (절대 규칙 2).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
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

type Ctx = { params: Promise<{ name: string; view: string }> };

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
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const source = createLawSource({ timeoutMs: 15_000 });
  const done = <T extends { lawName: string }>(data: T) =>
    ok(withNotice({ ...data, sourceUrl: lawUrl(data.lawName) }), scope.requestId);

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
