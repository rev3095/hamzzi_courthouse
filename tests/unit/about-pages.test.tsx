// 햄찌법원 소개 메뉴 (DEC-051): 헤더 메뉴 아이콘, 소개 페이지 4개, 문의 양식.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AboutMenu } from "@/components/about/AboutMenu";
import { ContactForm, EmailReveal } from "@/components/about/ContactForm";
import { ABOUT_NOTICE } from "@/lib/about/content";
import { developerEmail } from "@/lib/contact/policy";

const { default: AboutPage } = await import("@/app/about/page");
const { default: FeaturesPage } = await import("@/app/about/features/page");
const { default: RoadmapPage } = await import("@/app/about/roadmap/page");
const { default: DeveloperPage } = await import("@/app/about/developer/page");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const reply = (data: unknown, status = 200) =>
  vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(status < 400 ? { data } : data), { status }));

describe("헤더 메뉴 (DEC-051)", () => {
  test("아이콘을 누르면 소개·기능 가이드·향후 계획·개발자·문의가 펼쳐지고 Esc로 닫힌다", () => {
    render(<AboutMenu />);
    const button = screen.getByRole("button", { name: /햄찌법원 메뉴/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/community",
      "/assistants",
      "/about",
      "/about/features",
      "/about/roadmap",
      "/about/developer",
      "/about/developer#contact",
    ]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("소개 페이지 (DEC-051)", () => {
  test.each([
    ["소개", AboutPage],
    ["기능 가이드", FeaturesPage],
    ["향후 계획", RoadmapPage],
    ["개발자·문의", DeveloperPage],
  ])("%s: 탭에 현재 위치를 표시하고 고정 안내 고지를 단다", (label, Page) => {
    render(<Page />);
    const current = screen
      .getByRole("navigation", { name: "햄찌법원 소개" })
      .querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe(label);
    expect(screen.getByText(ABOUT_NOTICE)).toBeTruthy();
  });

  test("향후 계획은 바뀔 수 있다고 적고 가격을 싣지 않는다", () => {
    const { container } = render(<RoadmapPage />);
    expect(container.textContent).toContain("바뀔 수 있어요");
    expect(container.textContent).not.toMatch(/\d\s*원/);
  });

  test("개발자 페이지는 누르기 전에는 이메일 주소를 그리지 않는다", () => {
    const { container } = render(<DeveloperPage />);
    expect(container.innerHTML).not.toContain(developerEmail());
  });
});

describe("문의 양식 (DEC-051)", () => {
  test("보내면 성공 안내를 보여 주고 가린 개수를 알린다", async () => {
    const spy = reply({ status: "sent", maskedCount: 1 });
    render(<ContactForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /문의 내용/ }), {
      target: { value: "결과 화면이 안 열려요 010-1234-5678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "문의 보내기" }));
    expect(await screen.findByText(/문의를 보냈어요/)).toBeTruthy();
    expect(screen.getByText(/1곳은 가려서/)).toBeTruthy();
    const sent = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(sent.topic).toBe("service");
  });

  test("메일 발송이 꺼져 있으면 서버가 가린 본문으로 메일 앱 열기를 보여 준다", async () => {
    reply({
      status: "not_configured",
      maskedCount: 1,
      fallback: { subject: "[햄찌법원 문의] 기타", body: "[이름] 문의예요" },
    });
    render(<ContactForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /문의 내용/ }), {
      target: { value: "김철수 문의예요 열 글자 넘게" },
    });
    fireEvent.click(screen.getByRole("button", { name: "문의 보내기" }));
    const link = await screen.findByRole("link", { name: "메일 앱으로 보내기" });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith(`mailto:${developerEmail()}`)).toBe(true);
    expect(decodeURIComponent(href)).toContain("[이름] 문의예요");
    expect(decodeURIComponent(href)).not.toContain("김철수");
  });

  test("F-007 AC2 민감정보 때문에 거절되면 빼 달라고 안내한다", async () => {
    reply(
      { error: { code: "VALIDATION_ERROR", message: "x", details: { reason: "sensitive" } } },
      400,
    );
    render(<ContactForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /문의 내용/ }), {
      target: { value: "우울증 진단을 받았어요 상담하고 싶어요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "문의 보내기" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("민감한 내용"));
  });

  test("이메일 보기를 눌러야 mailto 링크가 나타난다", () => {
    render(<EmailReveal />);
    fireEvent.click(screen.getByRole("button", { name: "이메일 보기" }));
    expect(screen.getByRole("link", { name: developerEmail() }).getAttribute("href")).toBe(
      `mailto:${developerEmail()}`,
    );
  });
});
