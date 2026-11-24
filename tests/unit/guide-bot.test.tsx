// 햄찌 안내 챗봇 화면 (DEC-030): 원형 햄찌 버튼 → 채팅 창. 메뉴(빠른 질문)로 고르면 고정 문안을 보여 주고,
// 입력 칸·외부 호출이 없다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GuideBot } from "@/components/guide/GuideBot";
import { GUIDE_NOTICE, GUIDE_TOPICS, guideEmail, MENU_IDS } from "@/lib/guide/topics";

afterEach(cleanup);

const open = () => {
  fireEvent.click(screen.getByRole("button", { name: /햄찌 안내 열기/ }));
  return screen.getByRole("dialog", { name: "햄찌 안내" });
};
const quick = (dialog: HTMLElement) => within(dialog).getByRole("group", { name: "빠른 질문" });
const esc = (s: string) => s.replace(/[()]/g, "\\$&");

describe("햄찌 안내 챗봇 (DEC-030)", () => {
  test("닫혀 있을 때는 원형 햄찌 버튼만 있고, 열면 고지와 빠른 질문 메뉴 8개가 보인다", () => {
    render(<GuideBot />);
    expect(screen.queryByRole("dialog")).toBeNull();
    const launcher = screen.getByRole("button", { name: /햄찌 안내 열기/ });
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    const dialog = open();
    expect(
      screen.getByRole("button", { name: "햄찌 안내 창 닫기" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(within(dialog).getByText(GUIDE_NOTICE)).toBeTruthy();
    expect(within(dialog).getAllByText(/AI 캐릭터/).length).toBeGreaterThan(0);
    for (const id of MENU_IDS) {
      expect(
        within(quick(dialog)).getByRole("button", { name: GUIDE_TOPICS[id].label }),
      ).toBeTruthy();
    }
    // 자유 입력은 받지 않는다 — 개인정보를 받지 않고 Claude를 부르지 않는다
    expect(dialog.querySelector("input, textarea")).toBeNull();
  });

  test("F-018 DEC-057 맨 위 선택기로 대화 상대(햄찌 안내 · 전문 에이전트 셋)를 고른다 — 처음은 햄찌 안내, 서버를 부르지 않는다", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<GuideBot />);
    const dialog = open();
    const picker = within(dialog).getByRole("radiogroup", { name: /대화 상대 고르기/ });
    const radios = within(picker).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      "햄찌 안내",
      "내집마련",
      "고소미",
      "중고천국",
    ]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test.each(MENU_IDS.map((id) => [id] as const))(
    "메뉴 %s를 고르면 답하는 중 표시 뒤 답변·링크·하위 질문이 나온다",
    async (id) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      render(<GuideBot />);
      const dialog = open();
      const t = GUIDE_TOPICS[id];
      fireEvent.click(within(quick(dialog)).getByRole("button", { name: t.label }));
      expect(within(dialog).getByRole("status", { name: "햄찌가 답하는 중" })).toBeTruthy();
      expect(await within(dialog).findByText(t.lines[0])).toBeTruthy();
      for (const line of t.lines) expect(within(dialog).getByText(line)).toBeTruthy();
      for (const item of t.list ?? []) expect(within(dialog).getByText(item)).toBeTruthy();
      for (const l of t.links ?? []) {
        const a = within(dialog).getByRole("link", { name: new RegExp(esc(l.label)) });
        expect(a.getAttribute("href")).toBe(l.href);
      }
      for (const n of t.next ?? []) {
        expect(
          within(quick(dialog)).getByRole("button", { name: GUIDE_TOPICS[n].label }),
        ).toBeTruthy();
      }
      expect(within(quick(dialog)).getByRole("button", { name: "처음 메뉴로" })).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    },
  );

  test("하위 질문을 고르고 처음 메뉴로 돌아갈 수 있다", async () => {
    render(<GuideBot />);
    const dialog = open();
    fireEvent.click(within(quick(dialog)).getByRole("button", { name: "사이트 규정" }));
    // 답하는 중에는 빠른 질문 버튼이 잠긴다 — 답이 나온 뒤에 고른다
    await within(dialog).findByText(GUIDE_TOPICS.rules.lines[0]);
    const sub = GUIDE_TOPICS["rules-examples"];
    fireEvent.click(await within(quick(dialog)).findByRole("button", { name: sub.label }));
    expect(await within(dialog).findByText(sub.lines[0])).toBeTruthy();
    fireEvent.click(within(quick(dialog)).getByRole("button", { name: "처음 메뉴로" }));
    expect(
      await within(quick(dialog)).findByRole("button", { name: "문의 · 개발자 연락처" }),
    ).toBeTruthy();
  });

  test("개발자 이메일은 '이메일 보기'를 눌러야 나타나고 mailto 링크다", async () => {
    render(<GuideBot />);
    const dialog = open();
    fireEvent.click(within(quick(dialog)).getByRole("button", { name: "문의 · 개발자 연락처" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "이메일 보기" }));
    const mail = within(dialog).getByRole("link", { name: guideEmail() });
    expect(mail.getAttribute("href")).toBe(`mailto:${guideEmail()}`);
  });

  test("DEC-051 연락처 항목에서 문의 남기기 화면으로 이어진다", async () => {
    render(<GuideBot />);
    const dialog = open();
    fireEvent.click(within(quick(dialog)).getByRole("button", { name: "문의 · 개발자 연락처" }));
    const link = await within(dialog).findByRole("link", { name: /문의 남기기/ });
    expect(link.getAttribute("href")).toBe("/about/developer#contact");
  });

  test("이메일 보기 전에는 주소가 화면에 없다", async () => {
    render(<GuideBot />);
    const dialog = open();
    fireEvent.click(within(quick(dialog)).getByRole("button", { name: "문의 · 개발자 연락처" }));
    await within(dialog).findByRole("button", { name: "이메일 보기" });
    expect(dialog.textContent).not.toContain(guideEmail());
  });

  test("머리의 닫기·원형 버튼·Esc로 닫힌다", () => {
    render(<GuideBot />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "햄찌 안내 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.click(screen.getByRole("button", { name: "햄찌 안내 창 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
