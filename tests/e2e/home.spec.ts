import { expect, test } from "@playwright/test";

test("홈 페이지가 열린다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("햄찌법원");
});
