// F-015 서류 분석 화면 (DEC-052): 사진 붙이기 UI, 동의 전에는 서버로 보내지 않기, 읽은 내용 확인, 당사자 표시.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AI_NOTICE } from "@/lib/api/respond";
import type { Attachments } from "@/components/ask/useAttachments";
import type { PreparedImage } from "@/lib/client/casefile";

const client = vi.hoisted(() => ({ readCaseFiles: vi.fn(), lookupBusiness: vi.fn() }));
vi.mock("@/lib/client/casefile", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/casefile")>()),
  ...client,
}));

const { CaseFileFlow, PartyList } = await import("@/components/casefile/CaseFileFlow");
const { QuestionBox } = await import("@/components/ask/QuestionBox");
const { PartiesCard } = await import("@/components/result/PartiesCard");
const { parseParties, rememberParties } = await import("@/lib/client/casefile");

const IMAGE: PreparedImage = {
  id: "i-1",
  name: "서류.jpg",
  mediaType: "image/jpeg",
  data: "AAAA",
  previewUrl: "blob:preview-1",
};
const READING = {
  docTypes: ["내용증명"],
  summary: "발신인은 수신인에게 보증금 반환을 요구했습니다.",
  claims: ["보증금을 돌려 달라고 요구합니다."],
  parties: [
    { role: "발신인", side: "claimant", kind: "person", name: "" },
    { role: "수신인", side: "respondent", kind: "business", name: "주식회사 한빛주택" },
  ],
};

const attachOf = (over: Partial<Attachments> = {}): Attachments => ({
  items: [],
  busy: false,
  error: null,
  add: vi.fn(async () => {}),
  remove: vi.fn(),
  clear: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  client.readCaseFiles.mockResolvedValue({
    ok: true,
    data: {
      reading: READING,
      piiFindings: [{ type: "name", count: 2 }],
      sensitive: [],
      ai: { used: true },
      notice: AI_NOTICE,
    },
  });
});
afterEach(cleanup);

describe("F-015 사진 붙이기 UI", () => {
  test("attach가 없으면 붙이기 버튼이 없다 (판례 검색창 등)", () => {
    render(<QuestionBox value="" onChange={() => {}} onSubmit={() => {}} busy={false} />);
    expect(screen.queryByRole("button", { name: "서류 사진·문서 붙이기" })).toBeNull();
  });

  test("붙인 사진을 미리보기로 보이고 뺄 수 있다. 저장하지 않는다는 안내가 있다", () => {
    const attach = attachOf({ items: [IMAGE] });
    render(
      <QuestionBox value="" onChange={() => {}} onSubmit={() => {}} busy={false} attach={attach} />,
    );
    expect(screen.getByRole("button", { name: "서류 사진·문서 붙이기" })).toBeTruthy();
    expect(screen.getByAltText("서류 사진 1").getAttribute("src")).toBe("blob:preview-1");
    expect(screen.getByTestId("attach-tray").textContent).toContain("저장하지 않아요");
    fireEvent.click(screen.getByRole("button", { name: "서류 1 빼기" }));
    expect(attach.remove).toHaveBeenCalledWith("i-1");
  });

  test("입력란에 사진을 붙여넣으면 사진으로 더한다", () => {
    const attach = attachOf();
    render(
      <QuestionBox value="" onChange={() => {}} onSubmit={() => {}} busy={false} attach={attach} />,
    );
    const file = new File(["x"], "캡처.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [file] } });
    expect(attach.add).toHaveBeenCalledWith([file]);
  });
});

describe("F-015 AC1 동의 → AC3 확인", () => {
  const open = (onAnalyze = vi.fn(), onLimit = vi.fn()) => {
    render(
      <CaseFileFlow
        images={[IMAGE]}
        question="어떻게 답해야 하나요?"
        busy={false}
        onAnalyze={onAnalyze}
        onLimit={onLimit}
        onClose={() => {}}
      />,
    );
    return { onAnalyze, onLimit };
  };
  const agree = () => {
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "동의하고 서류 읽기" }));
  };

  test("두 항목 모두 동의하기 전에는 사진을 보내지 않는다", () => {
    open();
    const go = screen.getByRole("button", { name: "동의하고 서류 읽기" });
    expect(go).toHaveProperty("disabled", true);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(go).toHaveProperty("disabled", true);
    expect(client.readCaseFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(go).toHaveProperty("disabled", false);
  });

  test("읽은 내용을 AI 고지와 함께 보이고, 고친 개요와 고른 자리로 분석을 보낸다", async () => {
    const { onAnalyze } = open();
    agree();
    await screen.findByText("읽은 내용이 맞는지 확인해 주세요");
    expect(client.readCaseFiles).toHaveBeenCalledWith([IMAGE], "어떻게 답해야 하나요?");
    expect(screen.getByText(AI_NOTICE)).toBeTruthy();
    expect(screen.getByText(/가린 개인정보: 이름 2/)).toBeTruthy();
    // 개인은 이름 없이, 법인은 이름으로
    expect(screen.getByText("개인 (이름은 표시하지 않아요)")).toBeTruthy();
    expect(screen.getByText("주식회사 한빛주택")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("사건 개요"), {
      target: { value: "발신인은 보증금 반환을 요구했습니다." },
    });
    fireEvent.click(screen.getByLabelText("요구·청구를 받은 쪽이에요"));
    fireEvent.click(screen.getByRole("button", { name: "이대로 분석하기" }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    const [text, parties] = onAnalyze.mock.calls[0];
    expect(text).toContain("사건 개요: 발신인은 보증금 반환을 요구했습니다.");
    expect(text).toContain("질문자의 자리: 요구·청구를 받은 쪽");
    expect(text).toContain("질문: 어떻게 답해야 하나요?");
    expect(parties).toEqual(READING.parties);
  });

  test("DEC-068 auto: 동의하면 읽은 내용으로 곧바로 분석을 보낸다 (동의 전에는 보내지 않는다)", async () => {
    const onAnalyze = vi.fn();
    render(
      <CaseFileFlow
        auto
        images={[IMAGE]}
        question=""
        busy={false}
        onAnalyze={onAnalyze}
        onLimit={() => {}}
        onClose={() => {}}
      />,
    );
    const go = screen.getByRole("button", { name: "동의하고 바로 분석하기" });
    expect(go).toHaveProperty("disabled", true);
    expect(client.readCaseFiles).not.toHaveBeenCalled();
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(go);
    await waitFor(() => expect(onAnalyze).toHaveBeenCalledTimes(1));
    const [text, parties] = onAnalyze.mock.calls[0];
    expect(text).toContain(`사건 개요: ${READING.summary}`);
    // 궁금한 점을 비우면 상황 정리(양쪽 입장·대응·쟁점·반론·문서)를 묻는다
    expect(text).toMatch(/질문: 지금 상황을 정리해 주세요.*예상되는 반론/);
    expect(parties).toEqual(READING.parties);
    // 보내기에 실패해도 고쳐서 다시 보낼 수 있게 확인 화면이 남는다
    expect(screen.getByRole("button", { name: "이대로 분석하기" })).toBeTruthy();
  });

  test("읽지 못하면 이유를 알리고 분석을 보내지 않는다", async () => {
    client.readCaseFiles.mockResolvedValue({
      ok: true,
      data: {
        reading: null,
        piiFindings: [],
        sensitive: [],
        ai: { used: false, reason: "unreadable" },
        notice: null,
      },
    });
    const { onAnalyze } = open();
    agree();
    expect((await screen.findByRole("alert")).textContent).toContain("글자를 읽지 못했어요");
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  test("하루 횟수를 다 썼으면 한도 안내로 넘긴다", async () => {
    client.readCaseFiles.mockResolvedValue({
      ok: false,
      error: { code: "LOGIN_REQUIRED", message: "" },
    });
    const { onLimit } = open();
    agree();
    await waitFor(() => expect(onLimit).toHaveBeenCalledTimes(1));
  });
});

describe("F-015 AC4 당사자 표시 (절대 규칙 2)", () => {
  test("서류에서의 자리로 나누고, 옳고 그름을 판단하지 않는다고 밝힌다", () => {
    render(<PartyList parties={READING.parties as never} />);
    expect(screen.getByText("요구·청구하는 쪽")).toBeTruthy();
    expect(screen.getByText("요구·청구를 받는 쪽")).toBeTruthy();
    expect(screen.getByText(/누가 옳은지 판단한 것이 아니에요/)).toBeTruthy();
  });

  test("결과 화면: 이 탭에 둔 목록만 보이고, 법인·사업자만 공개 정보를 찾아볼 수 있다", async () => {
    render(<PartiesCard inquiryId="q-0" />);
    expect(screen.queryByTestId("parties-card")).toBeNull();
    cleanup();

    rememberParties("q-1", READING.parties as never);
    client.lookupBusiness.mockResolvedValue({
      ok: true,
      data: {
        places: { status: "no_key", items: [] },
        corps: { status: "no_key", items: [] },
        links: [{ label: "네이버 지도에서 찾기", url: "https://map.naver.com/p/search/x" }],
        notice: "공개 자료 검색 결과 · AI 생성 아님 · 같은 곳인지 직접 확인 필요",
      },
    });
    render(<PartiesCard inquiryId="q-1" />);
    const buttons = screen.getAllByRole("button", { name: "공개 정보 찾아보기" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await screen.findByText(/같은 곳인지 직접 확인 필요/);
    expect(client.lookupBusiness).toHaveBeenCalledWith("주식회사 한빛주택");
    expect(screen.getByRole("link", { name: /네이버 지도에서 찾기/ })).toBeTruthy();
  });

  test("이 탭에 둔 값이 바뀌어도 개인 이름은 되살리지 않는다", () => {
    const raw = JSON.stringify([
      { role: "피고", side: "respondent", kind: "person", name: "김민수" },
      { role: "모름", side: "respondent", kind: "business", name: "한빛" },
      { role: "원고", side: "claimant", kind: "business", name: "한빛상사" },
    ]);
    expect(parseParties(raw)).toEqual([
      { role: "피고", side: "respondent", kind: "person", name: "" },
      { role: "원고", side: "claimant", kind: "business", name: "한빛상사" },
    ]);
    expect(parseParties("not json")).toEqual([]);
  });
});
