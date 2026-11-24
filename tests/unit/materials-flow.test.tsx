// F-017 자료 첨부 화면 (DEC-058): 동의 전에는 보내지 않기, 읽은 내용 확인·수정 뒤 보내기, 검색어 고르기, 결과의 자료 정리.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AI_NOTICE } from "@/lib/api/respond";
import type { PreparedImage } from "@/lib/client/casefile";
import { MATERIAL_TIPS } from "@/lib/materials/tips";

const client = vi.hoisted(() => ({ readMaterials: vi.fn() }));
vi.mock("@/lib/client/materials", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/materials")>()),
  ...client,
}));

const { MaterialsFlow } = await import("@/components/ask/MaterialsFlow");
const { AttachChoice } = await import("@/components/ask/useMaterialsAsk");
const { MaterialsView } = await import("@/components/result/MaterialsView");

const IMAGE: PreparedImage = {
  id: "i-1",
  name: "캡처.jpg",
  mediaType: "image/jpeg",
  data: "AAAA",
  previewUrl: "blob:preview-1",
};
const MATERIALS = [
  {
    kind: "메신저 대화" as const,
    summary: "보증금 반환 날짜를 두고 나눈 대화입니다.",
    details: ["다음 달에 돌려주겠다"],
    gaps: ["보낸 날짜가 잘려 있음"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  client.readMaterials.mockResolvedValue({
    ok: true,
    data: {
      materials: MATERIALS,
      queries: ["임대차보증금 반환"],
      piiFindings: [{ type: "name", count: 1 }],
      sensitive: [],
      dropped: 0,
      ai: { used: true },
      notice: AI_NOTICE,
    },
  });
});
afterEach(cleanup);

const agree = () => {
  for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
  fireEvent.click(screen.getByRole("button", { name: "동의하고 자료 읽기" }));
};

describe("F-017 AC1 동의 → 확인 → 보내기", () => {
  test("두 항목 모두 동의하기 전에는 사진을 보내지 않는다", () => {
    render(
      <MaterialsFlow
        images={[IMAGE]}
        question=""
        mode="ask"
        busy={false}
        onLimit={() => {}}
        onClose={() => {}}
      />,
    );
    const go = screen.getByRole("button", { name: "동의하고 자료 읽기" });
    expect(go).toHaveProperty("disabled", true);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(go).toHaveProperty("disabled", true);
    expect(client.readMaterials).not.toHaveBeenCalled();
  });

  test("읽은 내용을 고쳐 질문과 함께 보낸다. 질문을 비우면 기본 질문", async () => {
    const onSend = vi.fn();
    render(
      <MaterialsFlow
        images={[IMAGE]}
        question=""
        mode="ask"
        busy={false}
        onSend={onSend}
        onLimit={() => {}}
        onClose={() => {}}
      />,
    );
    agree();
    await waitFor(() => screen.getByText(AI_NOTICE));
    expect(screen.getByText(/가린 개인정보/).textContent).toContain("이름 1");
    fireEvent.change(screen.getByLabelText("어떤 자료인지"), {
      target: { value: "고친 요약입니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "자료와 함께 물어보기" }));
    const [text, sent] = onSend.mock.calls[0];
    expect(text).toContain("살펴볼 점");
    expect(sent[0]).toMatchObject({ kind: "메신저 대화", summary: "고친 요약입니다." });
  });

  test("자료를 모두 빼면 보낼 수 없다", async () => {
    render(
      <MaterialsFlow
        images={[IMAGE]}
        question="어떻게 하죠"
        mode="ask"
        busy={false}
        onSend={vi.fn()}
        onLimit={() => {}}
        onClose={() => {}}
      />,
    );
    agree();
    await waitFor(() => screen.getByText(AI_NOTICE));
    fireEvent.click(screen.getByRole("button", { name: "이 자료 빼기" }));
    expect(screen.getByRole("button", { name: "자료와 함께 물어보기" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  test("하루 횟수를 다 썼으면 한도 안내로 넘긴다", async () => {
    client.readMaterials.mockResolvedValue({
      ok: false,
      error: { code: "LOGIN_REQUIRED", message: "" },
    });
    const onLimit = vi.fn();
    render(
      <MaterialsFlow
        images={[IMAGE]}
        question=""
        mode="ask"
        busy={false}
        onLimit={onLimit}
        onClose={() => {}}
      />,
    );
    agree();
    await waitFor(() => expect(onLimit).toHaveBeenCalled());
  });
});

describe("F-017 검색 화면: 검색어 고르기", () => {
  test("검색어 후보를 누르면 그 검색어와 정리를 넘긴다", async () => {
    const onPick = vi.fn();
    render(
      <MaterialsFlow
        images={[IMAGE]}
        question=""
        mode="search"
        busy={false}
        onPick={onPick}
        onLimit={() => {}}
        onClose={() => {}}
      />,
    );
    agree();
    fireEvent.click(await screen.findByRole("button", { name: "임대차보증금 반환 찾기" }));
    expect(onPick).toHaveBeenCalledWith("임대차보증금 반환", MATERIALS, AI_NOTICE);
  });
});

describe("F-017 홈: 쓰임 고르기", () => {
  test("자료 첨부·서류 분석 두 가지를 고른다", () => {
    const onCaseFile = vi.fn();
    const onMaterials = vi.fn();
    render(
      <AttachChoice
        count={2}
        onCaseFile={onCaseFile}
        onMaterials={onMaterials}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /자료로 첨부해 질문하기/ }));
    fireEvent.click(screen.getByRole("button", { name: /서류 분석/ }));
    expect(onMaterials).toHaveBeenCalled();
    expect(onCaseFile).toHaveBeenCalled();
  });
});

describe("F-017 AC4 결과의 자료 정리", () => {
  const result = {
    materials: { items: [{ ...MATERIALS[0], points: [0] }] },
    answer: { points: [] },
    aiNotice: AI_NOTICE,
    mode: "ai" as const,
  };

  test("자료 종류·적힌 내용·확인하지 못한 것·참고한 문단·고정 활용 안내를 보인다", () => {
    render(<MaterialsView result={result} />);
    const view = screen.getByTestId("materials-view");
    expect(view.textContent).toContain("메신저 대화");
    expect(view.textContent).toContain("다음 달에 돌려주겠다");
    expect(view.textContent).toContain("보낸 날짜가 잘려 있음");
    expect(screen.getByRole("link", { name: "문단 1" }).getAttribute("href")).toBe("#point-1");
    expect(view.textContent).toContain(MATERIAL_TIPS["메신저 대화"].keep[0]);
    expect(view.textContent).toContain(AI_NOTICE);
  });

  test("증거 가치·유불리·점수를 보이지 않는다 (절대 규칙 2)", () => {
    render(<MaterialsView result={result} />);
    const text = screen.getByTestId("materials-view").textContent ?? "";
    expect(text).not.toMatch(/유리|불리|증거력|점수|%|승소|패소/);
  });

  test("검색 화면에서는 답변 문단 연결을 보이지 않는다", () => {
    render(<MaterialsView result={result} variant="search" onClose={() => {}} />);
    expect(screen.queryByRole("link", { name: "문단 1" })).toBeNull();
    expect(screen.getByRole("button", { name: "정리 닫기" })).toBeTruthy();
  });
});
