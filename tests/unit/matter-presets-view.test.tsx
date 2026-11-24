// DEC-061 가상 사건 프리셋 화면 — 로그인 없이 가상 사건 목록과 탭이 보이고, 고쳐도 서버에 저장하지 않는다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PresetWorkspace } from "@/components/matters/PresetWorkspace";
import { AI_NOTICE } from "@/lib/api/respond";
import { MATTER_PRESETS } from "@/lib/matters/presets";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/matters",
}));
afterEach(cleanup);

test("F-016 DEC-061 로그인 없이 가상 사건 목록·안내·탭이 보이고, 다른 사건과 탭으로 옮겨 갈 수 있다", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(<PresetWorkspace />);
  const list = screen.getByTestId("preset-list");
  expect(within(list).getAllByRole("button")).toHaveLength(MATTER_PRESETS.length);
  expect(screen.getByText(/로그인 없이 둘러보는 가상 사건이에요/)).toBeDefined();
  expect(screen.getAllByText(AI_NOTICE).length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", { name: MATTER_PRESETS[0].title })).toBeDefined();

  fireEvent.click(within(list).getAllByRole("button")[1]);
  expect(screen.getByRole("heading", { name: MATTER_PRESETS[1].title })).toBeDefined();
  for (const name of ["자료", "사실관계", "구조도", "쟁점", "리서치", "노트"]) {
    fireEvent.click(screen.getByRole("tab", { name: new RegExp(name) }));
    expect(screen.getByRole("tab", { name: new RegExp(name) }).getAttribute("aria-selected")).toBe(
      "true",
    );
  }
  // 둘러보기만으로는 서버에 저장 요청을 보내지 않는다
  expect(fetchSpy.mock.calls.filter(([u]) => String(u).includes("/matters"))).toHaveLength(0);
  fetchSpy.mockRestore();
});
