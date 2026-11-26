// 판례 리서치 /research (DEC-029, F-003): 검색 → 목록 → 옆 미리보기 → 보관함. 검색 API는 목으로 바꾼다.
// 개선안 A: 판례 탭은 법원·연도·정렬을 법제처에서 다시 찾고(searchCasesPage), 전체 건수·더 보기·사건 종류 칩을 보인다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let search = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ push }),
}));

const api = vi.hoisted(() => ({
  searchCases: vi.fn(),
  searchCasesPage: vi.fn(),
  getCaseDetail: vi.fn(),
}));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  searchCases: api.searchCases,
  searchCasesPage: api.searchCasesPage,
  getCaseDetail: api.getCaseDetail,
}));

const { ResearchView, citationLine, refine } = await import("@/components/search/ResearchView");
type Row = import("@/components/search/ResearchView").Row;

const NOTICE = "법제처 검색 결과 · AI 생성 아님";
const item = (
  id: string,
  caseName: string,
  court: string,
  decidedAt: string,
  caseNo: string,
  caseType: string | null = null,
) => ({
  id,
  caseName,
  court,
  decidedAt,
  caseNo,
  sourceUrl: `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${id}`,
  caseType,
});
const LIST = {
  ok: true,
  data: {
    items: [
      item("1", "임대차보증금반환", "대법원", "2021-03-11", "가상다1"),
      item("2", "보증금반환청구", "서울고등법원", "2019-05-02", "가상나2"),
    ],
    outcome: "grounded",
    searchScopeNote: "범위 안내",
    notice: NOTICE,
  },
};
const PAGE = (total: number, page: number, items = LIST.data.items) => ({
  ok: true,
  data: { ...LIST.data, items, totalCount: total, page, pageSize: 20 },
});
const detail = (text: string) => ({
  ok: true,
  data: {
    sections: [{ section: "판시사항", text }],
    citedStatutes: [{ raw: "민법 제536조", id: "민법:제536조" }],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  search = new URLSearchParams();
  api.searchCases.mockResolvedValue(LIST);
  api.searchCasesPage.mockResolvedValue(
    PAGE(2, 1, [
      item("1", "임대차보증금반환", "대법원", "2021-03-11", "가상다1", "민사"),
      item("2", "보증금반환청구", "서울고등법원", "2019-05-02", "가상나2", "민사"),
    ]),
  );
  api.getCaseDetail.mockImplementation(async (id: string) =>
    detail(id === "1" ? "임대차가 끝난 뒤 보증금 반환 의무" : "두 번째 판례의 판시사항"),
  );
});
afterEach(cleanup);

const searchFor = async (q: string) => {
  fireEvent.change(screen.getByLabelText("리서치 검색어"), { target: { value: q } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  return screen.findByTestId("research-count");
};

describe("판례 리서치 화면", () => {
  test("검색하면 목록과 첫 자료의 요지 미리보기를 함께 보이고, 검색어를 하이라이트한다", async () => {
    render(<ResearchView />);
    expect((await searchFor("보증금 반환")).textContent).toBe("전체 2건 중 2건");
    const preview = await screen.findByRole("article", { name: "미리보기" });
    expect(await within(preview).findByText("판시사항")).toBeDefined();
    expect(within(preview).getByRole("link", { name: "전체 보기" }).getAttribute("href")).toBe(
      "/cases/1?from=search",
    );
    // 참조조문은 선고일의 조문으로 연결한다 (F-004 AC1)
    expect(within(preview).getByRole("link", { name: "민법 제536조" }).getAttribute("href")).toBe(
      `/statutes/${encodeURIComponent("민법:제536조")}?asOf=2021-03-11`,
    );
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
    expect(screen.getByText(NOTICE)).toBeDefined();
    expect(screen.queryByText(/유사도|관련도 \d|승소|확률/)).toBeNull();
    // 검색어는 주소가 아니라 이 기기에만
    expect(sessionStorage.getItem("hz:sq")).toBe("보증금 반환");
  });

  test("목록을 누르면 미리보기가 바뀌고, 법원·연도·정렬은 법제처에서 다시 찾는다", async () => {
    render(<ResearchView />);
    await searchFor("보증금");
    expect(api.searchCasesPage).toHaveBeenLastCalledWith("보증금", {
      court: null,
      fromYear: null,
      toYear: null,
      sort: "source",
    });
    fireEvent.click(screen.getByRole("button", { name: /보증금반환청구/ }));
    expect(await screen.findByText("두 번째 판례의 판시사항")).toBeDefined();
    fireEvent.change(screen.getByLabelText("법원"), { target: { value: "서울고등법원" } });
    fireEvent.change(screen.getByLabelText("시작 연도"), { target: { value: "2015" } });
    fireEvent.change(screen.getByLabelText("정렬"), { target: { value: "newest" } });
    fireEvent.click(screen.getByRole("button", { name: "법제처에서 다시 찾기" }));
    await vi.waitFor(() =>
      expect(api.searchCasesPage).toHaveBeenLastCalledWith("보증금", {
        court: "서울고등법원",
        fromYear: "2015",
        toYear: null,
        sort: "newest",
      }),
    );
  });

  test("사건 종류 칩은 불러온 목록 안에서 거르고, 더 보기는 다음 쪽을 이어 붙인다", async () => {
    api.searchCasesPage.mockResolvedValueOnce(
      PAGE(41, 1, [
        item("1", "임대차보증금반환", "대법원", "2021-03-11", "가상다1", "민사"),
        item("3", "사기", "대법원", "2020-01-02", "가상도3", "형사"),
      ]),
    );
    render(<ResearchView />);
    expect((await searchFor("보증금")).textContent).toBe("전체 41건 중 2건");
    fireEvent.click(screen.getByRole("button", { name: /형사/ }));
    expect(screen.getByTestId("research-count").textContent).toBe("전체 41건 중 1/2건");
    fireEvent.click(screen.getByRole("button", { name: /형사/ }));
    api.searchCasesPage.mockResolvedValueOnce(
      PAGE(41, 2, [item("4", "보증금", "수원지방법원", "2018-02-03", "가상가4", "민사")]),
    );
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("research-count").textContent).toBe("전체 41건 중 3건"),
    );
    expect(api.searchCasesPage).toHaveBeenLastCalledWith(
      "보증금",
      expect.objectContaining({ page: 2 }),
    );
  });

  test("보관함에 담으면 이 기기에만 저장하고 인용 표기를 보여 준다", async () => {
    render(<ResearchView />);
    await searchFor("보증금");
    fireEvent.click(await screen.findByRole("button", { name: "보관함에 담기" }));
    const shelf = screen.getByRole("region", { name: "보관함" });
    expect(
      within(shelf).getByText("대법원 2021. 3. 11. 선고 가상다1 (임대차보증금반환)"),
    ).toBeDefined();
    const saved = JSON.parse(localStorage.getItem("hz:pins") ?? "[]") as { href: string }[];
    expect(saved.map((p) => p.href)).toEqual(["/cases/1"]);
    expect(JSON.stringify(saved)).not.toContain('보증금"}'); // 검색어 자체는 담지 않는다
    fireEvent.click(screen.getByRole("button", { name: "보관함에서 빼기" }));
    expect(localStorage.getItem("hz:pins")).toBeNull();
  });

  test("법령명 + 조문 번호는 조문 화면으로 바로 간다", async () => {
    render(<ResearchView />);
    fireEvent.change(screen.getByLabelText("리서치 검색어"), { target: { value: "민법 750조" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(push).toHaveBeenCalledWith(`/statutes/${encodeURIComponent("민법:제750조")}`);
    expect(api.searchCases).not.toHaveBeenCalled();
  });

  test("결과 화면에서 넘어오면(?from=result) 이 기기에 건넨 검색어로 바로 찾는다", async () => {
    sessionStorage.setItem("hz:sq", "임대차보증금");
    search = new URLSearchParams("from=result");
    render(<ResearchView />);
    expect((await screen.findByTestId("research-count")).textContent).toBe("전체 2건 중 2건");
    expect(api.searchCasesPage).toHaveBeenCalledWith("임대차보증금", {});
  });
});

describe("거르기·인용 표기 (순수)", () => {
  const row = (id: string, org: string | null, date: string | null): Row => ({
    kind: "cases",
    id,
    href: `/cases/${id}`,
    title: `사건${id}`,
    org,
    date,
    refNo: `번호${id}`,
    sourceUrl: null,
  });
  const rows = [
    row("a", "대법원", "2021-03-11"),
    row("b", "서울고등법원", "2019-05-02"),
    row("c", null, null),
  ];

  test("정렬·기간·기관 거르기만 한다 (순위를 만들지 않음)", () => {
    const base = { orgs: [], from: "", to: "", sort: "source" as const };
    expect(refine(rows, base).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(refine(rows, { ...base, sort: "oldest" }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(refine(rows, { ...base, from: "2020" }).map((r) => r.id)).toEqual(["a"]);
    expect(refine(rows, { ...base, orgs: ["서울고등법원"] }).map((r) => r.id)).toEqual(["b"]);
  });

  test("인용 표기는 법제처가 준 기관·날짜·번호를 잇기만 한다", () => {
    expect(citationLine(rows[0])).toBe("대법원 2021. 3. 11. 선고 번호a (사건a)");
    expect(citationLine({ ...rows[2], refNo: null })).toBe("사건c");
  });
});
