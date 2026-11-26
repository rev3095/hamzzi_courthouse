// 판례 아카이브 (DEC-054, F-003): 검색 ↔ 리서치 전환(검색어는 주소에 싣지 않음), 같은 보관함.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn() }),
}));

const api = vi.hoisted(() => ({ searchCases: vi.fn(), getCaseDetail: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  searchCases: api.searchCases,
  getCaseDetail: api.getCaseDetail,
}));

const { archiveHref } = await import("@/components/search/ArchiveSwitch");
const { SearchView, QUICK_QUERIES } = await import("@/components/search/SearchView");
const { ResearchView } = await import("@/components/search/ResearchView");
const { rememberSearch } = await import("@/components/search/parts");

const NOTICE = "법제처 검색 결과 · AI 생성 아님";
const CASE = {
  id: "111",
  caseNo: "가상다1",
  caseName: "보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
};
const found = {
  ok: true,
  data: { items: [CASE], outcome: "grounded", searchScopeNote: "", notice: NOTICE },
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  search = new URLSearchParams();
  api.searchCases.mockResolvedValue(found);
  api.getCaseDetail.mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("검색 ↔ 리서치 전환 (DEC-054)", () => {
  test("F-007 전환 주소에는 자료 종류만 있고 검색어는 없다", () => {
    expect(archiveHref("research", "search", true, "cases")).toBe(
      "/research?from=search&kind=cases",
    );
    expect(archiveHref("search", "research", false, "cases")).toBe("/search");
  });

  test("검색을 마치면 리서치 전환이 그 검색어로 이어지고, 결과 카드에서 보관함에 담는다", async () => {
    render(<SearchView />);
    fireEvent.click(screen.getByRole("button", { name: QUICK_QUERIES[0] }));
    await screen.findByTestId("result-count");
    const toResearch = screen.getByRole("link", { name: /리서치/ });
    expect(toResearch.getAttribute("href")).toBe("/research?from=search&kind=cases");
    expect(toResearch.getAttribute("href")).not.toContain(encodeURIComponent(QUICK_QUERIES[0]));

    fireEvent.click(screen.getByRole("button", { name: "보관함에 담기" }));
    expect(screen.getByRole("button", { name: "보관함에서 빼기" })).toBeDefined();
    const pins = JSON.parse(localStorage.getItem("hz:pins") ?? "[]");
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      href: "/cases/111",
      sub: "대법원 2021. 3. 11. 선고 가상다1 (보증금반환)",
    });
    expect(screen.getByRole("link", { name: /보관함 1건/ }).getAttribute("href")).toBe("/research");
  });

  test("리서치는 검색 화면에서 넘어오면(?from=search) 건네 둔 검색어로 바로 찾고, 같은 보관함을 본다", async () => {
    rememberSearch("보증금 반환");
    localStorage.setItem(
      "hz:pins",
      JSON.stringify([{ href: "/cases/111", title: "보증금반환", sub: "x", kind: "판례", at: 1 }]),
    );
    search = new URLSearchParams("from=search&kind=cases");
    render(<ResearchView />);
    expect(await screen.findByRole("button", { name: "보관함에서 빼기" })).toBeDefined();
    expect(api.searchCases).toHaveBeenCalledWith("보증금 반환");
  });

  test("검색 화면은 리서치에서 넘어오면(?from=research) 건네 둔 검색어로 바로 찾는다", async () => {
    rememberSearch("보증금 반환");
    window.history.replaceState(null, "", "/search?from=research&kind=cases");
    render(<SearchView />);
    expect((await screen.findByTestId("result-count")).textContent).toBe("1건");
    expect(api.searchCases).toHaveBeenCalledWith("보증금 반환");
    // 새로고침 때 다시 찾지 않게 전환 표시를 지운다
    expect(window.location.search).toBe("");
  });

  test("간결해진 검색창: 검색 요령은 접어 두고, 자주 찾는 검색어는 처음 화면에만 보인다", async () => {
    const { container } = render(<SearchView />);
    expect(container.querySelector("details")?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: QUICK_QUERIES[0] }));
    await screen.findByTestId("result-count");
    expect(screen.queryByText("자주 찾는 검색어")).toBeNull();
  });
});
