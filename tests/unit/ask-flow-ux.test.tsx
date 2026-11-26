// UI·UX 개정 PR 3 (DEC-067): 긴 질문 안내·답변 모드 잠금, 로딩 화면(자세히 분석 안내·요약 위치·저장된 결과 불러오기)
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LONG_QUESTION_CHARS } from "@/lib/ai/models";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.stubGlobal(
  "fetch",
  vi.fn(async () =>
    Response.json({ data: { anonymous: true, used: 0, limit: 10, remaining: 10 } }),
  ),
);
afterEach(cleanup);

const { QuestionBox } = await import("@/components/ask/QuestionBox");
const { LONG_QUESTION_NOTE } = await import("@/components/ask/TierSlider");
const { Analyzing } = await import("@/components/result/ResultView");

const box = (value: string) =>
  render(
    <QuestionBox value={value} onChange={() => {}} onSubmit={() => {}} busy={false} askTools />,
  );

describe("긴 질문 안내 (DEC-062·067)", () => {
  test("기준을 넘으면 자세히 분석으로 답한다고 알리고 답변 모드를 잠근다", () => {
    box("가".repeat(LONG_QUESTION_CHARS + 1));
    expect(screen.getByText(LONG_QUESTION_NOTE)).toBeDefined();
    expect((screen.getByLabelText("답변 모드") as HTMLInputElement).disabled).toBe(true);
  });

  test("기준 이하면 안내 없이 고를 수 있다", () => {
    box("가".repeat(LONG_QUESTION_CHARS));
    expect(screen.queryByText(LONG_QUESTION_NOTE)).toBeNull();
    expect((screen.getByLabelText("답변 모드") as HTMLInputElement).disabled).toBe(false);
  });
});

describe("분석 진행 화면 (DEC-067)", () => {
  const preview = { summary: "먼저 보는 요약 문장", checks: [], nextSteps: [] };

  test("자세히 분석이면 시간이 더 걸린다고 알린다", () => {
    render(<Analyzing question="질문" steps={[]} deep />);
    expect(screen.getByText(/일반 질문보다 시간이 더 걸려요/)).toBeDefined();
  });

  test("먼저 보는 요약은 진행 단계 목록 아래에 온다", () => {
    const { container } = render(<Analyzing question="질문" steps={[]} preview={preview} />);
    const text = container.textContent ?? "";
    expect(text.indexOf("분석을 시작하고 있어요")).toBeLessThan(
      text.indexOf("먼저 보는 요약 문장"),
    );
  });

  test("긴 질문 인용은 접어 두고 '전체 보기'로 펼친다", () => {
    render(<Analyzing question={"사연".repeat(120)} steps={[]} />);
    expect(screen.getByText("전체 보기")).toBeDefined();
  });
});
