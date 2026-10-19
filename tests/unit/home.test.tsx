import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "@/app/page";

test("홈에 서비스 이름이 보인다", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "햄찌법원" })).toBeDefined();
});
