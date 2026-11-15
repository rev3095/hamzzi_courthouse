// 개인정보처리방침 3절은 분석 모드와 같아야 한다 (F-007, DEC-015·020) — 유료 모드면 AI 모델 제공자 전송을 알린다.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const { default: PrivacyPage } = await import("@/app/privacy/page");

test("무료 모드: AI 모델 제공자에게 보내지 않는다고 적는다", () => {
  vi.stubEnv("AI_MODE", "");
  render(<PrivacyPage />);
  expect(screen.getByText("지금은 AI 모델 제공자에게 질문을 보내지 않아요.")).toBeDefined();
  expect(screen.queryByText(/Anthropic/)).toBeNull();
});

test("AI_MODE=pro: 가린 문장과 근거 일부를 Anthropic에 보낸다고 적고, 원문은 보내지 않는다고 적는다", () => {
  vi.stubEnv("AI_MODE", "pro");
  render(<PrivacyPage />);
  const p = screen.getByText(/AI 모델 제공자\(Anthropic\)/);
  expect(p.textContent).toContain("가린 문장");
  expect(p.textContent).toContain("원문은 보내지 않아요");
  expect(screen.queryByText("지금은 AI 모델 제공자에게 질문을 보내지 않아요.")).toBeNull();
});
