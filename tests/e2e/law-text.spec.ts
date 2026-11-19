// 법령 전문·판례 /laws/[name] E2E (DEC-029, API 가짜). 조문을 따라 내려가면 옆 판례 패널이 그 조문의 판례로 바뀐다.
import { expect, test } from "@playwright/test";
import { SEARCH_NOTICE } from "../../lib/api/respond";
import { mockApi } from "./mock-api";

const LAW = "주택임대차보호법";
const ARTICLES = Array.from({ length: 12 }, (_, i) => ({
  articleNo: `제${i + 1}조`,
  title: `가상 제목 ${i + 1}`,
  text: Array.from({ length: 10 }, (_, k) => `제${i + 1}조 본문 ${k + 1}번째 줄`).join("\n"),
  effectiveFrom: "2023-04-18",
}));

test("법령 전문을 내려 읽으면 보고 있는 조문의 판례로 패널이 바뀐다", async ({ page }) => {
  await mockApi(page);
  await page.route(/\/api\/v1\/laws\/[^/]+\/articles/, (route) =>
    route.fulfill({
      json: {
        data: {
          lawName: LAW,
          articles: ARTICLES,
          sourceUrl: "https://www.law.go.kr",
          notice: SEARCH_NOTICE,
        },
      },
    }),
  );
  const asked: string[] = [];
  await page.route(/\/api\/v1\/statutes\/[^/]+\/cases/, (route) => {
    const id = decodeURIComponent(decodeURIComponent(route.request().url().split("/").at(-2)!));
    const no = id.split(":")[1];
    asked.push(no);
    return route.fulfill({
      json: {
        data: {
          items: [
            {
              id: String(1000 + asked.length),
              caseNo: `가상다${no}`,
              caseName: `${no}가 나오는 판례`,
              court: "대법원",
              decidedAt: "2021-03-11",
              sourceUrl: "https://www.law.go.kr",
            },
          ],
          outcome: "grounded",
          searchScopeNote: "범위 안내",
          notice: SEARCH_NOTICE,
        },
      },
    });
  });

  await page.goto(`/laws/${encodeURIComponent(LAW)}`);
  const panel = page.getByRole("complementary", { name: "지금 보는 조문의 판례" });
  await expect(panel.getByRole("link", { name: /제1조가 나오는 판례/ })).toBeVisible();

  await page.locator('[data-article="제8조"]').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 400);
  await expect(panel.getByRole("link", { name: /제(7|8|9)조가 나오는 판례/ })).toBeVisible();
  // 빠르게 지나친 조문까지 모두 조회하지는 않는다
  expect(asked.length).toBeLessThan(ARTICLES.length);
  await expect(page.getByText(SEARCH_NOTICE)).toBeVisible();

  if (process.env.SHOT_DIR) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOT_DIR}/law-text.png` });
  }
});
