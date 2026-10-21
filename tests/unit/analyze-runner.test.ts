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
const cite = vi.hoisted(() => ({ verifyDraft: vi.fn() }));
vi.mock("@/lib/citations/verify", () => cite);

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
