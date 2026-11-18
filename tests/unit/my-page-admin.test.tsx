// 마이페이지 (DEC-035): Google 로그인과 관리자 모드(DEC-024)가 둘 다 켜져 있으면 둘 다 보인다.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/me",
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
      : Response.json({ data: { items: [] } }),
  ),
);

// 내 질문 기록 목록은 이 테스트 범위 밖이라 비운다
vi.mock("@/components/MyInquiries", () => ({ MyInquiries: () => null }));

const { MyPage } = await import("@/components/me/MyPage");

afterEach(() => cleanup());

describe("마이페이지 관리자 + Google 로그인 (DEC-035)", () => {
  test("DEC-035 로그인 상태 제목과 관리자 모드 표시가 함께 나오고 로그아웃 버튼이 있다", async () => {
    render(<MyPage />);
    expect(
      await screen.findByRole("heading", { name: "Google 계정으로 로그인했어요" }),
    ).toBeTruthy();
    expect(screen.getByTestId("me-admin").textContent).toBe("관리자 모드");
    expect(screen.getByTestId("me-quota").textContent).toContain("질문 횟수 제한 없이");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
  });
});
