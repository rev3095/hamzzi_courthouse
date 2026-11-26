// @vitest-environment node
// DEC-076 POST /api/v1/search-answer — 검색 '물어보기' AI 답. 모델·법제처·저장소·예산은 모두 가짜. Claude 실호출 없음 (절대 규칙 8).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE } from "@/lib/api/respond";
import type { SearchAnswer, SearchAnswerView } from "@/lib/search/answer/types";

vi.mock("server-only", () => ({}));
const rate = vi.hoisted(() => ({
  assertRateLimit: vi.fn(async (_rule: { bucket: string }): Promise<void> => undefined),
  tryAiQuota: vi.fn(async () => true),
  settleAiQuota: vi.fn(async () => undefined),
  recordAbuseStrike: vi.fn(async () => undefined),
  assertNotAbuseBlocked: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  ...rate,
}));
const mode = vi.hoisted(() => ({ aiMode: vi.fn(() => "paid") }));
vi.mock("@/lib/ai/mode", () => mode);
const owner = vi.hoisted(() => ({ resolveOwner: vi.fn(async () => null) }));
vi.mock("@/lib/inquiries/store", () => owner);
const db = vi.hoisted(() => ({
  readGenerated: vi.fn(async (): Promise<unknown> => null),
  saveGenerated: vi.fn(async (..._args: unknown[]) => true),
  bumpGenerated: vi.fn(async () => undefined),
}));
vi.mock("@/lib/search/answer/store", () => db);
const found = vi.hoisted(() => ({
  gatherFound: vi.fn(async () => ({
    laws: {
      domestic: [
        {
          name: "의료기기법",
          kind: "법률",
          country: "kr",
          href: "/laws/의료기기법",
          sourceUrl: "https://www.law.go.kr",
          source: "법제처",
          core: true,
        },
      ],
      foreign: [],
    },
    cases: [] as unknown[],
    casesTotal: 0,
    searched: { ko: ["의료기기법", "의료기기"], en: ["medical device"], ja: [] },
  })),
}));
vi.mock("@/lib/search/answer/gather", () => found);
const verify = vi.hoisted(() => ({
  verifyStatutes: vi.fn(async (cites: string[]) =>
    cites.map((citation) => ({ citation, exists: citation.endsWith("제6조") ? true : false })),
  ),
}));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => verify }));
const ai = vi.hoisted(() => ({
  SEARCH_ANSWER_PROMPT_VERSION: "search-answer-test",
  searchModel: vi.fn(() => ({ model: {}, spentUsd: () => 0.0011 })),
  interpretSearch: vi.fn(),
  writeSearchAnswer: vi.fn(),
}));
vi.mock("@/lib/ai/search-answer", () => ai);

const route = await import("@/app/api/v1/search-answer/route");

const INTERP = {
  offTopic: false,
  field: "보건의료",
  intent: "의료기기를 만들고 파는 규칙을 찾고 계신 것 같아요.",
  koTerms: ["의료기기"],
  lawNames: ["의료기기법"],
  en: ["medical device"],
  ja: [],
};
const WRITTEN = {
  summary: ["의료기기를 만들고 파는 규칙을 정한 법이에요."],
  usage: ["의료기기를 온라인으로 팔 때"],
  conditions: [
    {
      text: "업으로 만들 때 허가가 필요해요.",
      cite: { lawName: "의료기기법", articleNo: "제6조" },
      confirmed: null,
    },
    {
      text: "없는 조문을 댄 조건이에요.",
      cite: { lawName: "의료기기법", articleNo: "제999조" },
      confirmed: null,
    },
  ],
  issues: [],
  nextQueries: ["의료기기 허가"],
  virtualCases: [{ title: "허가 없이 판 경우", situation: "판매자 A", point: "허가를 봐요." }],
};

const post = (body: unknown) =>
  route.POST(
    new Request("http://localhost/api/v1/search-answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
type Body = { data: SearchAnswerView };

beforeEach(() => {
  vi.clearAllMocks();
  mode.aiMode.mockReturnValue("paid");
  rate.tryAiQuota.mockResolvedValue(true);
  ai.interpretSearch.mockResolvedValue({ ok: true, interp: INTERP });
  ai.writeSearchAnswer.mockResolvedValue({ ok: true, written: WRITTEN });
  db.readGenerated.mockResolvedValue(null);
});

describe("DEC-076 POST /search-answer", () => {
  test("AI 경로: 예산 2단위를 잡고 해석 → 검색 → 답 쓰기 → 실존 확인 → 저장 → 실제 금액 정산", async () => {
    const res = await post({ q: "의료기기법", mode: "search", focus: "laws" });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as Body;
    expect(rate.tryAiQuota).toHaveBeenCalledWith(2);
    expect(ai.interpretSearch).toHaveBeenCalledTimes(1);
    expect(found.gatherFound).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "의료기기법",
        koTerms: ["의료기기"],
        en: ["medical device"],
      }),
    );
    expect(ai.writeSearchAnswer.mock.calls[0][1]).toMatchObject({
      needVirtual: true,
      mode: "search",
    });
    expect(rate.settleAiQuota).toHaveBeenCalledWith(2, 0.0011);
    expect(data.ai).toEqual({ used: true });
    expect(data.reused).toBe(false);
    expect(data.notice).toBe(AI_NOTICE);
    const a = data.answer!;
    // 없다고 확인된 조문을 댄 조건은 빠지고, 확인된 것만 근거가 붙는다 (DEC-071)
    expect(a.conditions.map((c) => c.text)).toEqual(["업으로 만들 때 허가가 필요해요."]);
    expect(a.conditions[0].confirmed?.label).toBe("의료기기법 제6조");
    expect(data.virtualNotice).not.toBeNull();
    expect(db.saveGenerated).toHaveBeenCalledWith(
      "search",
      "laws:의료기기법",
      expect.any(Object),
      "search-answer-test",
    );
    // 저장하는 값에 요청자 정보가 없다
    const saved = JSON.stringify(db.saveGenerated.mock.calls[0][2]);
    expect(saved).not.toMatch(/anonSessionId|userId|ipHash/);
  });

  test("저장해 둔 답이 있으면 모델·예산·남용 검사 없이 다시 쓴다", async () => {
    const stored: SearchAnswer = {
      mode: "research",
      focus: "cases",
      query: "부당해고",
      field: "노동",
      intent: "",
      summary: ["부당해고는 정당한 이유 없는 해고를 말해요."],
      usage: [],
      conditions: [],
      issues: [],
      nextQueries: [],
      laws: { domestic: [], foreign: [] },
      cases: [],
      casesTotal: null,
      virtualCases: [],
      searched: { ko: ["부당해고"], en: [], ja: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.readGenerated.mockResolvedValue({ payload: stored, promptVersion: "v", updatedAt: "" });
    const { data } = (await (
      await post({ q: "부당해고", mode: "research", focus: "cases" })
    ).json()) as Body;
    expect(data.reused).toBe(true);
    expect(data.answer?.summary).toEqual(stored.summary);
    expect(db.readGenerated).toHaveBeenCalledWith("research", "cases:부당해고");
    expect(ai.interpretSearch).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(rate.assertNotAbuseBlocked).not.toHaveBeenCalled();
  });

  test("무료 모드면 모델·예산 없이 이유만 준다", async () => {
    mode.aiMode.mockReturnValue("free");
    const { data } = (await (
      await post({ q: "임대차 보증금", mode: "search", focus: "cases" })
    ).json()) as Body;
    expect(data).toMatchObject({ answer: null, ai: { used: false, reason: "free_mode" } });
    expect(ai.interpretSearch).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("법률과 상관없는 부탁은 규칙 판별에서 모델 전에 멈춘다 (절대 규칙 9)", async () => {
    const { data } = (await (
      await post({ q: "점심 메뉴 추천해줘", mode: "search", focus: "cases" })
    ).json()) as Body;
    expect(data.ai).toEqual({ used: false, reason: "off_topic" });
    expect(ai.interpretSearch).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("해석(Haiku)이 법률 무관으로 보면 경고 하나를 세고 검색·답 쓰기 전에 멈춘다 — 쓴 금액은 정산", async () => {
    ai.interpretSearch.mockResolvedValue({ ok: true, interp: { ...INTERP, offTopic: true } });
    const { data } = (await (
      await post({ q: "오늘 기분", mode: "search", focus: "cases" })
    ).json()) as Body;
    expect(data.ai).toEqual({ used: false, reason: "off_topic" });
    expect(rate.recordAbuseStrike).toHaveBeenCalledTimes(1);
    expect(found.gatherFound).not.toHaveBeenCalled();
    expect(ai.writeSearchAnswer).not.toHaveBeenCalled();
    expect(rate.settleAiQuota).toHaveBeenCalledWith(2, 0.0011);
    expect(db.saveGenerated).not.toHaveBeenCalled();
  });

  test("예산이 없거나 1시간 횟수를 넘으면 모델을 부르지 않는다", async () => {
    rate.tryAiQuota.mockResolvedValue(false);
    let { data } = (await (
      await post({ q: "의료기기", mode: "search", focus: "laws" })
    ).json()) as Body;
    expect(data.ai).toEqual({ used: false, reason: "budget" });
    rate.tryAiQuota.mockResolvedValue(true);
    rate.assertRateLimit.mockImplementation(async (rule) => {
      if (rule.bucket === "search_answer") throw new ApiError("RATE_LIMITED");
    });
    ({ data } = (await (
      await post({ q: "의료기기", mode: "search", focus: "laws" })
    ).json()) as Body);
    expect(data.ai).toEqual({ used: false, reason: "rate_limited" });
    expect(ai.interpretSearch).not.toHaveBeenCalled();
    rate.assertRateLimit.mockImplementation(async () => undefined);
  });

  test("개인정보로 보이는 검색어·잘못된 값은 400 — 모델·저장소로 가지 않는다", async () => {
    expect((await post({ q: "010-1234-5678", mode: "search", focus: "cases" })).status).toBe(400);
    expect((await post({ q: "의료기기", mode: "other", focus: "cases" })).status).toBe(400);
    expect((await post({ q: "의료기기", mode: "search", focus: "x" })).status).toBe(400);
    expect(db.readGenerated).not.toHaveBeenCalled();
    expect(ai.interpretSearch).not.toHaveBeenCalled();
  });

  test("모델이 실패해도 잡아 둔 예산은 정산하고 저장하지 않는다 (재시도 없음)", async () => {
    ai.writeSearchAnswer.mockResolvedValue({ ok: false, reason: "model_failed" });
    const { data } = (await (
      await post({ q: "의료기기", mode: "search", focus: "laws" })
    ).json()) as Body;
    expect(data.ai).toEqual({ used: false, reason: "model_failed" });
    expect(ai.writeSearchAnswer).toHaveBeenCalledTimes(1);
    expect(rate.settleAiQuota).toHaveBeenCalledTimes(1);
    expect(db.saveGenerated).not.toHaveBeenCalled();
  });
});
