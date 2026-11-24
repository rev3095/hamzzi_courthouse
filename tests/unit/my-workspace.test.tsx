// 마이페이지 데스크톱형 배치 (DEC-056 ③): 사이드바(새 질문·세션 찾기·메뉴·날짜별 최근 세션·더보기·프로필) + 본문(종류 탭·한 페이지 10개·페이지 번호).
// 질문 문장·사건 이름은 가상이다. 서버 호출은 가짜 fetch.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/me" }));

const questions = Array.from({ length: 23 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  maskedText: `가상 질문 ${i + 1}`,
  status: "analyzed",
  createdAt: new Date(Date.now() - i * 3_600_000).toISOString(),
  followup: i === 0,
}));
const matters = [
  {
    id: "51c594e1-b1c6-4fe3-9d2a-1eed9ac61edd",
    title: "가상 임대차 사건",
    updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    counts: { docs: 2, parties: 1, issues: 1, notes: 3 },
  },
];
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/me/quota"))
      return Response.json({
        data: {
          anonymous: false,
          used: 1,
          limit: 10,
          remaining: 9,
          loginRequired: false,
          admin: false,
        },
      });
    if (u.includes("/me/profile"))
      return Response.json({ data: { name: "가상이름", avatarUrl: null } });
    if (u.includes("/me/inquiries")) return Response.json({ data: questions });
    if (u.includes("/matters")) return Response.json({ data: { items: matters } });
    if (u.includes("/me/seeds")) return Response.json({ data: { balance: 0, history: [] } });
    return Response.json({ data: {} });
  }),
);

const { MyPage } = await import("@/components/me/MyPage");

afterEach(() => {
  cleanup();
  push.mockClear();
});

const mainList = () => within(screen.getByTestId("my-sessions"));
const sidebar = () => within(screen.getByTestId("sidebar-sessions"));

describe("DEC-056 ③ 로그인한 마이페이지 — 사이드바 + 본문", () => {
  test("본문은 한 페이지 10개, 페이지 번호로 넘긴다", async () => {
    render(<MyPage />);
    expect(await screen.findByTestId("my-workspace")).toBeTruthy();
    await screen.findByTestId("my-sessions");
    expect(mainList().getAllByRole("button")).toHaveLength(10);
    const pager = screen.getByRole("navigation", { name: "세션 페이지" });
    expect(within(pager).getByRole("button", { name: "1쪽" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(pager).getByRole("button", { name: "3쪽" })).toBeTruthy();
    expect(within(pager).queryByRole("button", { name: "4쪽" })).toBeNull();
    fireEvent.click(within(pager).getByRole("button", { name: "3쪽" }));
    expect(mainList().getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("24개 중 21–24")).toBeTruthy();
  });

  test("종류 탭으로 사건만 보고, 사건을 누르면 그 사건이 열린다", async () => {
    render(<MyPage />);
    await screen.findByTestId("my-sessions");
    fireEvent.click(screen.getByRole("tab", { name: /사건/ }));
    const rows = mainList().getAllByRole("button");
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0]);
    expect(push).toHaveBeenCalledWith(`/matters?open=${matters[0].id}`);
  });

  test("사이드바는 날짜별로 처음 8개, 더보기로 8개씩 더", async () => {
    render(<MyPage />);
    await screen.findByTestId("my-sessions");
    expect(sidebar().getByText("오늘")).toBeTruthy();
    const items = () => sidebar().getAllByRole("button", { name: /가상/ });
    expect(items()).toHaveLength(8);
    fireEvent.click(sidebar().getByRole("button", { name: "더보기 (16개 더)" }));
    expect(items()).toHaveLength(16);
    fireEvent.click(sidebar().getByRole("button", { name: "더보기 (8개 더)" }));
    expect(items()).toHaveLength(24);
    expect(sidebar().getByRole("button", { name: "접기" })).toBeTruthy();
  });

  test("세션 찾기는 사이드바와 본문을 함께 거른다", async () => {
    render(<MyPage />);
    await screen.findByTestId("my-sessions");
    fireEvent.change(screen.getByRole("searchbox", { name: "세션 찾기" }), {
      target: { value: "임대차" },
    });
    expect(mainList().getAllByRole("button")).toHaveLength(1);
    expect(sidebar().getAllByRole("button", { name: /가상/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(mainList().getAllByRole("button")).toHaveLength(10);
  });

  test("메뉴로 설정·내 기록을 열고, 프로필에는 인사·남은 질문·로그아웃", async () => {
    render(<MyPage />);
    expect(await screen.findByRole("heading", { name: "가상이름님, 안녕하세요" })).toBeTruthy();
    expect(screen.getByTestId("me-quota").textContent).toContain("오늘 남은 질문 9/10");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    const menu = within(screen.getByRole("navigation", { name: "마이페이지" }));
    fireEvent.click(menu.getByRole("button", { name: "설정" }));
    expect(screen.getByRole("switch")).toBeTruthy();
    fireEvent.click(menu.getByRole("button", { name: "내 기록" }));
    expect(screen.getByRole("link", { name: "내 질문·결과 지우기 →" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 질문/ }).getAttribute("href")).toBe("/");
  });
});
