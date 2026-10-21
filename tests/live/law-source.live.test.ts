// 실제 법제처 호출로 korean-law-mcp 어댑터를 확인한다 (DEC-009). 실행: pnpm test:live
// 법제처 등록 IP에서만 통과한다. 결과 값(판례 내용 등)은 출력하지 않고 형태만 확인한다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createLawSource } = await import("@/lib/search/law-source");

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("법제처 실호출 (DEC-009)", () => {
  const source = createLawSource({ timeoutMs: 30_000 });

  test("F-004 자연어로 관련 조문을 찾는다", async () => {
    const hits = await source.searchArticles("전세 보증금을 집주인이 돌려주지 않는다", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].articleNo).toMatch(/^제\d+조(의\d+)?$/);
  });

  test("DEC-014 법령 전문에서 키워드 점수로 조문을 고른다", async () => {
    const hits = await source.findArticles("주택임대차보호법", ["보증금", "임차권등기명령"], 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.articleNo)).toContain("제3조의3");
  });

  test("F-004 법령명·조문번호로 조문을 가져온다", async () => {
    const art = await source.getArticle("주택임대차보호법", "제3조의2");
    expect(art?.title).toBe("보증금의 회수");
  });

  test("F-003 판례 검색과 상세", async () => {
    const hits = await source.searchCases("임대차보증금 반환", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.court)).toBe(true);
    // 법제처가 일부 판례의 상세를 비워 돌려줄 때가 있다 (예: 2026-10-22 일련번호 619451) — 앞 3건 중 상세가 있는 것으로 본다
    const details = await Promise.all(hits.slice(0, 3).map((h) => source.getCase(h.id)));
    const i = details.findIndex(Boolean);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(details[i]?.caseNo).toBe(hits[i].caseNo);
  });

  test("F-005 AC2 ③ 실존·부존재 인용을 가린다", async () => {
    const statutes = await source.verifyStatutes(["주택임대차보호법 제3조의2", "민법 제9999조"]);
    expect(statutes.map((s) => s.exists)).toEqual([true, false]);
    const cases = await source.verifyCases(["2023다307116", "2099다99999"]);
    expect(cases.map((c) => c.exists)).toEqual([true, false]);
  });
});
