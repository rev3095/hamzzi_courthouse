// 마이페이지 (DEC-035·056): Google 로그인과 관리자 모드(DEC-024)가 둘 다 켜져 있으면 둘 다 보인다.
// 로그인하면 Google 이름으로 인사하고 프로필 사진을 보인다. 이름·주소는 가상이다.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/me",
}));
const profile = vi.hoisted(() => ({
  value: { name: "가상이름", avatarUrl: "https://lh3.googleusercontent.com/a/x" } as {
    name: string | null;
    avatarUrl: string | null;
  },
}));
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string) =>
    String(url).includes("/me/quota")
      ? Response.json({
          data: {
            anonymous: false,
            used: null,
            limit: null,
            remaining: null,
            loginRequired: false,
            admin: true,
          },
        })
      : String(url).includes("/me/profile")
        ? Response.json({ data: profile.value })
        : Response.json({ data: { items: [] } }),
  ),
);

// 내 세션 목록은 이 테스트 범위 밖이라 비운다
vi.mock("@/components/MySessions", () => ({ MySessions: () => null }));

const { MyPage } = await import("@/components/me/MyPage");

afterEach(() => cleanup());

describe("마이페이지 관리자 + Google 로그인 (DEC-035·056)", () => {
  test("DEC-056 Google 이름으로 인사하고 프로필 사진·관리자 모드·로그아웃이 함께 보인다", async () => {
    render(<MyPage />);
    expect(await screen.findByRole("heading", { name: "가상이름님, 안녕하세요" })).toBeTruthy();
    expect(screen.getByTestId("me-avatar").getAttribute("src")).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    expect(screen.getByTestId("me-avatar").getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(screen.getByTestId("me-admin").textContent).toBe("관리자 모드");
    expect(screen.getByTestId("me-quota").textContent).toContain("질문 횟수 제한 없이");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "내 세션" })).toBeTruthy();
  });

  test("DEC-056 이름·사진이 없으면 '회원님'과 기본 아이콘", async () => {
    profile.value = { name: null, avatarUrl: null };
    render(<MyPage />);
    expect(await screen.findByRole("heading", { name: "회원님, 안녕하세요" })).toBeTruthy();
    expect(screen.queryByTestId("me-avatar")).toBeNull();
  });
});
