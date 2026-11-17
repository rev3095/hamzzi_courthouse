// DEC-028 예시 답변 화면 /examples/[id]: 저장된 예시 답변을 질문 생성·분석·횟수 API 없이 바로 보여 준다.
// 화면은 실제 결과 화면과 같은 ResultPanel(AI 고지·타임라인·근거·법제처 출처)을 쓴다 (절대 규칙 1·6).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AI_NOTICE } from "@/lib/api/respond";

const fetchSpy = vi.fn(async () => Response.json({}));
vi.stubGlobal("fetch", fetchSpy);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { default: ExamplePage, generateStaticParams } = await import("@/app/examples/[id]/page");
const { demoExamples, exampleSlug } = await import("@/lib/demo/policy");

const renderPage = async (id: string) =>
  render(await ExamplePage({ params: Promise.resolve({ id }) } as PageProps<"/examples/[id]">));

describe("DEC-028 예시 답변 즉시 보기", () => {
  test("예시 10건이 모두 정적 주소를 갖고, 평가용 이름(trap)은 주소에 없다", () => {
    const ids = generateStaticParams().map((p) => p.id);
    expect(ids).toHaveLength(demoExamples().length);
    expect(ids.join(" ")).not.toMatch(/trap|other-/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(demoExamples().map((e) => [e.id, e] as const))(
    "예시 %s: API를 부르지 않고 AI 고지·질문·예시 안내와 함께 바로 보인다",
    async (_id, e) => {
      await renderPage(exampleSlug(e.id));
      expect(screen.getByText(AI_NOTICE)).toBeDefined();
      expect(screen.getByText(`“${e.question}”`)).toBeDefined();
      expect(screen.getByText("예시 답변 · 질문 횟수에 포함되지 않아요")).toBeDefined();
      // 질문 생성·분석·횟수·결과 조회 API를 하나도 부르지 않는다
      expect(fetchSpy).not.toHaveBeenCalled();
      // 심층 질문 입력란(이어 묻기 = 질문 1번) 대신 홈으로 가는 링크
      expect(screen.queryByLabelText("심층 질문하기")).toBeNull();
      const ask = screen.getByRole("link", { name: /내 상황으로 질문하기/ });
      expect(ask.getAttribute("href")).toMatch(/^\/\?category=[a-z]+#ask$/);
      expect(document.body.textContent).not.toMatch(/승소 가능성|승률|확률|undefined/);
    },
  );

  test("예시 분야(카테고리)를 홈 주소로 넘긴다", async () => {
    await renderPage("lease-01");
    expect(screen.getByRole("link", { name: /내 상황으로 질문하기/ }).getAttribute("href")).toBe(
      "/?category=lease#ask",
    );
  });

  test("없는 예시 주소는 404", async () => {
    await expect(renderPage("trap-number")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
