// S-01 홈 (P6): 서비스 이름, AI 캐릭터 표기, 예시 질문 피드(DEC-012), 범위 밖 기능 숨김 (docs/07 결정 2)
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    Response.json({
      data: { anonymous: true, used: 1, limit: 3, remaining: 2, loginRequired: false },
    }),
  ),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { default: Home } = await import("@/app/page");
const { SiteHeader } = await import("@/components/SiteHeader");
const { demoExamples } = await import("@/lib/demo/policy");

test("홈에 서비스 이름이 보인다", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "햄찌법원" })).toBeDefined();
});

test("DEC-012 예시 질문이 가이드의 예시 답변에 모두 보이고, 평가용 태그는 보이지 않는다", () => {
  render(<Home />);
  fireEvent.click(screen.getByRole("button", { name: /^가이드/ }));
  fireEvent.click(screen.getByRole("button", { name: /^예시 답변/ }));
  const shown = new Set<string>();
  for (const tab of screen.getAllByRole("tab")) {
    fireEvent.click(tab);
    for (const el of screen.getByRole("tabpanel").querySelectorAll("a")) {
      shown.add(el.getAttribute("aria-label") ?? "");
    }
    expect(screen.queryByText("함정")).toBeNull();
  }
  for (const e of demoExamples()) expect(shown.has(`예시 답변 보기: ${e.question}`)).toBe(true);
  expect(screen.queryByText("함정")).toBeNull();
  expect(screen.queryByText("MVP")).toBeNull();
});

test("범위 밖 기능(변호사·소장·과금)은 홈에 없다 (절대 규칙 5)", () => {
  const { container } = render(<Home />);
  const text = container.textContent ?? "";
  for (const word of [
    "변호사 찾기",
    "혼자 소송",
    "변호사 비교",
    "소장 작성",
    "결제",
    "요금",
    "구독",
  ]) {
    expect(text).not.toContain(word);
  }
});

test("F-001 DEC-024 헤더에 오늘 남은 질문 수를 보여 준다", async () => {
  render(<SiteHeader />);
  expect((await screen.findByTestId("quota")).textContent).toBe("오늘 남은 질문 2/3");
});
