// F-003·F-004 판례 검색 화면 E2E (API 가짜). 질문 3회와 별개, 관련도 점수 없음, 검색 고지·법제처 원문 링크.
import { expect, test } from "@playwright/test";
import { SEARCH_NOTICE } from "../../lib/api/respond";
import { CASE_SEARCH_NOTE } from "../../lib/search/browse";
import { mockApi } from "./mock-api";

const CASE = {
  id: "622971",
  caseNo: "2026다201978",
  caseName: "보증금반환",
  court: "대법원",
  decidedAt: "2026-06-24",
  sourceUrl: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=622971",
};

test("판례 검색 → 상세 → 참조조문", async ({ page }) => {
  await mockApi(page);
  const queries: string[] = [];
  await page.route("**/api/v1/cases", (route) => {
    queries.push((route.request().postDataJSON() as { q: string }).q);
    return route.fulfill({
      json: {
        data: {
          items: [CASE],
          outcome: "grounded",
          searchScopeNote: CASE_SEARCH_NOTE,
          notice: SEARCH_NOTICE,
        },
      },
    });
  });
  await page.route("**/api/v1/cases/622971", (route) =>
    route.fulfill({
      json: {
        data: {
          ...CASE,
          holdingSummary: "요지",
          sections: [{ section: "판시사항", text: "임대차 종료 후 보증금 반환" }],
          fromBody: false,
          citedStatutes: [{ raw: "민법 제536조", id: "민법:제536조" }],
          notice: SEARCH_NOTICE,
        },
      },
    }),
  );
  await page.route(/\/api\/v1\/statutes\//, (route) =>
    route.fulfill({
      json: {
        data: {
          id: "민법:제536조",
          lawName: "민법",
          articleNo: "제536조",
          articleTitle: "동시이행의 항변권",
          effectiveFrom: "2015-02-03",
          sourceUrl: "https://www.law.go.kr",
          body: "쌍무계약의 당사자 일방은 …",
          isCurrent: true,
          notice: SEARCH_NOTICE,
        },
      },
    }),
  );

  await page.goto("/");
  await page.getByRole("link", { name: "판례 검색" }).click();
  await page.getByRole("textbox", { name: "판례 검색어" }).fill("보증금 반환");
  await page.keyboard.press("Enter");
  // 검색어는 주소에 남지 않는다 (F-007)
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByText(SEARCH_NOTICE)).toBeVisible();
  await expect(page.getByText("유사도")).toHaveCount(0);
  expect(queries).toEqual(["보증금 반환"]);
  // 검색은 질문 횟수를 쓰지 않는다
  await expect(page.getByTestId("quota")).toHaveText("남은 질문 3/3");

  await page.getByRole("link", { name: "보증금반환" }).click();
  await expect(page.getByRole("heading", { name: "판시사항" })).toBeVisible();
  await expect(page.getByRole("link", { name: "법제처에서 판결 원문 보기 →" })).toHaveAttribute(
    "href",
    CASE.sourceUrl,
  );
  await expect(page.getByRole("link", { name: "민법 제536조" })).toHaveAttribute(
    "href",
    /asOf=2026-06-24$/,
  );
  await page.getByRole("link", { name: "민법 제536조" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "민법 제536조 (동시이행의 항변권)",
  );
  await expect(page.getByText("현재 시행 중", { exact: false })).toBeVisible();
});

test("개인정보로 보이는 검색어·레이트 리밋 안내", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/v1/cases", (route) => {
    const q = (route.request().postDataJSON() as { q: string }).q;
    return q !== "a"
      ? route.fulfill({
          status: 400,
          json: {
            error: {
              code: "VALIDATION_ERROR",
              message: "x",
              details: { field: "q", reason: "personal_info" },
              requestId: "r",
            },
          },
        })
      : route.fulfill({
          status: 429,
          json: {
            error: {
              code: "RATE_LIMITED",
              message: "x",
              details: { reason: "search_hourly" },
              requestId: "r",
            },
          },
        });
  });
  await page.goto("/search");
  const box = page.getByRole("textbox", { name: "판례 검색어" });
  await box.fill("010-1234-5678");
  await page.keyboard.press("Enter");
  await expect(page.locator("main").getByRole("alert")).toContainText("법제처로 보내지 않아요");
  await box.fill("a");
  await page.keyboard.press("Enter");
  await expect(page.locator("main").getByRole("alert")).toContainText("1시간 안에");
});
