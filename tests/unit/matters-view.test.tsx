// F-016 사건 진행 화면 (DEC-053): 로그인 전용 안내, 구조도(자리별 배치·설명 창·이어 찾기), 쟁점·노트의 AI 표시. 이름·회사는 가상이다.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AI_NOTICE } from "@/lib/api/respond";
import { emptyMatter, type MatterData } from "@/lib/matters/model";

const quota = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/components/useQuota", () => ({
  useQuota: () => quota.value,
  QuotaRouteSync: () => null,
}));
const api = vi.hoisted(() => ({ listMatters: vi.fn(), getMatter: vi.fn(), saveMatter: vi.fn() }));
vi.mock("@/lib/client/matters", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/matters")>()),
  ...api,
}));

const { MattersView } = await import("@/components/matters/MattersView");
const { StructureMap } = await import("@/components/matters/StructureMap");
const { IssuesTab, NotesTab } = await import("@/components/matters/tabs");

afterEach(cleanup);

const data: MatterData = {
  ...emptyMatter(),
  parties: [
    {
      id: "a",
      name: "가상홀딩스 Inc.",
      kind: "business",
      side: "claimant",
      role: "발신",
      note: "위탁자라고 적혀 있습니다.",
    },
    {
      id: "d",
      name: "주식회사 가상솔루션",
      kind: "business",
      side: "respondent",
      role: "수신 · 수탁사",
      note: "",
    },
    { id: "e", name: "김가상", kind: "person", side: "respondent", role: "대표이사", note: "" },
  ],
  relations: [
    { id: "r1", from: "a", to: "d", label: "용역 계약" },
    { id: "r2", from: "d", to: "e", label: "대표" },
  ],
  issues: [
    {
      id: "i1",
      title: "삭제 의무는 누구에게 있는지",
      detail: "",
      points: [
        {
          text: "수임인은 선량한 관리자의 주의로 처리해야 한다고 정하고 있습니다.",
          label: "민법 제681조",
          url: "https://www.law.go.kr/x",
        },
      ],
      unknowns: [],
      byAi: true,
    },
    { id: "i2", title: "직접 적은 쟁점", detail: "", points: [], unknowns: [], byAi: false },
  ],
  notes: [
    {
      id: "n1",
      title: "가상솔루션 기업 조사",
      body: "구축 회사라고 적혀 있습니다. 관련: [[주식회사 가상솔루션]]",
      kind: "company",
      refs: ["d"],
      sources: [{ title: "example.com", url: "https://example.com" }],
      byAi: true,
      at: "2030-03-03T00:00:00Z",
    },
  ],
};

describe("F-016 AC1 로그인 전용", () => {
  test("비로그인은 가상 사건 프리셋을 보고(DEC-061) 내 사건 목록은 부르지 않는다", () => {
    quota.value = {
      anonymous: true,
      used: 0,
      limit: 5,
      remaining: 5,
      loginRequired: false,
      admin: false,
    };
    render(<MattersView />);
    expect(screen.getByText("가상 사건으로 둘러보기")).toBeTruthy();
    expect(screen.getByTestId("preset-list")).toBeTruthy();
    expect(api.listMatters).not.toHaveBeenCalled();
    expect(screen.getByText(/판단은 하지 않아요/)).toBeTruthy();
  });

  test("로그인하면 내 사건 목록을 불러온다", async () => {
    quota.value = {
      anonymous: false,
      used: 0,
      limit: 10,
      remaining: 10,
      loginRequired: false,
      admin: false,
    };
    api.listMatters.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "m1",
            title: "가상 사건",
            updatedAt: "t",
            counts: { docs: 1, parties: 3, issues: 2, notes: 1 },
          },
        ],
      },
    });
    render(<MattersView />);
    const list = await screen.findByTestId("matter-list");
    expect(within(list).getByRole("button", { name: /가상 사건/ })).toBeTruthy();
    // 사건을 고르기 전에는 새 사건 만들기 하나가 주된 행동이고, 진행 단계 탭은 보이지 않는다
    expect(screen.getByRole("button", { name: "사건 만들기" })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  test("사건을 열면 단계가 세 묶음으로 보이고, 개요는 다음 할 일 하나를 먼저 보여 준다", async () => {
    quota.value = {
      anonymous: false,
      used: 0,
      limit: 10,
      remaining: 10,
      loginRequired: false,
      admin: false,
    };
    api.listMatters.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "m1",
            title: "가상 사건",
            updatedAt: "t",
            counts: { docs: 0, parties: 0, issues: 0, notes: 0 },
          },
        ],
      },
    });
    api.getMatter.mockResolvedValue({
      ok: true,
      data: { id: "m1", title: "가상 사건", updatedAt: "t", data: emptyMatter() },
    });
    render(<MattersView />);
    fireEvent.click(
      within(await screen.findByTestId("matter-list")).getByRole("button", { name: /가상 사건/ }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "가상 사건" })).toBeTruthy();
    for (const group of ["1 모으기", "2 정리하기", "3 찾고 기록하기"]) {
      expect(screen.getByText(group)).toBeTruthy();
    }
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    // 빈 사건의 다음 할 일은 자료 올리기다. 평가·판정 낱말은 없다
    const todo = screen.getByTestId("next-step");
    expect(todo.textContent).not.toMatch(/유리|불리|승소|패소|가능성/);
    fireEvent.click(within(todo).getByRole("button", { name: /자료 올리기/ }));
    expect(screen.getByRole("tab", { name: "자료" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("F-016 AC2 구조도", () => {
  const props = { data, update: vi.fn(), onCompany: vi.fn(), onSearch: vi.fn(), onNote: vi.fn() };

  test("자리별로 놓고, 옳고 그름을 나타내지 않는다고 밝히며, 상자마다 설명 창이 있다", () => {
    render(<StructureMap {...props} />);
    const map = screen.getByTestId("structure-map");
    for (const side of ["요구·청구하는 쪽", "요구·청구를 받는 쪽", "그 밖 (기관·제3자)"]) {
      expect(within(map).getByText(side)).toBeTruthy();
    }
    expect(screen.getByText(/누가 옳은지를 나타내지 않아요/)).toBeTruthy();
    const tips = within(map).getAllByRole("tooltip");
    expect(tips).toHaveLength(3);
    expect(tips[0].textContent).toContain("위탁자라고 적혀 있습니다.");
    expect(tips[1].textContent).toContain("용역 계약: 가상홀딩스 Inc.");
    // 유불리·책임 같은 판정 낱말이 그림에 없다
    expect(map.textContent).not.toMatch(/유리|불리|책임|승소|패소|가해|피해/);
  });

  test("회사는 기업 조사로 이어지고, 개인은 조사 버튼이 없다", () => {
    render(<StructureMap {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /주식회사 가상솔루션/ }));
    fireEvent.click(screen.getByRole("button", { name: "이 회사 기업 조사" }));
    expect(props.onCompany).toHaveBeenCalledWith(data.parties[1]);

    fireEvent.click(screen.getByRole("button", { name: /김가상/ }));
    const panel = screen.getByTestId("party-panel");
    expect(within(panel).queryByRole("button", { name: "이 회사 기업 조사" })).toBeNull();
    expect(within(panel).getByText(/개인에 대해서는 웹 검색을 하지 않아요/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "메모 붙이기" }));
    expect(props.onNote).toHaveBeenCalledWith(data.parties[2]);
  });
});

describe("F-016 AC3·AC5 쟁점·노트 표시 (절대 규칙 2·6)", () => {
  test("AI가 정리한 쟁점에만 AI 고지를 붙이고, 근거는 출처 링크와 함께 보인다", () => {
    render(<IssuesTab matterId="m-1" data={data} update={vi.fn()} />);
    expect(screen.getAllByText(AI_NOTICE)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "민법 제681조" }).getAttribute("href")).toBe(
      "https://www.law.go.kr/x",
    );
    expect(screen.getByText(/어느 쪽이 옳은지, 결과가 어떻게 될지는 정하지 않아요/)).toBeTruthy();
    // 동의 전에는 AI 정리를 보낼 수 없다
    expect(screen.getByRole("button", { name: "쟁점 정리 (AI)" })).toHaveProperty("disabled", true);
  });

  test("노트의 [[이름]]은 그 당사자의 설명 창으로 이어지고, AI가 쓴 노트에는 고지가 붙는다", () => {
    render(<NotesTab data={data} update={vi.fn()} seed={null} />);
    const notes = screen.getByTestId("notes");
    expect(within(notes).getByText(AI_NOTICE)).toBeTruthy();
    const tip = within(notes).getByRole("tooltip");
    expect(tip.textContent).toContain("주식회사 가상솔루션");
    expect(tip.textContent).toContain("요구·청구를 받는 쪽");
    expect(within(notes).getByText("연결: 주식회사 가상솔루션")).toBeTruthy();
  });
});
