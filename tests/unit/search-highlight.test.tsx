// F-003 판례 검색 하이라이트: 검색 결과·상세(판시사항·판결요지)에서 검색어 낱말을 조금 어두운 바탕으로 표시한다.
// 검색어는 주소에 넣지 않고 이 기기(sessionStorage)에만 둔다 (F-007).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "111" }),
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn() }),
}));

const CASE = {
  id: "111",
  caseNo: "2020다12345",
  caseName: "임대차보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
};
const fetchSpy = vi.fn(async (url: string) => {
  if (url.includes("/api/v1/cases/111")) {
    return Response.json({
      data: {
        ...CASE,
        holdingSummary: null,
        sections: [
          { section: "판시사항", text: "임대차가 끝난 뒤 보증금 반환 의무의 범위" },
          { section: "판결요지", text: "임차인은 보증금을 돌려받을 때까지" },
        ],
        fromBody: false,
        citedStatutes: [],
        notice: "법제처 검색 결과 · AI 생성 아님",
      },
    });
  }
  return Response.json({
    data: {
      items: [CASE],
      outcome: "grounded",
      searchScopeNote: "범위 안내",
      notice: "법제처 검색 결과 · AI 생성 아님",
    },
  });
});
vi.stubGlobal("fetch", fetchSpy);

beforeEach(() => {
  sessionStorage.clear();
  search = new URLSearchParams();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { SearchView } = await import("@/components/search/SearchView");
const { CaseRoute } = await import("@/components/search/DetailViews");

const marks = () => [...document.querySelectorAll("mark")].map((m) => m.textContent);

test("F-003 검색 결과의 판례명에서 검색어 낱말을 하이라이트하고, 상세 링크에는 검색어를 넣지 않는다", async () => {
  render(<SearchView />);
  fireEvent.change(screen.getByLabelText("판례 검색어"), { target: { value: "보증금 반환" } });
  fireEvent.click(screen.getByRole("button", { name: "물어보기" }));
  await screen.findByRole("region", { name: "검색 결과" });
  expect(marks()).toEqual(["보증금", "반환"]);
  const link = screen.getByRole("link", { name: "임대차보증금반환" });
  expect(link.getAttribute("href")).toBe("/cases/111?from=search");
  expect(sessionStorage.getItem("hz:sq")).toBe("보증금 반환");
});

test("F-003 검색에서 온 판례 상세는 판시사항·판결요지를 강조 영역에 두고 검색어를 하이라이트한다", async () => {
  sessionStorage.setItem("hz:sq", "보증금");
  search = new URLSearchParams("from=search");
  render(<CaseRoute />);
  const holding = await screen.findByRole("heading", { name: "판시사항" });
  expect(holding.closest("section")?.className).toMatch(/border-l-gold/);
  expect(marks().filter((m) => m === "보증금").length).toBeGreaterThanOrEqual(3);
});

test("F-003 검색에서 오지 않은 판례 상세는 예전 검색어를 하이라이트하지 않는다", async () => {
  sessionStorage.setItem("hz:sq", "보증금");
  render(<CaseRoute />);
  await screen.findByRole("heading", { name: "판시사항" });
  expect(marks()).toEqual([]);
});
