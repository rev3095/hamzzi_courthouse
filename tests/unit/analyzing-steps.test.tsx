// F-003 분석 진행 표시: 같은 단계 문구는 한 번만, 출처 목록(추가: …)은 보이지 않는다 (2026-11-26 사용자 요청)
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Analyzing, uniqueSteps } from "@/components/result/ResultView";
import { FREE_STEP_MESSAGES } from "@/lib/demo/policy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
afterEach(cleanup);

const STEPS = [
  { stage: "intent" as const, message: "질문을 읽고 어떤 문제인지 살펴보고 있어요" },
  { stage: "search" as const, message: FREE_STEP_MESSAGES.search },
  { stage: "search" as const, message: FREE_STEP_MESSAGES.search, added: ["law:민법:제536조"] },
  { stage: "search" as const, message: FREE_STEP_MESSAGES.search },
  { stage: "answer" as const, message: "찾은 근거로 답변을 쓰고 있어요" },
  {
    stage: "verify" as const,
    message: "인용한 법령·판례를 법제처에 다시 확인하고 있어요",
    added: ["민법 제536조"],
  },
];

test("같은 문구는 처음 한 번만 남기고 순서는 그대로다", () => {
  expect(uniqueSteps(STEPS).map((s) => s.stage)).toEqual(["intent", "search", "answer", "verify"]);
});

test("진행 패널은 단계를 한 번씩만 보이고 출처 목록을 보이지 않는다", () => {
  render(<Analyzing question="질문" steps={STEPS} />);
  expect(screen.getAllByText(FREE_STEP_MESSAGES.search)).toHaveLength(1);
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(document.body.textContent).not.toMatch(/추가:|민법 제536조|law:/);
  expect(document.body.textContent).not.toContain("무료 모드");
});
