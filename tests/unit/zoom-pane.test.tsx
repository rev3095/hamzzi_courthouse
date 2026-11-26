// DEC-065 구조도 보기 틀: 화면에 억지로 맞춰 줄이지 않고, 확대·축소하고 끌어서 본다.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ZOOM, ZoomPane, fitScale, initialScale } from "@/components/result/ZoomPane";

test("DEC-065 처음 배율: 들어가면 그대로, 안 들어가도 읽히는 크기 아래로는 줄이지 않는다", () => {
  expect(initialScale(1000, 800)).toBe(1);
  expect(initialScale(760, 800)).toBeCloseTo(0.95);
  // 그림이 틀보다 훨씬 넓어도 readable 아래로 줄이지 않는다 — 넘치는 부분은 끌어서 본다
  expect(initialScale(400, 1600)).toBe(ZOOM.readable);
  expect(initialScale(0, 800)).toBe(1);
});

test("DEC-065 전체 보기: 그림 전체가 틀에 들어오는 배율 (한도 안에서)", () => {
  expect(fitScale({ width: 500, height: 400 }, { width: 1000, height: 400 })).toBe(0.5);
  expect(fitScale({ width: 100, height: 100 }, { width: 4000, height: 100 })).toBe(ZOOM.min);
});

test("DEC-065 확대·축소·원래 크기 버튼이 배율을 바꾸고, 그림은 원래 크기로 그린 채 배율만 건다", () => {
  render(
    <ZoomPane width={800} height={400} label="사건 구조도">
      <svg data-testid="pic" width={800} height={400} />
    </ZoomPane>,
  );
  expect(screen.getByRole("group", { name: /사건 구조도 — 끌어서 옮기고/ })).toBeDefined();
  const scaled = () => screen.getByTestId("pic").parentElement!.style.transform;
  fireEvent.click(screen.getByRole("button", { name: "확대" }));
  expect(scaled()).toBe("scale(1.2)");
  fireEvent.click(screen.getByRole("button", { name: "축소" }));
  fireEvent.click(screen.getByRole("button", { name: "축소" }));
  expect(scaled()).toBe("scale(0.8)");
  fireEvent.click(screen.getByRole("button", { name: "원래 크기" }));
  expect(scaled()).toBe("scale(1)");
  expect(screen.getByTestId("pic").getAttribute("width")).toBe("800");
});
