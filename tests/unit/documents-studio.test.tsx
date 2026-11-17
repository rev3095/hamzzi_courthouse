// DEC-025 서식 작성 화면 흐름: 설문 팝업 → 곧바로 완성 → "이대로 내보낼까요?" 예 / 아니요(직접 수정할게요)
// → 편집기 → 저장 → 다시 예 / 아니요. 파일은 브라우저 안에서 만들고 서버로 보내지 않는다 (F-007, DEC-023).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const exportMod = vi.hoisted(() => ({
  buildFile: vi.fn(),
  downloadFile: vi.fn(),
  fetchFonts: vi.fn(),
}));
vi.mock("@/lib/documents/export", async (orig) => ({
  ...(await orig<typeof import("@/lib/documents/export")>()),
  ...exportMod,
}));

const { DocumentStudio } = await import("@/components/documents/DocumentStudio");

beforeAll(() => {
  // jsdom에는 <dialog> 모달 API가 없다
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(cleanup);

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  exportMod.buildFile.mockImplementation(
    async (format: string, blocks: unknown, meta: { basename: string }) => ({
      data: new Uint8Array([1]),
      mime: "x",
      filename: `${meta.basename}.${format}`,
      blocks,
    }),
  );
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

const dialog = () => screen.getByRole("dialog");
const type = (label: RegExp, value: string) =>
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
const next = () =>
  fireEvent.click(within(dialog()).getByRole("button", { name: /다음|문서 완성하기/ }));

function fillPaymentOrder() {
  fireEvent.click(screen.getByRole("button", { name: "서식 작성 시작" }));
  expect(within(dialog()).getByText("지급명령 신청서 · 1 / 8")).toBeTruthy();
  // 빈 칸이면 다음으로 넘어가지 않는다
  next();
  expect(within(dialog()).getByRole("alert").textContent).toMatch(/확인해 주세요/);
  type(/채권자 이름/, "김햄찌");
  type(/채권자 주소/, "해바라기시 씨앗구 볍씨로 7");
  next();
  type(/채무자 이름/, "이도토리");
  type(/채무자 주소/, "도토리시 참나무구 밤길 3");
  next();
  type(/청구 금액/, "3,000,000");
  expect(within(dialog()).getByText("문서에는 금 3,000,000원으로 들어가요.")).toBeTruthy();
  next();
  next(); // 이자 (선택)
  next(); // 독촉절차비용 (선택)
  type(/청구원인/, "채권자는 채무자에게 돈을 빌려주었습니다.");
  next();
  fireEvent.click(within(dialog()).getByLabelText("송금·계좌 이체 내역"));
  next();
  type(/제출할 법원/, "도토리지방법원");
  next(); // 문서 완성하기
}

describe("DEC-025 서식 작성 흐름", () => {
  test("관리자 미리보기 띠, 주민등록번호 안내, 서버 저장 없음 안내", () => {
    render(<DocumentStudio kind="payment-order" inquiryId={null} draftEnabled={false} preview />);
    expect(screen.getByText(/관리자 미리보기/)).toBeTruthy();
    expect(screen.getByText(/주민등록번호를 받지 않으니/)).toBeTruthy();
    expect(screen.getByText(/어디에도 저장되지 않아요/)).toBeTruthy();
  });

  test("설문 → 곧바로 완성 → 예: 고른 형식으로 브라우저에서 내보낸다 (서버 호출 없음)", async () => {
    render(
      <DocumentStudio kind="payment-order" inquiryId={null} draftEnabled={false} preview={false} />,
    );
    fillPaymentOrder();
    expect(within(dialog()).getByText("입력하신 내용대로 문서를 완성했어요")).toBeTruthy();
    // 미리보기에 입력값이 들어가 있다
    expect(screen.getByText("1. 금 3,000,000원")).toBeTruthy();
    expect(screen.getByText(/1\. 송금·계좌 이체 내역/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByLabelText(/워드 \(DOCX\)/));
    fireEvent.click(within(dialog()).getByRole("button", { name: "예, 내보낼게요" }));
    await waitFor(() => expect(exportMod.downloadFile).toHaveBeenCalledTimes(1));
    expect(exportMod.buildFile.mock.calls[0][0]).toBe("docx");
    expect(await screen.findByText("지급명령신청서.docx 파일을 내려받았어요.")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("아니요(직접 수정할게요) → 편집기 → 저장 → 다시 예/아니요(계속 수정할게요) → 고친 내용으로 내보낸다", async () => {
    render(
      <DocumentStudio kind="payment-order" inquiryId={null} draftEnabled={false} preview={false} />,
    );
    fillPaymentOrder();
    fireEvent.click(within(dialog()).getByRole("button", { name: "아니요, 직접 수정할게요" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const cause = screen.getByDisplayValue("채권자는 채무자에게 돈을 빌려주었습니다.");
    fireEvent.focus(cause);
    fireEvent.change(cause, {
      target: { value: "채권자는 채무자에게 돈을 빌려주고 돌려받지 못했습니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "아래에 새 문단" }));
    const added = screen
      .getAllByRole("textbox")
      .find((t) => (t as HTMLTextAreaElement).value === "")!;
    fireEvent.change(added, { target: { value: "채권자는 내용증명으로 반환을 요청했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(within(dialog()).getByText("고친 내용을 저장했어요")).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "아니요, 계속 수정할게요" }));
    expect(screen.getByDisplayValue("채권자는 내용증명으로 반환을 요청했습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "예, 내보낼게요" }));
    await waitFor(() => expect(exportMod.buildFile).toHaveBeenCalled());
    const [format, blocks] = exportMod.buildFile.mock.calls[0] as [string, { text: string }[]];
    expect(format).toBe("hwpx");
    const texts = blocks.map((b) => b.text);
    expect(texts).toContain("채권자는 채무자에게 돈을 빌려주고 돌려받지 못했습니다.");
    expect(texts).toContain("채권자는 내용증명으로 반환을 요청했습니다.");
  });

  test("이율을 적으면 시작일을 묻는다 (when 조건)", () => {
    render(
      <DocumentStudio kind="complaint" inquiryId={null} draftEnabled={false} preview={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "서식 작성 시작" }));
    type(/사건명/, "대여금 청구의 소");
    next();
    type(/원고 이름/, "김햄찌");
    type(/원고 주소/, "해바라기시");
    next();
    type(/피고 이름/, "이도토리");
    type(/피고 주소/, "도토리시");
    next();
    type(/청구 금액/, "1000");
    next();
    expect(within(dialog()).queryByText("이자를 셈하기 시작하는 날")).toBeNull();
    type(/이율/, "12");
    expect(within(dialog()).getByText("이자를 셈하기 시작하는 날")).toBeTruthy();
  });

  test("초안 도우미는 게이트가 열렸고 질문 번호가 있을 때만 보인다", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const { unmount } = render(
      <DocumentStudio kind="lease-registration" inquiryId={id} draftEnabled={false} preview />,
    );
    fireEvent.click(screen.getByRole("button", { name: "서식 작성 시작" }));
    expect(within(dialog()).queryByText("질문 내용으로 초안 채우기")).toBeNull();
    unmount();
    render(
      <DocumentStudio kind="lease-registration" inquiryId={id} draftEnabled preview={false} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "서식 작성 시작" }));
    expect(within(dialog()).getByText("질문 내용으로 초안 채우기")).toBeTruthy();
    expect(within(dialog()).getByText(/더 적을 사정 칸을 채워요/)).toBeTruthy();
  });
});
