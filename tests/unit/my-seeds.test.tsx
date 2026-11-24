// 내 씨앗 (DEC-047): 로그인 사용자의 잔액·할인 가치·오늘 적립 횟수를 보여 주고, 할인 사용은 아직 없다고 알린다.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SEEDS } from "@/lib/community/policy";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const { MySeeds } = await import("@/components/me/MySeeds");

test("DEC-047 씨앗 잔액과 오늘 적립 횟수를 보여 준다 (DEC-055 할인 가치 없음)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          balance: 1250,
          today: { posts: 2, postsLimit: SEEDS.postsPerDay, comments: 3, commentsLimit: 10 },
        },
      }),
    ),
  );
  render(<MySeeds />);
  const balance = await screen.findByText("1,250개");
  expect(balance.parentElement?.textContent).not.toContain("원");
  expect(screen.getByText(/오늘 씨앗을 받은 글 2\/5/)).toBeDefined();
  // DEC-055: 전면 무료라 돈·할인으로 바꾸지 않는다고 알린다
  expect(screen.getByText(/돈이나 할인으로 바꾸지 않아요/)).toBeDefined();
});

test("DEC-047 응답이 없거나 모양이 다르면 빈 상태로 둔다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: { items: [] } })),
  );
  render(<MySeeds />);
  expect(await screen.findByText("아직 모은 씨앗이 없어요.")).toBeDefined();
});
