// S-04 답변 요약형 결과 (F-014 데모 축소판, DEC-021): 사실 요약 → 절차 타임라인 → 첫 단계 추천 → 세부 내용 → 다음 단계.
// 팝업 접근성(호버·포커스·Esc), 게이트 문서는 안내 화면으로만 연결 (DEC-022), 확률·기간 숫자 없음 (절대 규칙 2·3).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ResultPanel } from "@/components/result/ResultPanel";
import { demoExamples, findExample, replayResult } from "@/lib/demo/policy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
afterEach(cleanup);

const lease = demoExamples().find((e) => e.id === "lease-01")!;
const wage = demoExamples().find((e) => e.id === "wage-02")!;
const resultOf = (q: string) => replayResult(findExample(q)!);

function renderLease(extra: Partial<Parameters<typeof ResultPanel>[0]> = {}) {
  return render(
    <ResultPanel
      result={resultOf(lease.question)}
      question={lease.question}
      followUp={<textarea aria-label="이어 묻기" />}
      {...extra}
    />,
  );
}

describe("F-014 결과 요약형 레이아웃", () => {
  test("사실 요약·타임라인·첫 단계 추천·세부 내용·다음 단계가 이 순서로 보인다", () => {
    const { container } = renderLease();
    const text = container.textContent ?? "";
    const order = [
      "근거 판례",
      "절차 타임라인",
      "현재 위 내용을 기반으로 먼저 내용증명을 추천드립니다",
      "세부 내용",
      "내용증명 바로 가기",
      "이어 묻기",
    ].map((t) => text.indexOf(t));
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.getByText(/추천 첫 단계 · 내용증명 · 혼자 가능/)).toBeDefined();
  });

  test("N1·절대 규칙 3 확률·승소 가능성·예상 기간 숫자가 없다", () => {
    const { container } = renderLease();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/%|확률|승소 가능성|이길 수|예상 기간|예상 비용/);
    // 기간 숫자는 조문 원문 구절을 인용할 때만 (예: "임대차기간이 끝나기 2개월 전까지") — 검증된 인용 구절에 있어야 한다
    const result = resultOf(lease.question);
    const quotes = result.answer.points.map((p) => p.quote.replace(/\s/g, "")).join(" ");
    for (const m of text.matchAll(/\d+\s*개월/g))
      expect(quotes.includes(m[0].replace(/\s/g, "")), m[0]).toBe(true);
  });

  test("DEC-021 타임라인은 참고용 표시와 단계별 난이도 라벨을 단다", () => {
    renderLease();
    const list = screen.getByRole("list", { name: "절차 단계" });
    expect(within(list).getAllByRole("button", { expanded: false }).length).toBeGreaterThanOrEqual(
      6,
    );
    expect(screen.getByText("일반적인 절차 안내")).toBeDefined();
    expect(within(list).getAllByText("전문가 권장").length).toBeGreaterThan(0);
  });

  test("DEC-022 '바로 가기'는 게이트 안내 화면(/documents/demand-letter)으로만 간다", () => {
    renderLease();
    const link = screen.getByRole("link", { name: /내용증명 바로 가기/ });
    expect(link.getAttribute("href")).toBe("/documents/demand-letter");
  });

  test("DEC-023 질문 번호를 ?from=으로 넘기고, 소송 단계가 있으면 소장 작성도 보인다", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    renderLease({ inquiryId: id });
    expect(screen.getByRole("link", { name: /내용증명 바로 가기/ }).getAttribute("href")).toBe(
      `/documents/demand-letter?from=${id}`,
    );
    expect(screen.getByRole("link", { name: /소장 작성/ }).getAttribute("href")).toBe(
      `/documents/complaint?from=${id}`,
    );
  });

  test("DEC-025 타임라인 단계(임차권등기명령·지급명령)에서 그 단계 서식 작성 화면으로 간다", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    renderLease({ inquiryId: id });
    const list = screen.getByRole("list", { name: "절차 단계" });
    for (const [label, kind] of [
      [/임차권등기명령/, "lease-registration"],
      [/지급명령 신청/, "payment-order"],
    ] as const) {
      fireEvent.focus(within(list).getByRole("button", { name: label }));
      const group = within(list).getByRole("group", { name: label });
      expect(
        within(group)
          .getByRole("link", { name: /이 단계 서식 작성하기/ })
          .getAttribute("href"),
      ).toBe(`/documents/${kind}?from=${id}`);
    }
  });

  test("답변은 맨 위에 펼쳐 보이고, 세부 내용(법령·판례·검증 탭)은 접혀 있다", () => {
    const { container } = renderLease();
    const answer = screen.getByRole("region", { name: "답변" });
    expect(within(answer).getByText("한눈에 보기")).toBeDefined();
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(details).queryByRole("tab", { name: "답변" })).toBeNull();
    expect(within(details).getByRole("tab", { name: /법령/ })).toBeDefined();
  });

  test("DEC-021 노동(임금·퇴직금)은 고용노동부 진정 타임라인, 바로 가기는 공식 창구(새 창)", () => {
    render(
      <ResultPanel result={resultOf(wage.question)} question={wage.question} followUp={null} />,
    );
    const list = screen.getByRole("list", { name: "절차 단계" });
    expect(within(list).getByRole("button", { name: /고용노동부 진정/ })).toBeDefined();
    expect(screen.getByText("노동 · 임금·퇴직금 체불")).toBeDefined();
    expect(
      screen.getByText("현재 위 내용을 기반으로 먼저 고용노동부 진정을 추천드립니다"),
    ).toBeDefined();
    const go = screen.getByRole("link", { name: /고용노동부 진정 바로 가기/ });
    expect(go.getAttribute("href")).toBe("https://www.moel.go.kr");
    expect(go.getAttribute("target")).toBe("_blank");
    expect(within(list).queryByRole("button", { name: /내용증명/ })).toBeNull();
  });
});

describe("F-014 마일스톤 팝업 접근성", () => {
  const node = (name: RegExp) =>
    within(screen.getByRole("list", { name: "절차 단계" })).getByRole("button", { name });

  test("키보드 포커스로 열리고 aria-describedby로 팝업을 가리키며 Esc로 닫힌다", () => {
    renderLease();
    const btn = node(/내용증명/);
    fireEvent.focus(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const pop = document.getElementById(btn.getAttribute("aria-describedby")!)!;
    expect(pop.hidden).toBe(false);
    expect(within(pop).getByText("준비할 것")).toBeDefined();
    expect(within(pop).getByText(/강제력은 없어요/)).toBeDefined();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(pop.hidden).toBe(true);
  });

  test("마우스를 올리면 열리고 내리면 닫힌다", () => {
    renderLease();
    const btn = node(/강제집행/);
    const li = btn.closest("li")!;
    fireEvent.pointerEnter(li, { pointerType: "mouse" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerLeave(li, { pointerType: "mouse" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  test("'이 단계 질문하기'는 질문 문장만 넘긴다 (보내기는 사용자가 누른다)", () => {
    const onAskStep = vi.fn();
    renderLease({ onAskStep });
    fireEvent.click(node(/지급명령 신청/));
    fireEvent.click(screen.getByRole("button", { name: "이 단계 질문하기" }));
    expect(onAskStep).toHaveBeenCalledWith(
      "지급명령은 어떻게 신청하고, 상대방이 이의를 내면 어떻게 되나요?",
    );
  });
});
