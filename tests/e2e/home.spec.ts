// P6 화면 E2E (API는 가짜 — tests/e2e/mock-api.ts). 홈 → 질문 → 개인정보 확인 → 분석 → 결과 탭.
import { expect, test } from "@playwright/test";
import { AI_NOTICE } from "../../lib/api/respond";
import { demoExamples } from "../../lib/demo/policy";
import { INQ, mockApi, noResult, replayOf, searchOnly } from "./mock-api";

test("홈 페이지가 열린다", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("햄찌법원");
  await expect(page.getByTestId("quota")).toHaveText("남은 질문 3/3");
  await expect(page.getByText("변호사 찾기")).toHaveCount(0);
});

test("DEC-012·DEC-015 예시 질문을 누르면 재생 결과가 보인다 (AI 고지·출처·탭)", async ({
  page,
}) => {
  const calls = await mockApi(page);
  const ex = demoExamples()[0];
  const result = replayOf(ex.question);
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(ex.question.slice(0, 12)) }).click();
  await page.waitForURL(`**/inquiries/${INQ}`);

  await expect(page.getByText(AI_NOTICE, { exact: true })).toBeVisible();
  await expect(page.getByText(`“${ex.question}”`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("문제로 보여요");
  await expect(page.getByText("검증됨").first()).toBeVisible();
  await expect(page.getByText("출처: 법제처 국가법령정보센터")).toBeVisible();
  expect(calls.create[0]).toEqual({ text: ex.question });

  await page.getByRole("tab", { name: /^판례/ }).click();
  await expect(page.getByText(result.cases[0].caseNo).first()).toBeVisible();
  await page.getByRole("tab", { name: /^법령/ }).click();
  await expect(page.getByText(result.articles[0].lawName).first()).toBeVisible();
  await page.getByRole("tab", { name: "검증" }).click();
  await expect(
    page.getByText(`인용 ${result.recheck.items.length}건을 법제처에서 다시 조회했어요`),
  ).toBeVisible();
  await expect(page.getByTestId("quota")).toHaveText("남은 질문 2/3");
});

test("F-007 개인정보가 보이면 가린 문장을 확인한 뒤 분석한다", async ({ page }) => {
  const calls = await mockApi(page, {
    create: () => ({
      status: 201,
      body: {
        data: {
          id: INQ,
          status: "draft",
          piiFindings: [{ type: "phone", count: 1 }],
          maskedText: "[전화번호]로 연락해도 받지 않아요. 빌려준 돈을 받을 수 있나요?",
          piiConfirmationRequired: true,
        },
      },
    }),
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "질문" })
    .fill("010-1234-5678로 연락해도 받지 않아요. 빌려준 돈을 받을 수 있나요?");
  await page.getByRole("button", { name: "물어보기" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("개인정보로 보이는 내용을 가렸어요");
  await expect(dialog).toContainText("전화번호 1");
  await expect(dialog).not.toContainText("010-1234-5678");
  await dialog.getByRole("button", { name: "이대로 분석하기" }).click();
  await page.waitForURL(`**/inquiries/${INQ}`);
  expect(calls.confirm).toBe(1);
  // 결과 화면에는 마스킹본만 보인다
  await expect(
    page.getByText("“[전화번호]로 연락해도 받지 않아요. 빌려준 돈을 받을 수 있나요?”"),
  ).toBeVisible();
});

test("F-007 AC2 민감정보는 동의해야 다시 보낸다", async ({ page }) => {
  const calls = await mockApi(page, {
    create: (b) =>
      b.sensitiveConsent
        ? {
            status: 201,
            body: {
              data: {
                id: INQ,
                status: "draft",
                piiFindings: [],
                maskedText: "질문",
                piiConfirmationRequired: false,
              },
            },
          }
        : {
            status: 409,
            body: {
              error: {
                code: "CONSENT_REQUIRED",
                message: "동의가 필요합니다.",
                details: { kind: "sensitive_info", categories: ["health"] },
                requestId: "req-2",
              },
            },
          },
  });
  await page.goto("/");
  await page.getByRole("textbox", { name: "질문" }).fill("치료 중인 병 때문에 해고됐어요");
  await page.getByRole("button", { name: "물어보기" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("건강 정보");
  await expect(dialog.getByRole("button", { name: "동의하고 계속" })).toBeDisabled();
  await dialog.getByLabel("민감정보 처리에 동의합니다 (필수)").check();
  await dialog.getByRole("button", { name: "동의하고 계속" }).click();
  await page.waitForURL(`**/inquiries/${INQ}`);
  expect(calls.create.map((c) => c.sensitiveConsent)).toEqual([undefined, true]);
});

test("DEC-010 4번째 질문은 로그인 안내", async ({ page }) => {
  await mockApi(page, {
    quota: { used: 3, loginRequired: true },
    create: () => ({
      status: 401,
      body: {
        error: { code: "LOGIN_REQUIRED", message: "계속하려면 로그인해 주세요.", requestId: "r" },
      },
    }),
  });
  await page.goto("/");
  await expect(
    page.getByText("무료 질문 3번을 모두 썼어요. 로그인하면 계속 물어볼 수 있어요."),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "질문" }).fill("보증금을 못 받았어요");
  await page.getByRole("button", { name: "물어보기" }).click();
  await expect(page.getByRole("dialog")).toContainText("무료 질문 3번을 모두 썼어요");
});

test("F-006 AC2 법제처 연결 실패는 결과 없음과 구분하고 예시 질문으로 안내한다", async ({
  page,
}) => {
  await mockApi(page, {
    analyze: {
      error: {
        code: "SEARCH_UPSTREAM_FAILED",
        message: "검색 중 오류가 발생했습니다.",
        requestId: "req-9",
      },
    },
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "질문" })
    .fill("층간소음 때문에 너무 힘들어요. 어떻게 해야 하나요?");
  await page.getByRole("button", { name: "물어보기" }).click();
  await page.waitForURL(`**/inquiries/${INQ}`);
  await expect(page.getByText("앗, 서고 문이 잠깐 잠겼어요")).toBeVisible();
  await expect(page.getByText("지금은 예시 질문으로 체험할 수 있어요")).toBeVisible();
  await expect(page.getByText("이번 시도는 질문 횟수에 세지 않아요")).toBeVisible();
  await expect(page.getByText("오류 번호 req-9")).toBeVisible();
  await page.getByRole("link", { name: "예시 질문 보기" }).click();
  await expect(page.locator("#examples")).toBeVisible();
});

test("DEC-015 무료 모드 자유 질문은 AI 답변 없이 검색 결과만", async ({ page }) => {
  await mockApi(page, { analyze: { result: searchOnly } });
  await page.goto(`/inquiries/${INQ}`);
  await expect(page.getByText("AI 캐릭터 · AI 답변 없이 검색 결과만")).toBeVisible();
  await expect(page.getByRole("tab", { name: "법령 1" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("관련될 수 있음")).toBeVisible();
  await page.getByRole("tab", { name: "답변" }).click();
  await expect(page.getByText("AI 답변 없이 검색 결과만 보여 드려요")).toBeVisible();
});

test("F-003 AC2 결과 없음은 판례 부재를 단정하지 않는다", async ({ page }) => {
  await mockApi(page, { analyze: { result: noResult } });
  await page.goto(`/inquiries/${INQ}`);
  await expect(page.getByText("현재 검색 범위에서 비슷한 판례를 찾지 못했어요")).toBeVisible();
  await expect(page.getByText("판례가 없다는 뜻은 아니에요", { exact: false })).toBeVisible();
  await expect(page.getByText(AI_NOTICE, { exact: true })).toBeVisible();
});

test("F-002 이어 묻기는 앞 질문 id를 함께 보낸다", async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto(`/inquiries/${INQ}`);
  await page
    .getByRole("textbox", { name: "이어서 물어보기" })
    .fill("차용증이 없어도 받을 수 있나요?");
  await page.getByRole("button", { name: "물어보기" }).click();
  await expect.poll(() => calls.create.length).toBe(1);
  expect(calls.create[0]).toEqual({
    text: "차용증이 없어도 받을 수 있나요?",
    parentInquiryId: INQ,
  });
});
