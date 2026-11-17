// 판례 리서치 /research E2E (DEC-029, API 가짜). 검색 → 목록 → 옆 미리보기 → 보관함, 헤더·검색 화면에서 들어가는 길.
import { expect, test } from "@playwright/test";
import { SEARCH_NOTICE } from "../../lib/api/respond";
import { CASE_SEARCH_NOTE } from "../../lib/search/browse";
import { mockApi } from "./mock-api";

const item = (id: string, caseName: string, court: string, decidedAt: string, caseNo: string) => ({
  id,
  caseName,
  court,
  decidedAt,
  caseNo,
  sourceUrl: `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${id}`,
});
const ITEMS = [
  item("622971", "보증금반환", "대법원", "2026-06-24", "2026다201978"),
  item("600001", "임대차보증금", "서울고등법원", "2024-02-08", "2023나2012345"),
  item("600002", "건물인도등", "대법원", "2021-03-11", "2020다12345"),
];

test("판례 리서치: 검색 → 미리보기 → 보관함", async ({ page }) => {
  await mockApi(page);
  const queries: string[] = [];
  await page.route("**/api/v1/cases", (route) => {
    queries.push((route.request().postDataJSON() as { q: string }).q);
    return route.fulfill({
      json: {
        data: {
          items: ITEMS,
          outcome: "grounded",
          searchScopeNote: CASE_SEARCH_NOTE,
          notice: SEARCH_NOTICE,
        },
      },
    });
  });
  await page.route(/\/api\/v1\/cases\/\d+$/, (route) => {
    const id = route.request().url().split("/").pop()!;
    const hit = ITEMS.find((i) => i.id === id)!;
    return route.fulfill({
      json: {
        data: {
          ...hit,
          holdingSummary: "요지",
          sections: [
            {
              section: "판시사항",
              text: `임대차가 끝난 뒤 보증금 반환 의무의 범위 (${hit.caseNo})`,
            },
            {
              section: "판결요지",
              text: "임차인은 보증금을 돌려받을 때까지 목적물을 점유할 수 있다.",
            },
          ],
          fromBody: false,
          citedStatutes: [{ raw: "민법 제536조", id: "민법:제536조" }],
          notice: SEARCH_NOTICE,
        },
      },
    });
  });

  await page.goto("/search");
  await page.getByRole("link", { name: /판례 리서치 화면으로 보기/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "판례 리서치" })).toBeVisible();

  await page.getByRole("textbox", { name: "리서치 검색어" }).fill("보증금 반환");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByTestId("research-count")).toHaveText("3건");
  expect(queries).toEqual(["보증금 반환"]);
  // 검색어는 주소에 남기지 않는다 (F-007)
  expect(page.url()).not.toContain("%EB%B3%B4%EC%A6%9D");

  const preview = page.getByRole("article", { name: "미리보기" });
  await expect(preview.getByText("2026다201978", { exact: false }).first()).toBeVisible();
  await expect(preview.getByRole("heading", { name: "판결요지" })).toBeVisible();
  await expect(page.getByText(SEARCH_NOTICE)).toBeVisible();
  await expect(page.getByText("유사도")).toHaveCount(0);

  await page.getByRole("button", { name: /임대차보증금/ }).click();
  await expect(preview.getByText("2023나2012345", { exact: false }).first()).toBeVisible();
  await preview.getByRole("button", { name: "보관함에 담기" }).click();
  await expect(page.getByRole("region", { name: "보관함" })).toContainText(
    "서울고등법원 2024. 2. 8. 선고 2023나2012345",
  );

  await page.getByRole("checkbox", { name: /대법원/ }).check();
  await expect(page.getByTestId("research-count")).toHaveText("2/3건");

  if (process.env.SHOT_DIR) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOT_DIR}/research.png` });
    await page.goto("/search");
    await page.screenshot({ path: `${process.env.SHOT_DIR}/search.png` });
  }
});
