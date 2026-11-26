// @vitest-environment node
// 개선안 A 판례 거르기·쪽 넘기기: 법원·선고 연도·정렬은 법제처에 맡기고, 전체 건수·사건 종류만 옮긴다. 법제처는 가짜.
import { describe, expect, test, vi } from "vitest";
import { SEARCH_NOTICE } from "@/lib/api/respond";
import { caseTypeOf, parseCaseFilter, precPage, precSearchParams } from "@/lib/search/case-filter";

vi.mock("server-only", () => ({}));
const source = vi.hoisted(() => ({ searchCases: vi.fn(), searchCasesPage: vi.fn() }));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => source }));
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));
const casesRoute = await import("@/app/api/v1/cases/route");

const from = (o: Record<string, unknown>) => (k: string) => o[k];

describe("거르기 값 검사", () => {
  test("아무것도 없으면 null — 지금처럼 판례명+본문 검색을 쓴다", () => {
    expect(parseCaseFilter(from({}))).toBeNull();
    expect(parseCaseFilter(from({ court: "", sort: null }))).toBeNull();
  });

  test("법원 이름·연도·정렬·쪽은 정해진 꼴만 받는다", () => {
    expect(
      parseCaseFilter(
        from({ court: "서울고등법원", fromYear: "2015", toYear: "2020", sort: "newest", page: 2 }),
      ),
    ).toEqual({ court: "서울고등법원", fromYear: "2015", toYear: "2020", sort: "newest", page: 2 });
    for (const c of [
      "대법원",
      "서울고등법원",
      "부산고법",
      "서울중앙지방법원",
      "수원지방법원 성남지원",
      "서울가정법원",
      "서울행정법원",
      "특허법원",
    ])
      expect(parseCaseFilter(from({ court: c }))?.court, c).toBe(c);
    for (const bad of [
      { court: "홍길동" },
      { court: "홍길동법원" },
      { court: "서울고법 홍길동" },
      { court: "대법원; DROP" },
      { fromYear: "15" },
      { fromYear: "2020", toYear: "2015" },
      { sort: "relevance" },
      { page: 0 },
      { page: 51 },
      { page: "2a" },
    ])
      expect(() => parseCaseFilter(from(bad)), JSON.stringify(bad)).toThrow();
  });

  test("법제처 인자: 본문 검색, 법원(curt)·정렬·선고일 범위(prncYd)", () => {
    expect(
      precSearchParams("보증금", {
        court: "대법원",
        fromYear: "2015",
        toYear: null,
        sort: "newest",
        page: 3,
      }),
    ).toEqual({
      query: "보증금",
      search: "2",
      display: "20",
      page: "3",
      curt: "대법원",
      sort: "ddes",
      prncYd: "20150101~20991231",
    });
    const plain = precSearchParams("보증금", {
      court: null,
      fromYear: null,
      toYear: null,
      sort: "source",
      page: 1,
    });
    expect(plain).not.toHaveProperty("sort");
    expect(plain).not.toHaveProperty("prncYd");
  });
});

describe("목록 읽기", () => {
  const XML = `<PrecSearch><totalCnt>1136</totalCnt><prec id="1"><판례일련번호>625903</판례일련번호><사건명><![CDATA[손해배상(기)]]></사건명><사건번호>2026다203203</사건번호><선고일자>20260910</선고일자><법원명>대법원</법원명><사건종류명>민사</사건종류명><판례상세링크>/DRF/lawService.do?OC=SECRET&amp;target=prec</판례상세링크></prec><prec id="2"><판례일련번호>625404</판례일련번호><사건명><![CDATA[사기]]></사건명><사건번호>2025도1234</사건번호><선고일자>20260903</선고일자><법원명>대법원</법원명></prec><prec id="3"><판례일련번호>1</판례일련번호><사건명>국세</사건명><사건번호>조심2020서1</사건번호></prec></PrecSearch>`;
  test("전체 건수와 행, 사건 종류(법제처 값 → 없으면 사건번호 부호), 법원 없는 행은 뺀다, 인증키 주소 없음", () => {
    const { total, items } = precPage(XML);
    expect(total).toBe(1136);
    expect(items.map((i) => [i.caseNo, i.caseType])).toEqual([
      ["2026다203203", "민사"],
      ["2025도1234", "형사"],
    ]);
    expect(items[0].decidedAt).toBe("2026-09-10");
    expect(JSON.stringify(items)).not.toContain("SECRET");
  });

  test("사건번호 부호 표", () => {
    expect(caseTypeOf(null, "2020두12345")).toBe("행정");
    expect(caseTypeOf(null, "2019므1234")).toBe("가사");
    expect(caseTypeOf(null, "2021후1234")).toBe("특허");
    expect(caseTypeOf(null, "2020헌마123")).toBe("헌법");
    expect(caseTypeOf(null, "2023가합12345")).toBe("민사");
    expect(caseTypeOf(null, "2023고단1234")).toBe("형사");
    expect(caseTypeOf(null, "가상번호")).toBeNull();
    expect(caseTypeOf("특별", "2020다1")).toBe("특별");
  });
});

describe("POST /cases 거르기", () => {
  const post = (body: unknown) =>
    new Request("http://localhost/api/v1/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("거르기 값이 있으면 한 쪽과 전체 건수를 주고, 없으면 지금처럼 searchCases", async () => {
    source.searchCasesPage.mockResolvedValue({
      total: 41,
      items: [
        {
          id: "1",
          caseNo: "2026다1",
          caseName: "보증금",
          court: "대법원",
          decidedAt: "2026-01-02",
          sourceUrl: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=1",
          caseType: "민사",
        },
      ],
    });
    const res = await casesRoute.POST(post({ q: "보증금", court: "대법원", page: 2 }), {} as never);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      totalCount: 41,
      page: 2,
      pageSize: 20,
      notice: SEARCH_NOTICE,
    });
    expect((body.data.items as { caseType: string }[])[0].caseType).toBe("민사");
    expect(source.searchCasesPage).toHaveBeenCalledWith(
      "보증금",
      expect.objectContaining({ court: "대법원", page: 2, sort: "source" }),
    );
    source.searchCases.mockResolvedValue([]);
    await casesRoute.POST(post({ q: "보증금" }), {} as never);
    expect(source.searchCases).toHaveBeenCalledWith("보증금", 10);
  });

  test("꼴이 틀린 거르기 값은 법제처로 보내지 않고 400", async () => {
    source.searchCasesPage.mockClear();
    const res = await casesRoute.POST(post({ q: "보증금", court: "아무개" }), {} as never);
    expect(res.status).toBe(400);
    expect(source.searchCasesPage).not.toHaveBeenCalled();
  });
});
