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
const { CATEGORY_LIST } = await import("@/lib/procedure/categories");
const { demoExamples } = await import("@/lib/demo/policy");

const posts = () =>
  fetchSpy.mock.calls.filter(
    ([url, init]) => String(url).includes("/inquiries") && init?.method === "POST",
  );

test("DEC-028 카테고리 버튼이 모두 보인다", () => {
  render(<Home />);
  const group = screen.getByRole("region", { name: "어떤 일인가요?" });
  for (const c of CATEGORY_LIST) {
    expect(within(group).getByRole("button", { name: new RegExp(c.label) })).toBeDefined();
  }
});

test("DEC-028 카테고리를 고르면 안내·질문 틀이 나오고, 문장 시작을 누르면 입력란에 들어간다 (보내지는 않음)", () => {
  render(<Home />);
  fireEvent.click(screen.getByRole("button", { name: /가족·이혼/ }));
  expect(screen.getByRole("button", { name: /가족·이혼/ }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  const box = screen.getByLabelText("질문") as HTMLTextAreaElement;
  expect(box.placeholder).toMatch(/양육비/);
  fireEvent.click(screen.getByRole("button", { name: "정해진 양육비를 받지 못하고 있어요." }));
  expect(box.value).toBe("정해진 양육비를 받지 못하고 있어요. ");
  expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "분야 선택 해제" }));
  expect(screen.queryByRole("button", { name: "분야 선택 해제" })).toBeNull();
});

test("DEC-028 카테고리를 고르고 보낸 질문은 지금처럼 질문 생성 API를 거치고, 분야는 이 기기에만 남긴다", async () => {
  render(<Home />);
  fireEvent.click(screen.getByRole("button", { name: /소비자·환불/ }));
  const box = screen.getByLabelText("질문");
  fireEvent.change(box, { target: { value: "온라인으로 산 옷을 환불받고 싶어요" } });
  fireEvent.click(screen.getByRole("button", { name: "물어보기" }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith(`/inquiries/${INQ}`));
  // 서버에는 질문 본문만 보낸다 (카테고리는 분석 요청에서 정해진 값으로만)
  expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({
    text: "온라인으로 산 옷을 환불받고 싶어요",
  });
  expect(sessionStorage.getItem(`hz:c:${INQ}`)).toBe("consumer");
});

test("DEC-028 예시 카드는 예시 답변 화면 링크다 (질문 생성 API를 부르지 않는다)", () => {
  render(<Home />);
  const feed = screen.getByRole("region", { name: "예시 답변 바로 보기" });
  for (const e of demoExamples()) {
    const link = within(feed).getByRole("link", { name: `예시 답변 보기: ${e.question}` });
    expect(link.getAttribute("href")).toBe(e.href);
    expect(e.href).toMatch(/^\/examples\/[a-z]+-\d{2}$/);
  }
  fireEvent.click(within(feed).getAllByRole("link")[0]);
  expect(posts()).toHaveLength(0);
});

test("DEC-028 고른 분야에 예시가 있으면 예시 답변 링크를 함께 보인다", () => {
  render(<Home />);
  fireEvent.click(screen.getByRole("button", { name: /임대차/ }));
  const links = screen.getAllByRole("link", { name: /^예시 답변 \d$/ });
  expect(links.map((l) => l.getAttribute("href"))).toEqual([
    "/examples/lease-01",
    "/examples/lease-02",
    "/examples/lease-03",
  ]);
});
