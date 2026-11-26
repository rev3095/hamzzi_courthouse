// 법령 화면 /laws/[name] (DEC-074): 기본 탭은 쉬운 설명, 원문은 접어 둔다. API는 목으로 바꾼다 — 모델 호출 없음.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AI_NOTICE, SEARCH_NOTICE } from "@/lib/api/respond";
import {
  EASY_FALLBACK_NOTE,
  EASY_SOURCE_NOTE,
  EASY_VIRTUAL_NOTICE,
  EASY_VIRTUAL_TAG,
  type EasyLawView,
} from "@/lib/search/easy/types";

let search = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  useParams: () => ({ name: encodeURIComponent("의료기기법") }),
  useRouter: () => ({ push }),
}));

const api = vi.hoisted(() => ({ getLawView: vi.fn(), getStatuteCases: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  getLawView: api.getLawView,
  getStatuteCases: api.getStatuteCases,
}));

const { LawRoute } = await import("@/components/search/LawTools");

const ARTICLES = [
  {
    articleNo: "제1조",
    title: "목적",
    text: "제1조(목적) 이 법은 의료기기의 관리에 관한 사항을 규정함을 목적으로 한다.",
    effectiveFrom: "2025-01-01",
  },
  {
    articleNo: "제6조",
    title: "제조업의 허가 등",
    text: "제6조(제조업의 허가 등) ① 제조업허가를 받아야 한다.",
    effectiveFrom: "2025-01-01",
  },
];
const CASE = (id: string) => ({
  id,
  caseNo: `가상도${id}`,
  caseName: `의료기기법위반 ${id}`,
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr",
});
const VIEW: EasyLawView = {
  lawName: "의료기기법",
  easy: {
    lawName: "의료기기법",
    summary: ["의료기기를 관리하는 규칙을 정한 법이에요."],
    who: ["의료기기를 만드는 사업자"],
    keyPoints: [
      { title: "허가가 필요해요", body: "허가를 받도록 정하고 있어요.", articleNo: "제6조" },
    ],
    issues: [{ question: "허가 없이 만들면 어떻게 되나요?", articleNo: null }],
    virtualCases: [
      {
        title: "허가 없이 만든 경우",
        situation: "제조업자 A가 허가 없이 만들려고 해요.",
        lawSays: "이 법은 허가를 받도록 정하고 있어요.",
        articleNo: "제6조",
      },
    ],
  },
  articles: ARTICLES,
  realCases: [],
  ai: { used: true },
  notice: AI_NOTICE,
  virtualNotice: EASY_VIRTUAL_NOTICE,
  sourceNote: EASY_SOURCE_NOTE,
  sourceUrl: "https://www.law.go.kr/법령/의료기기법",
};
const ARTICLES_VIEW = {
  lawName: "의료기기법",
  articles: ARTICLES,
  notice: SEARCH_NOTICE,
  sourceUrl: "https://www.law.go.kr/법령/의료기기법",
};

let easyView: EasyLawView = VIEW;
beforeEach(() => {
  vi.clearAllMocks();
  search = new URLSearchParams();
  easyView = VIEW;
  api.getLawView.mockImplementation(async (_name: string, view: string) => ({
    ok: true,
    data: view === "easy" ? easyView : ARTICLES_VIEW,
  }));
  api.getStatuteCases.mockResolvedValue({ ok: true, data: { items: [] } });
});
afterEach(cleanup);

describe("DEC-074 법령 화면은 쉬운 설명이 먼저", () => {
  test("탭을 정하지 않으면 쉬운 설명이 열리고, 불러오는 동안 안내가 보인다", async () => {
    render(<LawRoute />);
    expect(screen.getByRole("tab", { name: "쉬운 설명" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("tab", { name: "원문·판례" }).getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(screen.getByText(/법령을 쉬운 말로 풀고 있어요/)).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "한눈에 보기" })).toBeTruthy();
    expect(api.getLawView).toHaveBeenCalledWith("의료기기법", "easy", undefined);
    for (const h of ["누구에게 해당하나요", "핵심 내용", "자주 문제 되는 쟁점", "실제 판례"])
      expect(screen.getByRole("heading", { name: h })).toBeTruthy();
    expect(screen.getByText("의료기기를 관리하는 규칙을 정한 법이에요.")).toBeTruthy();
  });

  test("AI 설명에는 AI 고지와 원문 확인 안내가 붙는다", async () => {
    render(<LawRoute />);
    await screen.findByRole("heading", { name: "한눈에 보기" });
    expect(screen.getAllByText(AI_NOTICE).length).toBeGreaterThan(0);
    expect(screen.getByText(EASY_SOURCE_NOTE)).toBeTruthy();
    expect(screen.queryByText(EASY_FALLBACK_NOTE)).toBeNull();
    // 확률처럼 읽히는 표시는 화면에 없다
    expect(document.body.textContent).not.toMatch(/%|퍼센트/);
  });

  test("원문은 접혀 있다: 근거 조문은 눌러야 그 자리에서 펼쳐진다", async () => {
    render(<LawRoute />);
    await screen.findByRole("heading", { name: "한눈에 보기" });
    expect(screen.queryByText(/제조업허가를 받아야 한다/)).toBeNull();
    const points = screen.getByRole("heading", { name: "핵심 내용" }).closest("section")!;
    const button = within(points).getByRole("button", { name: /근거: 제6조 원문 보기/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(within(points).getByText(/제조업허가를 받아야 한다/)).toBeTruthy();
    fireEvent.click(within(points).getByRole("button", { name: /근거: 제6조 원문 접기/ }));
    expect(screen.queryByText(/제조업허가를 받아야 한다/)).toBeNull();
  });

  test("원문 전체 보기: 펼쳐도 조문은 번호·제목만 보이고, 조문을 눌러야 본문이 나온다", async () => {
    render(<LawRoute />);
    await screen.findByRole("heading", { name: "원문 전체 보기" });
    expect(screen.queryByRole("button", { name: "모두 펼치기" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원문 펼치기" }));
    const article = screen.getByRole("button", { name: /^제6조\s*제조업의 허가 등/ });
    expect(article.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/이 법은 의료기기의 관리에 관한/)).toBeNull();
    fireEvent.click(article);
    expect(screen.getByText(/제조업허가를 받아야 한다/)).toBeTruthy();
    expect(screen.queryByText(/이 법은 의료기기의 관리에 관한/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    expect(screen.getByText(/이 법은 의료기기의 관리에 관한/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(screen.queryByText(/제조업허가를 받아야 한다/)).toBeNull();
  });

  test("실제 판례가 모자라면 가상 사례를 다른 모양·꼬리표로 보인다", async () => {
    render(<LawRoute />);
    await screen.findByRole("heading", { name: "실제 판례" });
    expect(screen.getByText("법제처에서 찾은 판례")).toBeTruthy();
    expect(screen.getByText(/찾은 판례가 없어요/)).toBeTruthy();
    const virtual = screen.getByTestId("easy-virtual");
    expect(within(virtual).getByText("이해를 돕는 가상 사례 (AI가 만듦)")).toBeTruthy();
    expect(within(virtual).getByText(EASY_VIRTUAL_TAG)).toBeTruthy();
    expect(within(virtual).getByText(EASY_VIRTUAL_NOTICE)).toBeTruthy();
    expect(within(virtual).getByText(AI_NOTICE)).toBeTruthy();
    expect(within(virtual).getByText(EASY_VIRTUAL_TAG).closest("li")!.className).toMatch(
      /border-dashed/,
    );
    // 가상 사례는 판례 화면으로 이어지지 않는다
    expect(within(virtual).queryByRole("link")).toBeNull();
  });

  test("실제 판례가 충분하면 가상 사례·꼬리표를 보이지 않고 판례 화면으로 잇는다", async () => {
    easyView = { ...VIEW, realCases: [CASE("11"), CASE("12")], virtualNotice: null };
    render(<LawRoute />);
    await screen.findByRole("heading", { name: "실제 판례" });
    expect(screen.getByRole("link", { name: /의료기기법위반 11/ }).getAttribute("href")).toBe(
      "/cases/11",
    );
    expect(screen.queryByTestId("easy-virtual")).toBeNull();
    expect(screen.queryByText(EASY_VIRTUAL_TAG)).toBeNull();
    expect(screen.queryByText("이해를 돕는 가상 사례 (AI가 만듦)")).toBeNull();
  });

  test("AI 설명을 못 만들면 조문 제목 정리와 부드러운 안내를 보인다 (AI 고지 없음)", async () => {
    easyView = {
      ...VIEW,
      easy: { ...VIEW.easy, who: [], issues: [], virtualCases: [] },
      ai: { used: false, reason: "free_mode" },
      notice: SEARCH_NOTICE,
      virtualNotice: null,
      sourceNote: null,
    };
    render(<LawRoute />);
    await screen.findByRole("heading", { name: "한눈에 보기" });
    expect(screen.getByText(EASY_FALLBACK_NOTE)).toBeTruthy();
    expect(screen.getByText(SEARCH_NOTICE)).toBeTruthy();
    expect(screen.queryByText(AI_NOTICE)).toBeNull();
    expect(screen.queryByText(EASY_SOURCE_NOTE)).toBeNull();
    expect(screen.queryByRole("heading", { name: "누구에게 해당하나요" })).toBeNull();
  });
});

describe("DEC-074 원문·판례 탭", () => {
  test("?tab=articles는 원문을 열고, 조문은 접힌 채로 보인다", async () => {
    search = new URLSearchParams("tab=articles");
    render(<LawRoute />);
    expect(screen.getByRole("tab", { name: "원문·판례" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    const article = await screen.findByRole("button", { name: /^제6조\s*제조업의 허가 등/ });
    expect(api.getLawView).toHaveBeenCalledWith("의료기기법", "articles", undefined);
    expect(article.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/제조업허가를 받아야 한다/)).toBeNull();
    expect(
      screen.getByRole("complementary", { name: "지금 보는 조문의 판례" }).textContent,
    ).toContain("제1조 (목적)");
    // 조문을 펼치면 옆 판례 패널이 그 조문을 따라간다
    fireEvent.click(article);
    expect(screen.getByText(/제조업허가를 받아야 한다/)).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "지금 보는 조문의 판례" }).textContent,
    ).toContain("제6조 (제조업의 허가 등)");
  });

  test("탭을 누르면 주소의 tab이 바뀐다. 모르는 tab 값은 쉬운 설명으로 연다", async () => {
    search = new URLSearchParams("tab=nope");
    render(<LawRoute />);
    expect(screen.getByRole("tab", { name: "쉬운 설명" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "원문·판례" }));
    expect(push).toHaveBeenCalledWith(`/laws/${encodeURIComponent("의료기기법")}?tab=articles`);
    await screen.findByRole("heading", { name: "한눈에 보기" });
  });
});
