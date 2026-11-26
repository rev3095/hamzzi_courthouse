// F-003 판례 검색 화면 — 자주 찾는 검색어 버튼, 결과 건수·카드, 결과 없음 안내. 검색 API는 목으로 바꾼다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const api = vi.hoisted(() => ({ searchCases: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  // DEC-076 물어보기 AI 답은 이 화면 테스트에서 끝나지 않은 채로 둔다 (목록만 본다)
  getSearchAnswer: () => new Promise(() => {}),
  searchCases: api.searchCases,
}));

const { SearchView, QUICK_QUERIES } = await import("@/components/search/SearchView");

const NOTICE = "법제처 검색 결과 · AI 생성 아님";
const CASE = {
  id: "111",
  caseNo: "가상다1",
  caseName: "보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

test("F-003 자주 찾는 검색어를 누르면 바로 검색하고, 건수·법원·선고일·사건번호를 카드로 보인다", async () => {
  api.searchCases.mockResolvedValue({
    ok: true,
    data: { items: [CASE], outcome: "grounded", searchScopeNote: "범위 안내", notice: NOTICE },
  });
  render(<SearchView />);
  fireEvent.click(screen.getByRole("button", { name: QUICK_QUERIES[0] }));
  expect(api.searchCases).toHaveBeenCalledWith(QUICK_QUERIES[0]);
  expect((await screen.findByTestId("result-count")).textContent).toBe("1건");
  const card = screen.getByRole("link", { name: "보증금반환" }).closest("li")!;
  expect(within(card).getByText("대법원")).toBeDefined();
  expect(within(card).getByText("선고 2021.03.11")).toBeDefined();
  expect(within(card).getByText("가상다1")).toBeDefined();
  expect(within(card).getByRole("link", { name: "보증금반환" }).getAttribute("href")).toBe("/cases/111?from=search");
  expect(screen.getByText(NOTICE)).toBeDefined();
  expect(screen.queryByText(/유사도|관련도/)).toBeNull();
});

test("결과가 없으면 다른 검색어 버튼을 보여 준다", async () => {
  api.searchCases.mockResolvedValue({
    ok: true,
    data: { items: [], outcome: "no_result_in_scope", searchScopeNote: "", notice: NOTICE },
  });
  render(<SearchView />);
  fireEvent.change(screen.getByRole("textbox", { name: "판례 검색어" }), {
    target: { value: "없는말" },
  });
  fireEvent.click(screen.getByRole("button", { name: QUICK_QUERIES[1] }));
  expect(await screen.findByText(/로 찾은 판례가 없어요/)).toBeDefined();
  expect((await screen.findByTestId("result-count")).textContent).toBe("0건");
});
