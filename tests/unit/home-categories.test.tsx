// DEC-028 홈 카테고리 버튼: 분야를 고르면 안내·문장 시작이 나오고, 보낸 질문에 그 분야를 이 기기에만 붙인다.
// 예시 카드는 예시 답변 화면으로 가는 링크라 질문 생성 API를 부르지 않는다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));

const INQ = "11111111-2222-3333-4444-555555555555";
const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes("/me/quota")) {
    return Response.json({
      data: { anonymous: true, used: 0, limit: 3, remaining: 3, loginRequired: false },
    });
  }
  if (url.endsWith("/api/v1/inquiries") && init?.method === "POST") {
    const { text } = JSON.parse(String(init.body));
    return Response.json(
      { data: { id: INQ, maskedText: text, piiConfirmationRequired: false, piiFindings: [] } },
      { status: 201 },
    );
  }
  return Response.json({});
});
vi.stubGlobal("fetch", fetchSpy);

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { default: Home } = await import("@/app/page");
const { CATEGORY_LIST, CATEGORY_GROUPS, CATEGORIES } = await import("@/lib/procedure/categories");
const { demoExamples } = await import("@/lib/demo/policy");

/** 가이드 토글을 펼치고 보기를 고른다 (2026-11-24 홈 가이드) */
const openGuide = (mode: "분야별 질문 틀" | "예시 답변" = "분야별 질문 틀") => {
  fireEvent.click(screen.getByRole("button", { name: /^가이드/ }));
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${mode}`) }));
  return screen.getByRole("region", { name: "가이드" });
};

const posts = () =>
  fetchSpy.mock.calls.filter(
    ([url, init]) => String(url).includes("/inquiries") && init?.method === "POST",
  );

test("홈 가이드는 처음에 접혀 있고, 토글을 누르면 펼쳐진다", () => {
  render(<Home />);
  const toggle = screen.getByRole("button", { name: /^가이드/ });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("tablist", { name: "분야 묶음" })).toBeNull();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("tablist", { name: "분야 묶음" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "접기" }));
  expect(screen.queryByRole("tablist", { name: "분야 묶음" })).toBeNull();
});

test("DEC-028·034 묶음 탭을 누르면 그 묶음의 카테고리 버튼이 보이고, 모든 카테고리가 어느 묶음에든 있다", () => {
  render(<Home />);
  const region = openGuide();
  const seen: string[] = [];
  for (const g of CATEGORY_GROUPS) {
    const tab = within(region).getByRole("tab", { name: new RegExp(`^${g.label}`) });
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    const panel = within(region).getByRole("tabpanel");
    expect(within(panel).getAllByRole("button")).toHaveLength(g.keys.length);
    for (const key of g.keys) {
      expect(within(panel).getByText(CATEGORIES[key].label)).toBeDefined();
      seen.push(key);
    }
  }
  expect([...seen].sort()).toEqual(CATEGORY_LIST.map((c) => c.key).sort());
});

test("DEC-028 카테고리를 고르면 안내·질문 틀이 나오고, 문장 시작을 누르면 입력란에 들어간다 (보내지는 않음)", () => {
  render(<Home />);
  openGuide();
  fireEvent.click(screen.getByRole("tab", { name: /^가족·학교/ }));
  fireEvent.click(screen.getByRole("button", { name: /가족·이혼/ }));
  expect(screen.getByRole("button", { name: /가족·이혼/ }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  const box = screen.getByLabelText("현재 상황") as HTMLTextAreaElement;
  expect(box.placeholder).toMatch(/양육비/);
  fireEvent.click(screen.getByRole("button", { name: "정해진 양육비를 받지 못하고 있어요." }));
  expect(box.value).toBe("정해진 양육비를 받지 못하고 있어요. ");
  expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "분야 선택 해제" }));
  expect(screen.queryByRole("button", { name: "분야 선택 해제" })).toBeNull();
});

test("DEC-028 카테고리를 고르고 보낸 질문은 지금처럼 질문 생성 API를 거치고, 분야는 이 기기에만 남긴다", async () => {
  render(<Home />);
  openGuide();
  fireEvent.click(screen.getByRole("button", { name: /소비자·환불/ }));
  const box = screen.getByLabelText("현재 상황");
  fireEvent.change(box, { target: { value: "온라인으로 산 옷을 환불받고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "정리 시작" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/inquiries/${INQ}`));
  // 서버에는 질문 본문만 보낸다 (카테고리는 분석 요청에서 정해진 값으로만)
  expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({
    text: "온라인으로 산 옷을 환불받고 싶어요",
  });
  expect(sessionStorage.getItem(`hz:c:${INQ}`)).toBe("consumer");
});

test("DEC-028 예시 카드는 예시 답변 화면 링크다 (질문 생성 API를 부르지 않는다), 모든 예시가 어느 묶음에든 있다", () => {
  render(<Home />);
  const feed = openGuide("예시 답변");
  const seen = new Set<string>();
  for (const tab of within(feed).getAllByRole("tab")) {
    fireEvent.click(tab);
    for (const link of within(within(feed).getByRole("tabpanel")).getAllByRole("link")) {
      seen.add(link.getAttribute("aria-label") ?? "");
    }
  }
  for (const e of demoExamples()) {
    expect(seen.has(`예시 답변 보기: ${e.question}`)).toBe(true);
    expect(e.href).toMatch(/^\/examples\/[a-z]+(-[a-z]+)*-\d{2}$/);
  }
  const first = within(feed).getAllByRole("link")[0];
  expect(first.getAttribute("href")).toMatch(/^\/examples\//);
  fireEvent.click(first);
  expect(posts()).toHaveLength(0);
});

test("DEC-028 고른 분야에 예시가 있으면 예시 답변 링크를 함께 보인다", () => {
  render(<Home />);
  openGuide();
  fireEvent.click(screen.getByRole("button", { name: /^임대차/ }));
  const links = screen.getAllByRole("link", { name: /^예시 답변 \d$/ });
  expect(links.map((l) => l.getAttribute("href"))).toEqual([
    "/examples/lease-01",
    "/examples/lease-02",
    "/examples/lease-03",
    // DeepSearch 예시 (DEC-041)
    "/examples/deep-lease-01",
  ]);
});
