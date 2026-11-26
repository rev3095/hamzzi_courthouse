// DEC-076 검색 '물어보기' AI 답 — Haiku 호출 모양(가짜 모델)과 화면(검색 = 한눈에 답, 리서치 = 리서치 브리프). Claude 실호출 없음.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { SEARCH_ANSWER_COST_CAP_USD, SEARCH_WRITE_TOKENS } from "@/lib/ai/cost";
import { AI_NOTICE } from "@/lib/api/respond";
import type { SearchAnswer as Answer, SearchAnswerView } from "@/lib/search/answer/types";

vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({ getSearchAnswer: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  getSearchAnswer: api.getSearchAnswer,
}));

const { interpretSearch, searchModel, writeSearchAnswer } = await import("@/lib/ai/search-answer");
const { SearchAnswer } = await import("@/components/search/SearchAnswer");

afterEach(cleanup);

const msg = (text: string): ModelMessage =>
  ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 800, output_tokens: 400, cache_read_input_tokens: 0 },
  }) as unknown as ModelMessage;

function fakeModel(texts: string[]) {
  const calls: CreateParams[] = [];
  const model: ModelClient = {
    countTokens: async () => 800,
    create: vi.fn(async (p: CreateParams) => {
      calls.push(p);
      return msg(texts[calls.length - 1] ?? "{}");
    }),
  };
  return { model, calls };
}

describe("DEC-076 Haiku 두 번 (해석 → 답 쓰기)", () => {
  test("둘 다 Haiku·thinking 끔·effort low, 한 비용 상한 안에서 부른다", async () => {
    const f = fakeModel([
      JSON.stringify({
        offTopic: false,
        field: "보건의료",
        intent: "의료기기 규칙을 찾고 계신 것 같아요.",
        koTerms: ["의료기기"],
        lawNames: ["의료기기법"],
        en: ["medical device"],
        ja: [],
      }),
      JSON.stringify({
        summary: ["의료기기를 만들고 파는 규칙을 정한 법이에요."],
        usage: ["의료기기를 들여올 때"],
        conditions: [
          { text: "업으로 만들 때 허가가 필요해요.", lawName: "의료기기법", articleNo: "제6조" },
        ],
        issues: ["허가가 필요한 품목인가요?"],
        nextQueries: ["의료기기 허가"],
        virtualCases: [],
      }),
    ]);
    const m = searchModel({ model: f.model });
    const it = await interpretSearch(m, { query: "의료기기법", focus: "laws" });
    expect(it.ok && it.interp.koTerms).toEqual(["의료기기"]);
    const wr = await writeSearchAnswer(m, {
      query: "의료기기법",
      mode: "research",
      field: "보건의료",
      domestic: ["의료기기법"],
      foreign: [],
      cases: [],
      needVirtual: false,
    });
    expect(wr.ok && wr.written.issues).toEqual(["허가가 필요한 품목인가요?"]);
    expect(f.calls).toHaveLength(2);
    for (const p of f.calls) {
      expect(p.model).toBe("claude-haiku-5-5");
      expect(p.thinking).toEqual({ type: "disabled" });
      expect(p.output_config?.effort).toBe("low");
    }
    expect(f.calls[1].max_tokens).toBeLessThanOrEqual(SEARCH_WRITE_TOKENS.max);
    // 답 쓰기에는 찾은 법령 이름만 넘긴다 (판례 전문·사용자 정보 없음)
    expect(JSON.stringify(f.calls[1].messages)).toContain("의료기기법");
    expect(m.spentUsd()).toBeLessThanOrEqual(SEARCH_ANSWER_COST_CAP_USD);
  });
});

const A: Answer = {
  mode: "search",
  focus: "laws",
  query: "의료기기법",
  field: "보건의료",
  intent: "의료기기를 만들고 파는 규칙을 찾고 계신 것 같아요.",
  summary: ["의료기기를 만들고 파는 일의 규칙을 정한 법이에요."],
  usage: ["의료기기를 온라인으로 팔 때"],
  conditions: [
    {
      text: "업으로 만들 때 허가가 필요해요.",
      cite: { lawName: "의료기기법", articleNo: "제6조" },
      confirmed: { label: "의료기기법 제6조", href: "/statutes/x" },
    },
  ],
  issues: ["허가가 필요한 품목인가요?"],
  nextQueries: ["의료기기 허가"],
  laws: {
    domestic: [
      {
        name: "의료기기법",
        kind: "법률",
        country: "kr",
        href: "/laws/a",
        sourceUrl: "https://www.law.go.kr",
        source: "법제처",
        core: true,
      },
      {
        name: "의료기기법 시행령",
        kind: "대통령령",
        country: "kr",
        href: "/laws/b",
        sourceUrl: "https://www.law.go.kr",
        source: "법제처",
      },
    ],
    foreign: [
      {
        name: "Medical Devices Regulations",
        kind: "규정",
        country: "uk",
        href: null,
        sourceUrl: "https://www.legislation.gov.uk/x",
        source: "UK",
      },
    ],
  },
  cases: [],
  casesTotal: 0,
  virtualCases: [
    {
      title: "허가 없이 판 경우",
      situation: "판매자 A가 허가 없이 팔려고 해요.",
      point: "허가를 받았는지 봐요.",
    },
  ],
  searched: { ko: ["의료기기법", "의료기기"], en: ["medical device"], ja: [] },
  createdAt: "2026-11-27T00:00:00.000Z",
  updatedAt: "2026-11-27T00:00:00.000Z",
};
const view = (answer: Answer | null, extra: Partial<SearchAnswerView> = {}): SearchAnswerView => ({
  answer,
  ai: { used: true },
  reused: false,
  notice: AI_NOTICE,
  virtualNotice: null,
  ...extra,
});

describe("DEC-076 화면", () => {
  test("검색: 이해 → 건수 → 요약 → 구조도 → 쓰이는 곳 → 조건 → 사례(가상) → 관련 법령, AI 고지·% 없음", async () => {
    api.getSearchAnswer.mockResolvedValue({ ok: true, data: view(A) });
    const pick = vi.fn();
    render(<SearchAnswer q="의료기기법" mode="search" focus="laws" onPick={pick} />);
    await waitFor(() => screen.getByRole("heading", { name: "요약" }));
    expect(api.getSearchAnswer).toHaveBeenCalledWith("의료기기법", "search", "laws");
    expect(screen.getByText(/이렇게 이해했어요/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "찾은 건수" }).textContent).toContain("국내 법령");
    const order = [
      "요약",
      "법령 구조도",
      "어디서 쓰이나요",
      "어떤 조건에서 성립하나요",
      "실제 사례·판례",
      "관련 법령",
    ].map((name) => screen.getByRole("heading", { name }));
    for (let i = 1; i < order.length; i += 1)
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect(screen.getByRole("img", { name: /법령 구조도/ })).toBeTruthy();
    expect(screen.getByTestId("answer-virtual").textContent).toContain("AI가 만든 가상 사례");
    expect(screen.getByRole("link", { name: /의료기기법 제6조/ })).toBeTruthy();
    expect(screen.getByText("자주 쓰는 법령")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "검토할 쟁점" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "의료기기 허가" }));
    expect(pick).toHaveBeenCalledWith("의료기기 허가");
    const text = document.body.textContent ?? "";
    expect(text).toContain(AI_NOTICE);
    expect(text).not.toMatch(/%|승률|확률/);
  });

  test("리서치: 쟁점 체크·요건 표·법령 체계가 보인다", async () => {
    api.getSearchAnswer.mockResolvedValue({ ok: true, data: view({ ...A, mode: "research" }) });
    render(<SearchAnswer q="의료기기법" mode="research" focus="laws" />);
    await waitFor(() => screen.getByRole("heading", { name: "검토할 쟁점" }));
    const box = screen.getByRole("checkbox", { name: /허가가 필요한 품목/ }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "법령 체계" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "성립 요건" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  test("AI 답을 만들지 못하면 이유만 보이고 검색 결과를 가리지 않는다", async () => {
    api.getSearchAnswer.mockResolvedValue({
      ok: true,
      data: view(null, { ai: { used: false, reason: "free_mode" } }),
    });
    render(<SearchAnswer q="의료기기법" mode="search" focus="laws" />);
    await waitFor(() => screen.getByRole("status"));
    expect(screen.getByRole("status").textContent).toContain("AI 답을 쓰지 않는 모드");
  });
});
