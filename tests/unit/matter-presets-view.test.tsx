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

test("F-016 DEC-061 로그인 사용자는 '내 사건으로 가져오기'로 지금 보이는 가상 사건을 계정에 새 사건으로 담는다", async () => {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ data: { id: "m-1" } }), { status: 201 }));
  render(<PresetWorkspace signedIn />);
  fireEvent.click(screen.getByRole("button", { name: "내 사건으로 가져오기" }));
  expect(await screen.findByText(/내 사건 목록에 담았어요/)).toBeDefined();
  const [url, init] = fetchSpy.mock.calls[0];
  expect(String(url)).toBe("/api/v1/matters");
  const body = JSON.parse(String((init as RequestInit).body));
  expect(body.title).toBe(MATTER_PRESETS[0].title);
  expect(body.data.docs.length).toBe(MATTER_PRESETS[0].data.docs.length);
  fetchSpy.mockRestore();
});

test("F-016 DEC-061 자료 탭에서 서류 원본을 펼쳐 본다", () => {
  render(<PresetWorkspace />);
  fireEvent.click(screen.getByRole("tab", { name: /자료/ }));
  const withBody = MATTER_PRESETS[0].data.docs.filter((d) => d.body);
  expect(screen.getAllByText("원본 보기 (가상 서류)")).toHaveLength(withBody.length);
});
