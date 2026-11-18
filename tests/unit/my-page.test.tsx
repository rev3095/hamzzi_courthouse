// 마이페이지 (DEC-032): 헤더 프로필 아이콘 → /me, 로그인 자리(준비 중), 햄찌 안내 챗봇(DEC-030) 끄기 설정.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GUIDE_BOT_KEY } from "@/lib/client/prefs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/me",
}));
vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    Response.json({
      data: { anonymous: true, used: 1, limit: 5, remaining: 4, loginRequired: false },
    }),
  ),
);

const { MyPage } = await import("@/components/me/MyPage");
const { SiteHeader } = await import("@/components/SiteHeader");
const { GuideBot } = await import("@/components/guide/GuideBot");

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const launcher = () => screen.queryByRole("button", { name: /햄찌 안내 열기/ });

describe("마이페이지 (DEC-032)", () => {
  test("헤더 맨 오른쪽 프로필 아이콘이 마이페이지로 간다", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: /마이페이지/ });
    expect(link.getAttribute("href")).toBe("/me");
  });

  test("로그인 자리는 준비 중이라 눌리지 않고, 오늘 남은 질문을 보여 준다", async () => {
    render(<MyPage />);
    const login = screen.getByRole("button", { name: "로그인 (준비 중)" }) as HTMLButtonElement;
    expect(login.disabled).toBe(true);
    expect((await screen.findByTestId("me-quota")).textContent).toBe("오늘 남은 질문 4/5");
    // 개인정보 입력을 받지 않는다
    expect(document.querySelector("input, textarea")).toBeNull();
  });

  test("햄찌 안내 챗봇 스위치를 끄면 원형 버튼이 사라지고, 켜면 다시 보인다", () => {
    render(
      <>
        <MyPage />
        <GuideBot />
      </>,
    );
    const sw = screen.getByRole("switch", { name: "햄찌 안내 챗봇" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(launcher()).not.toBeNull();

    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem(GUIDE_BOT_KEY)).toBe("off");
    expect(launcher()).toBeNull();

    fireEvent.click(sw);
    expect(window.localStorage.getItem(GUIDE_BOT_KEY)).toBeNull();
    expect(launcher()).not.toBeNull();
  });

  test("이미 꺼 둔 브라우저에서는 챗봇이 보이지 않고, 다른 탭에서 켜면 바로 보인다", () => {
    window.localStorage.setItem(GUIDE_BOT_KEY, "off");
    render(<GuideBot />);
    expect(launcher()).toBeNull();
    act(() => {
      window.localStorage.removeItem(GUIDE_BOT_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: GUIDE_BOT_KEY }));
    });
    expect(launcher()).not.toBeNull();
  });
});
