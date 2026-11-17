// @vitest-environment node
// 분석 실행 순서 (P5): 분석 → 검증 → 비로그인 횟수 차감 → 저장. 실패하면 failed 표시 (DEC-010, F-005).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

vi.mock("server-only", () => ({}));
const calls: string[] = [];
const store = vi.hoisted(() => ({
  loadFollowupContext: vi.fn(),
  finishAnalysis: vi.fn(),
  markInquiryFailed: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const ai = vi.hoisted(() => ({ runDemoAnalysis: vi.fn() }));
vi.mock("@/lib/ai/orchestrator", () => ai);
const lite = vi.hoisted(() => ({ runLiteAnalysis: vi.fn() }));
vi.mock("@/lib/ai/lite", () => lite);
const free = vi.hoisted(() => ({ runFreeAnalysis: vi.fn() }));
vi.mock("@/lib/demo/free", () => free);
const cite = vi.hoisted(() => ({ verifyDraft: vi.fn() }));
vi.mock("@/lib/citations/verify", () => cite);
const rate = vi.hoisted(() => ({
  // 주간·하루 상한 확인 (DEC-026). 실제 숫자는 lib/ai/models.test.ts가 본다
  tryAiQuota: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/rate-limit", () => rate);

const { analyzeInquiry, ANALYSIS_BUDGET_MS } = await import("@/lib/inquiries/analyze");

const INQ = {
  id: "inq-1",
  user_id: null,
  anon_session_id: "anon-1",
  status: "draft" as const,
  pii_findings: { findings: [], confirmedAt: null },
  sensitive_consent_at: null,
  masked_text: "마스킹본",
  parent_inquiry_id: "parent-1",
};
const ANON = { kind: "anon" as const, anonSessionId: "anon-1" };
const RESULT = { outcome: "grounded" };

beforeEach(() => {
  // 아래 기존 테스트는 전체 파이프라인(pro-full) 경로다. 라이트(pro)·무료 모드는 아래 describe에서 따로 본다
  vi.stubEnv("AI_MODE", "pro-full");
  vi.clearAllMocks();
  calls.length = 0;
  store.loadFollowupContext.mockResolvedValue([{ question: "앞 질문", answer: "앞 답" }]);
  ai.runDemoAnalysis.mockImplementation(async () => {
    calls.push("analyze");
    return {
      draft: { answer: { points: [] } },
      evidence: {},
      dropped: ["assertive"],
      usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0 },
      model: "claude-opus-5-5",
      promptVersion: "v",
    };
  });
  cite.verifyDraft.mockImplementation(async () => {
    calls.push("verify");
    return { result: RESULT, citations: [], stats: { total: 1, removed: 1, quoteMismatch: 0 } };
  });
  store.finishAnalysis.mockImplementation(async () => {
    calls.push("finish");
    return "r-1";
  });
});

describe("analyzeInquiry", () => {
  test("DEC-010 분석·검증이 성공한 뒤 차감·저장(한 트랜잭션)을 한다", async () => {
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(calls).toEqual(["analyze", "verify", "finish"]);
    expect(out).toEqual({ resultId: "r-1", result: RESULT });
    expect(ai.runDemoAnalysis).toHaveBeenCalledWith(
      { maskedText: "마스킹본", context: [{ question: "앞 질문", answer: "앞 답" }] },
      expect.objectContaining({ budgetMs: ANALYSIS_BUDGET_MS }),
    );
    // P3에서 거른 문단 수를 실패율에 넣는다
    expect(cite.verifyDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ screened: 1 }),
    );
    expect(store.finishAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        inquiryId: "inq-1",
        stats: { total: 1, removed: 1, quoteMismatch: 0 },
      }),
      ANON,
      expect.any(Headers),
    );
  });

  test("로그인 사용자도 같은 마무리 함수를 쓴다 (차감 여부는 DB 함수가 owner로 정한다)", async () => {
    const user = { kind: "user" as const, userId: "u-1" };
    await analyzeInquiry(INQ, user, new Headers());
    expect(store.finishAnalysis).toHaveBeenCalledWith(expect.anything(), user, expect.any(Headers));
  });

  test("분석이 실패하면 횟수를 차감하지 않고 failed로 표시한다", async () => {
    ai.runDemoAnalysis.mockRejectedValue(new ApiError("MODEL_FAILED"));
    await expect(analyzeInquiry(INQ, ANON, new Headers())).rejects.toMatchObject({
      code: "MODEL_FAILED",
    });
    expect(store.finishAnalysis).not.toHaveBeenCalled();
    expect(store.markInquiryFailed).toHaveBeenCalledWith("inq-1");
  });

  test("마무리에서 상한·중복에 걸리면 오류를 올리고 failed 표시를 시도한다", async () => {
    store.finishAnalysis.mockRejectedValue(new ApiError("LOGIN_REQUIRED"));
    await expect(analyzeInquiry(INQ, ANON, new Headers())).rejects.toMatchObject({
      code: "LOGIN_REQUIRED",
    });
    expect(store.markInquiryFailed).toHaveBeenCalledWith("inq-1");
  });
});

describe("DEC-015 무료 모드 (기본)", () => {
  test("AI_MODE가 없으면 Claude 분석을 부르지 않고 무료 분석 결과를 같은 트랜잭션으로 저장한다", async () => {
    vi.stubEnv("AI_MODE", "");
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "search_only", outcome: "grounded" },
      citations: [],
      stats: { total: 0, removed: 0 },
      model: "search_only",
    });
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(ai.runDemoAnalysis).not.toHaveBeenCalled();
    expect(cite.verifyDraft).not.toHaveBeenCalled();
    expect(free.runFreeAnalysis).toHaveBeenCalledWith("마스킹본", expect.anything());
    expect(store.finishAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "search_only",
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
      ANON,
      expect.any(Headers),
      // 예시가 아닌 실제 질문은 무료 모드(검색 전용)라도 하루 3회에서 1회를 쓴다
      { consumeAnonQuota: true },
    );
    expect(out.result).toMatchObject({ mode: "search_only" });
    // 무료 모드는 주간 Claude 상한 카운터를 올리지 않는다
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("DEC-019·026 Pro라도 주간 전체 상한을 넘으면 Claude를 부르지 않고 무료 분석으로 처리한다", async () => {
    vi.stubEnv("AI_MODE", "pro-full");
    rate.tryAiQuota.mockResolvedValueOnce(false);
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "search_only", outcome: "grounded" },
      citations: [],
      stats: { total: 0, removed: 0 },
      model: "search_only",
    });
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(ai.runDemoAnalysis).not.toHaveBeenCalled();
    expect(free.runFreeAnalysis).toHaveBeenCalled();
    expect(out.result).toMatchObject({ mode: "search_only" });
  });

  test("무료 분석이 실패해도 횟수를 차감하지 않고 failed로 표시한다", async () => {
    vi.stubEnv("AI_MODE", "");
    free.runFreeAnalysis.mockRejectedValue(new ApiError("SEARCH_UPSTREAM_FAILED"));
    await expect(analyzeInquiry(INQ, ANON, new Headers())).rejects.toMatchObject({
      code: "SEARCH_UPSTREAM_FAILED",
    });
    expect(store.finishAnalysis).not.toHaveBeenCalled();
    expect(store.markInquiryFailed).toHaveBeenCalledWith("inq-1");
  });
});

describe("DEC-020 라이트 모드 (AI_MODE=pro)", () => {
  const LITE_OUT = {
    draft: { answer: { points: [] } },
    evidence: {},
    dropped: [],
    usage: { inputTokens: 5_000, outputTokens: 500, cacheReadTokens: 0 },
    model: "claude-haiku-5-5",
    promptVersion: "lite",
    costUsd: 0.00075,
    costCapped: false,
  };

  test("AI_MODE=pro는 전체 파이프라인이 아니라 라이트 답변을 부른다", async () => {
    vi.stubEnv("AI_MODE", "pro");
    lite.runLiteAnalysis.mockResolvedValue(LITE_OUT);
    await analyzeInquiry(INQ, ANON, new Headers());
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      { maskedText: "마스킹본", context: expect.anything() },
      expect.anything(),
    );
    expect(ai.runDemoAnalysis).not.toHaveBeenCalled();
    expect(cite.verifyDraft).toHaveBeenCalled();
    expect(store.finishAnalysis).toHaveBeenCalled();
  });

  test("DEC-027 유료 모드라도 예시 질문은 미리 만든 분석을 재생 — 주간 상한도, 비로그인 하루 3회도 쓰지 않는다 (비용 0)", async () => {
    vi.stubEnv("AI_MODE", "pro");
    const { demoExamples } = await import("@/lib/demo/policy");
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "replay", outcome: "grounded" },
      citations: [],
      stats: { total: 1, removed: 0 },
      model: "replay",
    });
    await analyzeInquiry({ ...INQ, masked_text: demoExamples()[0].question }, ANON, new Headers());
    expect(lite.runLiteAnalysis).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(free.runFreeAnalysis).toHaveBeenCalled();
    expect(store.finishAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ model: "replay" }),
      ANON,
      expect.any(Headers),
      { consumeAnonQuota: false },
    );
  });

  test("DEC-027 무료 모드에서도 예시 질문 재생은 횟수를 차감하지 않는다", async () => {
    vi.stubEnv("AI_MODE", "");
    const { demoExamples } = await import("@/lib/demo/policy");
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "replay", outcome: "grounded" },
      citations: [],
      stats: { total: 1, removed: 0 },
      model: "replay",
    });
    await analyzeInquiry({ ...INQ, masked_text: demoExamples()[1].question }, ANON, new Headers());
    expect(store.finishAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      ANON,
      expect.any(Headers),
      { consumeAnonQuota: false },
    );
  });
});
