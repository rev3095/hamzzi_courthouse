// 햄찌 안내 챗봇 화면 (DEC-030): 메뉴로 고르면 고정 문안을 보여 주고, 입력 칸·외부 호출이 없다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GuideBot } from "@/components/guide/GuideBot";
import { GUIDE_NOTICE, GUIDE_TOPICS, guideEmail, MENU_IDS } from "@/lib/guide/topics";

afterEach(cleanup);

const open = () => {
  fireEvent.click(screen.getByRole("button", { name: /햄찌 안내 열기/ }));
  return screen.getByRole("dialog", { name: "햄찌 안내" });
};

describe("햄찌 안내 챗봇 (DEC-030)", () => {
  test("닫혀 있을 때는 햄찌 버튼만 있고, 열면 고지와 메뉴 7개가 보인다", () => {
    render(<GuideBot />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const dialog = open();
    expect(within(dialog).getByText(new RegExp(GUIDE_NOTICE))).toBeTruthy();
    expect(within(dialog).getByText(/AI 캐릭터/)).toBeTruthy();
    for (const id of MENU_IDS) {
      expect(within(dialog).getByRole("button", { name: GUIDE_TOPICS[id].label })).toBeTruthy();
    }
    // 자유 입력은 이번 범위가 아니다 — 개인정보를 받지 않는다
    expect(dialog.querySelector("input, textarea")).toBeNull();
  });

  test.each(MENU_IDS.map((id) => [id] as const))(
    "메뉴 %s를 고르면 답변·하위 질문이 나온다",
    (id) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      render(<GuideBot />);
      const dialog = open();
      const t = GUIDE_TOPICS[id];
      fireEvent.click(within(dialog).getByRole("button", { name: t.label }));
      for (const line of t.lines) expect(within(dialog).getByText(line)).toBeTruthy();
      for (const item of t.list ?? []) expect(within(dialog).getByText(item)).toBeTruthy();
      for (const l of t.links ?? []) {
        const a = within(dialog).getByRole("link", {
          name: new RegExp(l.label.replace(/[()]/g, "\\$&")),
        });
        expect(a.getAttribute("href")).toBe(l.href);
      }
      for (const n of t.next ?? []) {
        expect(within(dialog).getByRole("button", { name: GUIDE_TOPICS[n].label })).toBeTruthy();
      }
      expect(within(dialog).getByRole("button", { name: "처음 메뉴로" })).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
  );

  test("하위 질문을 고르고 처음 메뉴로 돌아갈 수 있다", () => {
    render(<GuideBot />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "사이트 규정" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: GUIDE_TOPICS["rules-examples"].label }),
    );
    expect(within(dialog).getByText(GUIDE_TOPICS["rules-examples"].lines[0])).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "처음 메뉴로" }));
    expect(within(dialog).getByRole("button", { name: "개발자 연락처" })).toBeTruthy();
  });

  test("개발자 이메일은 '이메일 보기'를 눌러야 나타나고 mailto 링크다", () => {
    render(<GuideBot />);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "개발자 연락처" }));
    expect(dialog.textContent).not.toContain(guideEmail());
    fireEvent.click(within(dialog).getByRole("button", { name: "이메일 보기" }));
    const mail = within(dialog).getByRole("link", { name: guideEmail() });
    expect(mail.getAttribute("href")).toBe(`mailto:${guideEmail()}`);
  });

  test("닫기·Esc로 닫힌다", () => {
    render(<GuideBot />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "햄찌 안내 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
