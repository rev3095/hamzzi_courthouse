// S-04 답변 요약형 결과 (F-014 데모 축소판 DEC-021, 문서 작성 게이트 DEC-022). 가짜 API — Claude·법제처를 부르지 않는다.
import { expect, test } from "@playwright/test";
import { demoExamples } from "../../lib/demo/policy";
import { INQ, mockApi, replayOf } from "./mock-api";

const lease = demoExamples().find((e) => e.id === "lease-01")!;

test("F-014 절차 타임라인: 호버·포커스로 팝업, Esc로 닫고 '이 단계 질문하기'는 입력란을 채운다", async ({
  page,
}) => {
  const calls = await mockApi(page, { analyze: { result: replayOf(lease.question) } });
  await page.goto(`/inquiries/${INQ}`);

  await expect(
    page.getByText("현재 위 내용을 기반으로 먼저 내용증명을 추천드립니다"),
  ).toBeVisible();
  await expect(page.getByText(/추천 첫 단계 · 내용증명 · 혼자 가능/)).toBeVisible();
  const steps = page.getByRole("list", { name: "절차 단계" });

  // 마우스 호버
  const order = steps.getByRole("button", { name: /지급명령 신청/ });
  await order.hover();
  await expect(order).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("group", { name: /지급명령 신청 준비할 것/ })).toBeVisible();

  // 키보드 포커스 → Esc
  await page.mouse.move(0, 0);
  const notice = steps.getByRole("button", { name: /내용증명/ });
  await notice.focus();
  const pop = page.getByRole("group", { name: /내용증명 준비할 것/ });
  await expect(pop).toBeVisible();
  await expect(notice).toHaveAttribute("aria-describedby", /.+/);
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await expect(notice).toBeFocused();

  // 이 단계 질문하기 → 입력란에 문장만 넣는다 (보내지 않음)
  await notice.click();
  await pop.getByRole("button", { name: "이 단계 질문하기" }).click();
  const box = page.getByRole("textbox", { name: "심층 질문하기" });
  await expect(box).toHaveValue(/내용증명을 보내려면/);
  await expect(box).toBeFocused();
  expect(calls.create).toHaveLength(0);

  // 확률·예상 기간 숫자는 없다 (절대 규칙 2·3)
  await expect(page.locator("article")).not.toContainText(/확률|승소 가능성|개월|예상 비용/);
});

test("DEC-022 '내용증명 바로 가기'는 법률 검토 전 안내와 공식 양식만 보여 준다", async ({
  page,
}) => {
  await mockApi(page, { analyze: { result: replayOf(lease.question) } });
  await page.goto(`/inquiries/${INQ}`);
  await page.getByRole("link", { name: /내용증명 바로 가기/ }).click();
  await page.waitForURL("**/documents/demand-letter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("내용증명 작성 안내");
  await expect(page.getByText("법률 검토 후 열릴 기능이에요")).toBeVisible();
  await expect(page.getByRole("link", { name: /인터넷우체국/ })).toHaveAttribute(
    "href",
    "https://www.epost.go.kr",
  );
  await expect(page.getByRole("button", { name: "양식 채우기" })).toHaveCount(0);
});

test("DEC-022 게이트 승인 전 문서 API는 403 FEATURE_GATED", async ({ request }) => {
  const res = await request.post("/api/v1/documents/demand-letter", { data: {} });
  expect(res.status()).toBe(403);
  expect((await res.json()).error.code).toBe("FEATURE_GATED");
});

test("모바일 375px에서 타임라인이 화면 밖으로 넘치지 않고 탭으로 팝업이 열린다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockApi(page, { analyze: { result: replayOf(lease.question) } });
  await page.goto(`/inquiries/${INQ}`);
  const steps = page.getByRole("list", { name: "절차 단계" });
  await expect(steps).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await steps.getByRole("button", { name: /강제집행/ }).click();
  const pop = page.getByRole("group", { name: /강제집행 준비할 것/ });
  await expect(pop).toBeVisible();
  const box = await pop.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
});
