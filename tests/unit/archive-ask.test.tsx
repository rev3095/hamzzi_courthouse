// DEC-070 판례 아카이브 질문창: Light(Haiku) 고정 · 보고 있던 판례를 근거에 넣기. 모델·법제처는 가짜 — Claude 실호출 없음.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { runLiteAnalysis, UNDERSTAND_MODEL } = await import("@/lib/ai/lite");
const { answerTierFor, parseAnalyzeRequest } = await import("@/lib/inquiries/policy");
const { ARCHIVE_ANSWER_TIER, TIERS } = await import("@/lib/ai/models");
const { ASSISTANT_ANSWER_TIER } = await import("@/lib/assistants/agents");
const { recallArchive, rememberArchive } = await import("@/lib/client/api");
const { AskArchive } = await import("@/components/search/AskArchive");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import type { LawSource } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail } from "@/lib/search/types";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("DEC-070 답변 단계는 Light 고정", () => {
  test("질문창 단계는 Haiku 5.5이고, 화면이 보낸 단계로 바꿀 수 없다 (비서는 비서 단계)", () => {
    expect(ARCHIVE_ANSWER_TIER).toBe("light");
    expect(TIERS[ARCHIVE_ANSWER_TIER].model).toBe("claude-haiku-5-5");
    for (const tier of ["light", "pro", "max", null] as const)
      expect(answerTierFor({ assistant: false, archive: true, tier })).toBe("light");
    expect(answerTierFor({ assistant: true, archive: false, tier: "max" })).toBe(
      ASSISTANT_ANSWER_TIER,
    );
    expect(answerTierFor({ assistant: false, archive: false, tier: "max" })).toBe("max");
    expect(answerTierFor({ assistant: false, archive: false, tier: null })).toBeNull();
  });

  test("분석 본문: archive·focusCases는 정해진 꼴만 받는다", () => {
    expect(parseAnalyzeRequest("")).toMatchObject({ archive: false, focusCases: [] });
    expect(
      parseAnalyzeRequest(JSON.stringify({ archive: true, focusCases: ["608477", "608477"] })),
    ).toMatchObject({ archive: true, focusCases: ["608477"] });
    for (const bad of [
      { archive: "yes" },
      { focusCases: ["608477"] }, // 질문창이 아닌 질문에는 근거 판례를 붙이지 않는다
      { archive: true, focusCases: ["1", "2", "3"] },
      { archive: true, focusCases: ["2023다12345"] },
      { archive: true, focusCases: "608477" },
      { archive: true, assistant: "report" },
    ])
      expect(() => parseAnalyzeRequest(JSON.stringify(bad)), JSON.stringify(bad)).toThrow();
  });
});

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제3조",
  lawName: "주택임대차보호법",
  articleNo: "제3조",
  title: "대항력 등",
  text: "임대차는 그 등기가 없는 경우에도 임차인이 주택의 인도와 주민등록을 마친 때에는 그 다음 날부터 제삼자에 대하여 효력이 생긴다.",
  effectiveFrom: null,
  sourceUrl: "https://www.law.go.kr/법령/주택임대차보호법/제3조",
};
const FOCUS: CaseDetail = {
  id: "700001",
  caseNo: "2020다99999",
  caseName: "보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/700001",
  holding: "대항력의 발생 시기",
  summary: "주민등록을 마친 다음 날부터 대항력이 생긴다.",
  refs: null,
  fromBody: false,
  bodyExcerpt: null,
};
const source = () =>
  ({
    searchArticles: vi.fn(async () => [ART]),
    findArticles: vi.fn(async () => [ART]),
    getArticle: vi.fn(async () => null),
    searchCases: vi.fn(async () => []),
    getCase: vi.fn(async (id: string) => (id === FOCUS.id ? FOCUS : null)),
    verifyStatutes: vi.fn(async () => []),
    verifyCases: vi.fn(async () => []),
  }) as unknown as LawSource;

const text = (t: string): ModelMessage =>
  ({
    content: [{ type: "text", text: t }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1_000, output_tokens: 100, cache_read_input_tokens: 0 },
  }) as unknown as ModelMessage;

function fakeModel() {
  const model: ModelClient = {
    countTokens: async () => 1_000,
    create: vi.fn(async (p: CreateParams) => {
      if (p.model === UNDERSTAND_MODEL)
        return text(JSON.stringify({ section: "lease", lawQuery: "대항력", caseQueries: [] }));
      return text(JSON.stringify({ points: [] }));
    }),
  };
  return model;
}

describe("DEC-070 보고 있던 판례를 근거에 넣기", () => {
  test("focusCaseIds의 판례는 그 요청에서 법제처로 다시 가져와 근거 모음에 들어간다", async () => {
    const src = source();
    const out = await runLiteAnalysis(
      { maskedText: "전입신고를 하면 언제부터 보호받나요?" },
      { model: fakeModel(), lawSource: src, tier: "pro", focusCaseIds: [FOCUS.id, "999"] },
    );
    expect(src.getCase).toHaveBeenCalledWith(FOCUS.id);
    expect(out.evidence.list().some((i) => i.key.includes("2020다99999"))).toBe(true);
    // 가져오지 못한 번호는 근거에 없다
    expect(out.evidence.list().filter((i) => i.kind === "case")).toHaveLength(1);
  });
});

describe("DEC-070 질문창 화면", () => {
  test("이 기기에는 질문창 표시와 판례 번호(숫자)만 남긴다", () => {
    rememberArchive("q1", ["700001"]);
    expect(recallArchive("q1")).toEqual({ focus: ["700001"] });
    sessionStorage.setItem("hz:ar:q2", JSON.stringify({ focus: ["<script>", "12"] }));
    expect(recallArchive("q2")).toEqual({ focus: ["12"] });
    expect(recallArchive("q3")).toBeNull();
  });

  test("열면 Light 고정·횟수 안내와 '이 판례를 근거에 넣기'가 보이고, 보내면 판례 번호를 남기고 결과 화면으로 간다", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/me/quota"))
        return new Response(
          JSON.stringify({ data: { anonymous: true, remaining: 5, limit: 10 } }),
          {
            headers: { "content-type": "application/json" },
          },
        );
      return new Response(
        JSON.stringify({
          data: {
            id: "q9",
            maskedText: "이 판례는 어떤 요건을 따졌나요?",
            piiConfirmationRequired: false,
            piiFindings: [],
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AskArchive focus={{ id: "700001", title: "대법원 2020다99999" }} />);
    fireEvent.click(screen.getByRole("button", { name: /이 판례 물어보기/ }));
    expect(screen.getByText(/Light\(Haiku 5\.5\)로 고정/)).toBeTruthy();
    const box = screen.getByRole("checkbox", { name: /이 판례를 근거에 넣기/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    // 단계 선택기는 없다
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.change(screen.getByLabelText("궁금한 점"), {
      target: { value: "이 판례는 어떤 요건을 따졌나요?" },
    });
    fireEvent.submit(screen.getByLabelText("궁금한 점").closest("form")!);
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/inquiries/q9"));
    expect(recallArchive("q9")).toEqual({ focus: ["700001"] });
  });
});
