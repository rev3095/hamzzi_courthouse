// 실제 법제처 호출로 탐색 확장 어댑터를 확인한다 (DEC-029 제안). 실행: pnpm test:live (무료, Claude 호출 없음)
// 법제처 등록 IP에서만 통과한다. 결과 내용은 출력하지 않고 형태만 확인한다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createLawSource } = await import("@/lib/search/law-source");

const LAW = "주택임대차보호법";

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("법제처 실호출 — 탐색 확장 (DEC-029)", () => {
  const source = createLawSource({ timeoutMs: 30_000 });

  test("결정문: 법령해석례 검색·상세, 헌재 결정례·조세심판 재결례 검색", async () => {
    const hits = await source.searchDecisions("interpretation", "임대차", 3);
    expect(hits.length).toBeGreaterThan(0);
    const detail = await source.getDecision("interpretation", hits[0].id);
    expect(detail?.sections.length).toBeGreaterThan(0);
    expect((await source.searchDecisions("constitutional", "임대차", 3)).length).toBeGreaterThan(0);
    expect((await source.searchDecisions("tax_tribunal", "양도소득세", 3)).length).toBeGreaterThan(
      0,
    );
  });

  test("판례 밖 16종 모두 검색되고, 본문 조회가 있는 종류는 상세도 열린다", async () => {
    const queries = {
      interpretation: "임대차",
      constitutional: "임대차",
      admin_appeal: "과징금",
      tax_tribunal: "양도소득세",
      appeal_review: "징계",
      acr_special: "처분",
      customs: "과세가격",
      nts: "양도",
      ftc: "과징금",
      pipc: "개인정보",
      nlrc: "부당해고",
      acr: "보상",
      treaty: "투자",
      school: "학칙",
      public_corp: "인사",
      public_inst: "인사",
      english_law: "civil",
    } as const;
    const empty: string[] = [];
    const noDetail: string[] = [];
    for (const [domain, q] of Object.entries(queries) as [keyof typeof queries, string][]) {
      const hits = await source.searchDecisions(domain, q, 3);
      if (hits.length === 0) {
        empty.push(domain);
        continue;
      }
      if (!hits[0].hasDetail) continue;
      const detail = await source.getDecision(domain, hits[0].id);
      if (!detail || detail.title.length === 0) noDetail.push(domain);
    }
    expect({ empty, noDetail }).toEqual({ empty: [], noDetail: [] });
  }, 120_000);

  test("약칭으로 조문을 찾고, 사건번호로 판례를 찾는다", async () => {
    const art = await source.getArticle("주택임대차법", "제3조");
    expect(art?.lawName).toBe(LAW);
    const cases = await source.searchCases("임대차보증금 반환", 3);
    const byNo = await source.searchCases(cases[0].caseNo, 3);
    expect(byNo.map((c) => c.caseNo)).toContain(cases[0].caseNo);
  });

  test("조문이 나오는 판례", async () => {
    const hits = await source.casesCiting(LAW, "제3조", 3);
    expect(hits.length).toBeGreaterThan(0);
  });

  test("연혁과 과거 날짜의 조문", async () => {
    const history = await source.listVersions(LAW);
    expect(history!.versions.length).toBeGreaterThan(5);
    const at = await source.getArticleAt(LAW, "제3조", "2010-01-01");
    expect(at?.status).toBe("found");
    if (at?.status === "found") {
      expect(at.article.text.length).toBeGreaterThan(20);
      expect(at.version.effectiveFrom! <= "2010-01-01").toBe(true);
    }
    expect((await source.getArticleAt(LAW, "제3조", "1970-01-01"))?.status).toBe("not_in_force");
  });

  test("신구조문 대조 · 3단 비교 · 별표", async () => {
    const cmp = await source.compareOldNew(LAW);
    expect(cmp!.newRows.length).toBeGreaterThan(0);
    // 다른 법령의 일련번호는 받지 않는다
    const history = await source.listVersions("민법");
    expect(await source.compareOldNew(LAW, history!.versions[0].mst)).toBeNull();
    const tier = await source.getThreeTier(LAW);
    expect(tier!.rows.some((r) => r.delegations.length > 0)).toBe(true);
    const annexes = await source.listAnnexes("근로기준법 시행규칙");
    expect(annexes!.items.length).toBeGreaterThan(0);
  });

  test("자치법규 검색·상세, 법령 연계, 행정규칙 검색", async () => {
    const hits = await source.searchOrdinances("출산장려금", 5);
    expect(hits.length).toBeGreaterThan(0);
    const detail = await source.getOrdinance(hits[0].id);
    expect(detail!.articles.length).toBeGreaterThan(0);
    expect((await source.linkedOrdinances(LAW)).length).toBeGreaterThan(0);
    expect((await source.searchAdminRules("임대차", 5)).length).toBeGreaterThan(0);
  });
});
