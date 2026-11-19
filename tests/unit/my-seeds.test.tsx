// 내 씨앗 (DEC-047): 로그인 사용자의 잔액·할인 가치·오늘 적립 횟수를 보여 주고, 할인 사용은 아직 없다고 알린다.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SEEDS } from "@/lib/community/policy";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const { MySeeds } = await import("@/components/me/MySeeds");

test("DEC-047 씨앗 잔액과 할인 가치, 오늘 적립 횟수를 보여 준다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          balance: 1250,
          won: 1250,
          redeemableWon: 0,
          redeemEnabled: false,
          today: { posts: 2, postsLimit: SEEDS.postsPerDay, comments: 3, commentsLimit: 10 },
        },
      }),
    ),
  );
  render(<MySeeds />);
  const balance = await screen.findByText("1,250개");
  expect(balance.parentElement?.textContent).toContain("할인 가치 1,250원");
  expect(screen.getByText(/오늘 씨앗을 받은 글 2\/5/)).toBeDefined();
  // 절대 규칙 5: 할인 사용은 과금 게이트 승인 전이라 쌓이기만 한다고 알린다
  expect(screen.getByText(/지금은 쌓이기만/)).toBeDefined();
});

test("DEC-047 응답이 없거나 모양이 다르면 빈 상태로 둔다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: { items: [] } })),
  );
  render(<MySeeds />);
  expect(await screen.findByText("아직 모은 씨앗이 없어요.")).toBeDefined();
});
