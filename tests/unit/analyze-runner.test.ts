// @vitest-environment node
// 분석 실행 순서 (P5): 분석 → 검증 → 비로그인 횟수 차감 → 저장. 실패하면 failed 표시 (DEC-010, F-005).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LONG_DEEP, QUICK_WEIGHT, TIERS } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";

vi.mock("server-only", () => ({}));
const calls: string[] = [];
const store = vi.hoisted(() => ({
  loadFollowupContext: vi.fn(),
  finishAnalysis: vi.fn(),
  markInquiryFailed: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const lite = vi.hoisted(() => ({ runLiteAnalysis: vi.fn() }));
vi.mock("@/lib/ai/lite", () => lite);
// 긴 질문(DEC-062)은 DeepSearch로 간다. DeepSearch 안쪽은 lib/ai/deep-policy.test.ts·실호출 테스트가 본다
const deepMod = vi.hoisted(() => ({ runDeepAnalysis: vi.fn() }));
vi.mock("@/lib/ai/deep", () => deepMod);
// 빠른 답 먼저(DEC-064). 거르기는 lib/ai/quick-policy.test.ts가 본다
const quickMod = vi.hoisted(() => ({ QUICK_MODEL: "claude-haiku-5-5", runQuickPreview: vi.fn() }));
vi.mock("@/lib/ai/quick", () => quickMod);
// 절차 분류 보조(DEC-037)는 tests/unit/procedure-labels.test.ts에서 따로 본다
const hint = vi.hoisted(() => ({ procedureHintFor: vi.fn(async () => undefined) }));
vi.mock("@/lib/inquiries/procedure-hint", () => hint);
const free = vi.hoisted(() => ({ runFreeAnalysis: vi.fn() }));
vi.mock("@/lib/demo/free", () => free);
const cite = vi.hoisted(() => ({ verifyDraft: vi.fn() }));
vi.mock("@/lib/citations/verify", () => cite);
const rate = vi.hoisted(() => ({
  // 주간·하루 상한 확인 (DEC-026). 실제 숫자는 lib/ai/models.test.ts가 본다
  tryAiQuota: vi.fn(async () => true),
  settleAiQuota: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/rate-limit", () => rate);

const { analyzeInquiry } = await import("@/lib/inquiries/analyze");

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
  deepMod.runDeepAnalysis.mockImplementation(async () => ({
    draft: { answer: { points: [] } },
    evidence: {},
    dropped: [],
    usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0 },
    model: "claude-opus-5-5",
    promptVersion: "deep",
    costUsd: 0.5,
    struct: null,
    drafted: [],
    plan: null,
  }));
  // 유료 경로: 키가 있고 AI_MODE=free가 아니다 (DEC-036). 무료 모드는 아래 describe에서 따로 본다
  vi.stubEnv("AI_MODE", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.clearAllMocks();
  hint.procedureHintFor.mockResolvedValue(undefined);
  calls.length = 0;
  store.loadFollowupContext.mockResolvedValue([{ question: "앞 질문", answer: "앞 답" }]);
  lite.runLiteAnalysis.mockImplementation(async () => {
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

describe("DEC-064 빠른 답 먼저", () => {
  const PREVIEW = { summary: "보증금 문제로 보여요.", checks: [], nextSteps: [] };
  test("SSE 요청이면 Haiku 요약을 넘기고, 예산에 요약 몫을 더해 실제 비용으로 정산한다", async () => {
    quickMod.runQuickPreview.mockResolvedValue({ preview: PREVIEW, costUsd: 0.0005 });
    lite.runLiteAnalysis.mockResolvedValueOnce({
      draft: { answer: { points: [] } },
      evidence: {},
      dropped: [],
      usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0 },
      model: "claude-opus-5-5",
      promptVersion: "v",
      costUsd: 0.1,
    });
    const got: unknown[] = [];
    const out = await analyzeInquiry(INQ, ANON, new Headers(), undefined, {
      onPreview: (p) => got.push(p),
    });
    expect(got).toEqual([PREVIEW]);
    expect(rate.tryAiQuota).toHaveBeenCalledWith(TIERS.max.weight + QUICK_WEIGHT);
    expect((rate.settleAiQuota.mock.calls[0] as unknown as [number, number])[1]).toBeCloseTo(
      0.1005,
    );
    expect((out.result as { timing?: { previewMs?: number } }).timing?.previewMs).toEqual(
      expect.any(Number),
    );
  });

  test("받을 곳이 없거나(일반 JSON 요청) 답변 모델이 Haiku(Light)면 부르지 않는다", async () => {
    await analyzeInquiry(INQ, ANON, new Headers());
    await analyzeInquiry(INQ, ANON, new Headers(), undefined, {
      tier: "light",
      onPreview: () => {},
    });
    expect(quickMod.runQuickPreview).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).toHaveBeenLastCalledWith(TIERS.light.weight);
  });

  test("요약이 걸러져 없으면 화면으로 보내지 않는다", async () => {
    quickMod.runQuickPreview.mockResolvedValue({ preview: null, costUsd: 0.0004 });
    const got: unknown[] = [];
    await analyzeInquiry(INQ, ANON, new Headers(), undefined, { onPreview: (p) => got.push(p) });
    expect(got).toEqual([]);
  });
});

describe("DEC-062 긴 질문 = 자동 DeepSearch", () => {
  test("가린 질문이 100자를 넘으면 DeepSearch 버튼 없이도 Opus xhigh DeepSearch, 상한·가중치는 LONG_DEEP", async () => {
    await analyzeInquiry(
      { ...INQ, masked_text: "가".repeat(101) },
      ANON,
      new Headers(),
      undefined,
      {
        tier: "light",
      },
    );
    expect(lite.runLiteAnalysis).not.toHaveBeenCalled();
    expect(deepMod.runDeepAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ long: true, tier: "max", costCapUsd: LONG_DEEP.capUsd }),
    );
    expect(rate.tryAiQuota).toHaveBeenCalledWith(LONG_DEEP.weight);
  });

  test("100자 이하는 일반 답변 그대로 (고른 단계)", async () => {
    await analyzeInquiry(
      { ...INQ, masked_text: "가".repeat(100) },
      ANON,
      new Headers(),
      undefined,
      {
        tier: "light",
      },
    );
    expect(deepMod.runDeepAnalysis).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).toHaveBeenCalledWith(TIERS.light.weight);
  });

  test("긴 비서 질문도 DeepSearch로, 비서 말투·프롬프트 꼬리표를 넘긴다", async () => {
    await analyzeInquiry(
      { ...INQ, masked_text: "가".repeat(120) },
      ANON,
      new Headers(),
      undefined,
      {
        assistant: "home",
      },
    );
    expect(deepMod.runDeepAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        long: true,
        persona: expect.any(String),
        promptTag: "assistant-home-v3",
      }),
    );
  });
});

describe("analyzeInquiry", () => {
  test("DEC-010 분석·검증이 성공한 뒤 차감·저장(한 트랜잭션)을 한다", async () => {
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(calls).toEqual(["analyze", "verify", "finish"]);
    expect(out).toEqual({ resultId: "r-1", result: RESULT });
    // 단계를 보내지 않으면 Pro Max (DEC-050)
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      { maskedText: "마스킹본", context: [{ question: "앞 질문", answer: "앞 답" }] },
      expect.objectContaining({ tier: "max" }),
    );
    expect(rate.tryAiQuota).toHaveBeenCalledWith(400);
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
    lite.runLiteAnalysis.mockRejectedValue(new ApiError("MODEL_FAILED"));
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

describe("DEC-015 무료 모드", () => {
  test("AI_MODE=free면 Claude 분석을 부르지 않고 무료 분석 결과를 같은 트랜잭션으로 저장한다", async () => {
    vi.stubEnv("AI_MODE", "free");
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "search_only", outcome: "grounded" },
      citations: [],
      stats: { total: 0, removed: 0 },
      model: "search_only",
    });
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(lite.runLiteAnalysis).not.toHaveBeenCalled();
    expect(cite.verifyDraft).not.toHaveBeenCalled();
    // 무료 모드의 절차 분류는 저장된 라벨만 본다 (모델 없음)
    expect(hint.procedureHintFor).toHaveBeenCalledWith(
      expect.anything(),
      "마스킹본",
      expect.objectContaining({ allowAi: false }),
    );
    expect(free.runFreeAnalysis).toHaveBeenCalledWith("마스킹본", expect.anything());
    expect(store.finishAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "search_only",
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
      ANON,
      expect.any(Headers),
      // 예시가 아닌 실제 질문은 무료 모드(검색 전용)라도 하루 횟수에서 1회를 쓴다
      { consumeAnonQuota: true },
    );
    expect(out.result).toMatchObject({ mode: "search_only" });
    // 무료 모드는 주간 Claude 상한 카운터를 올리지 않는다
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("키가 없으면 AI_MODE와 상관없이 무료 모드", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "search_only", outcome: "grounded" },
      citations: [],
      stats: { total: 0, removed: 0 },
      model: "search_only",
    });
    await analyzeInquiry(INQ, ANON, new Headers(), undefined, { tier: "max" });
    expect(lite.runLiteAnalysis).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("DEC-026 주간 전체 상한을 넘으면 Claude를 부르지 않고 무료 분석으로 처리한다", async () => {
    rate.tryAiQuota.mockResolvedValueOnce(false);
    free.runFreeAnalysis.mockResolvedValue({
      result: { mode: "search_only", outcome: "grounded" },
      citations: [],
      stats: { total: 0, removed: 0 },
      model: "search_only",
    });
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(lite.runLiteAnalysis).not.toHaveBeenCalled();
    expect(free.runFreeAnalysis).toHaveBeenCalled();
    expect(out.result).toMatchObject({ mode: "search_only" });
  });

  test("무료 분석이 실패해도 횟수를 차감하지 않고 failed로 표시한다", async () => {
    vi.stubEnv("AI_MODE", "free");
    free.runFreeAnalysis.mockRejectedValue(new ApiError("SEARCH_UPSTREAM_FAILED"));
    await expect(analyzeInquiry(INQ, ANON, new Headers())).rejects.toMatchObject({
      code: "SEARCH_UPSTREAM_FAILED",
    });
    expect(store.finishAnalysis).not.toHaveBeenCalled();
    expect(store.markInquiryFailed).toHaveBeenCalledWith("inq-1");
  });
});

describe("DEC-036 사용자가 고른 단계로 답변한다", () => {
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

  test.each([
    ["light", 2],
    ["pro", 20],
    ["max", 400],
  ] as const)("%s 단계는 주간 예산을 %i단위 쓰고 그 단계로 답변한다", async (tier, weight) => {
    lite.runLiteAnalysis.mockResolvedValue(LITE_OUT);
    await analyzeInquiry(INQ, ANON, new Headers(), undefined, { tier });
    expect(rate.tryAiQuota).toHaveBeenCalledWith(weight);
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      { maskedText: "마스킹본", context: expect.anything() },
      expect.objectContaining({ tier }),
    );
    expect(cite.verifyDraft).toHaveBeenCalled();
    expect(store.finishAnalysis).toHaveBeenCalled();
  });

  test("F-018 DEC-057 비서 질문은 고른 단계와 상관없이 Pro Max(Opus)로 답하고 대화 한마디 지시문을 넘긴다", async () => {
    lite.runLiteAnalysis.mockResolvedValue({
      ...LITE_OUT,
      talk: { reply: "많이 놀라셨겠어요.", asks: [] },
    });
    cite.verifyDraft.mockResolvedValue({
      result: { ...RESULT },
      citations: [],
      stats: { total: 1, removed: 0, quoteMismatch: 0 },
    });
    const out = await analyzeInquiry(INQ, ANON, new Headers(), undefined, {
      tier: "light",
      assistant: "market",
    });
    expect(rate.tryAiQuota).toHaveBeenCalledWith(TIERS.max.weight);
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      { maskedText: "마스킹본", context: expect.anything() },
      expect.objectContaining({
        tier: "max",
        assistant: expect.objectContaining({
          promptTag: "assistant-market-v3",
          talkSystem: expect.stringContaining("중고천국"),
        }),
      }),
    );
    expect(out.result).toMatchObject({
      assistant: "market",
      assistantTalk: { reply: "많이 놀라셨겠어요.", asks: [] },
    });
  });

  test("F-018 DEC-057 에이전트 질문은 deep을 보내도 DeepSearch가 아니라 일반 답변 경로(지시문·대화 한마디)로 간다", async () => {
    lite.runLiteAnalysis.mockResolvedValue(LITE_OUT);
    await analyzeInquiry(INQ, ANON, new Headers(), undefined, { assistant: "home", deep: true });
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        assistant: expect.objectContaining({ promptTag: "assistant-home-v3" }),
      }),
    );
    expect(rate.tryAiQuota).toHaveBeenCalledWith(TIERS.max.weight);
  });

  test("DEC-037 승인된 절차 라벨이 있으면 결과에 싣는다 (유료 경로는 분류 호출 허용)", async () => {
    lite.runLiteAnalysis.mockResolvedValue(LITE_OUT);
    cite.verifyDraft.mockResolvedValue({
      result: { outcome: "grounded" },
      citations: [],
      stats: {},
    });
    hint.procedureHintFor.mockResolvedValue({ kind: "track", track: "neighbor" } as never);
    const out = await analyzeInquiry(INQ, ANON, new Headers());
    expect(hint.procedureHintFor).toHaveBeenCalledWith(
      expect.anything(),
      "마스킹본",
      expect.objectContaining({ allowAi: true }),
    );
    expect(out.result.procedureHint).toEqual({ kind: "track", track: "neighbor" });
  });

  test("DEC-027 유료 모드라도 예시 질문은 미리 만든 분석을 재생 — 주간 상한도, 비로그인 하루 횟수도 쓰지 않는다 (비용 0)", async () => {
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
    vi.stubEnv("AI_MODE", "free");
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

  describe("DEC-040 기간 예산 정산", () => {
    test("답변 뒤 그 단계 가중치와 실제 비용으로 정산한다", async () => {
      rate.settleAiQuota.mockClear();
      lite.runLiteAnalysis.mockResolvedValue({ ...LITE_OUT, costUsd: 0.0204 });
      await analyzeInquiry(INQ, ANON, new Headers(), undefined, { tier: "pro" });
      expect(rate.settleAiQuota).toHaveBeenCalledWith(20, 0.0204);
    });

    test("예산을 못 잡아 무료로 처리한 질문은 정산하지 않는다", async () => {
      rate.settleAiQuota.mockClear();
      rate.tryAiQuota.mockResolvedValueOnce(false);
      await analyzeInquiry(INQ, ANON, new Headers(), undefined, { tier: "max" });
      expect(rate.settleAiQuota).not.toHaveBeenCalled();
    });
  });
});

describe("F-017 첨부 자료 (DEC-058)", () => {
  const MATERIAL = {
    kind: "문자",
    summary: "보증금을 다음 달에 돌려주겠다는 문자입니다.",
    details: [],
    gaps: [],
  };

  test("저장된 자료를 분석에 넘기고, 검증을 통과한 문단과 이은 자료 정리를 결과에 싣는다", async () => {
    lite.runLiteAnalysis.mockResolvedValueOnce({
      draft: { answer: { points: [] } },
      evidence: {},
      dropped: [],
      usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0 },
      model: "claude-opus-5-5",
      promptVersion: "v",
      materialRefs: [{ text: "남은 문단", materials: [1] }],
    });
    cite.verifyDraft.mockResolvedValueOnce({
      result: { outcome: "grounded", answer: { points: [{ text: "남은 문단" }] } },
      citations: [],
      stats: { total: 1, removed: 0, quoteMismatch: 0 },
    });
    const out = await analyzeInquiry({ ...INQ, materials: [MATERIAL] }, ANON, new Headers());
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ materials: [MATERIAL] }),
      expect.anything(),
    );
    expect((out.result as { materials?: unknown }).materials).toEqual({
      items: [{ ...MATERIAL, points: [0] }],
    });
  });

  test("자료 글자 수도 긴 질문 상한 계산에 넣는다 (상한·예산 가중치가 그만큼 늘어난다)", async () => {
    const long = { ...MATERIAL, summary: "가".repeat(200), details: ["나".repeat(80)] };
    const many = Array.from({ length: 30 }, () => long);
    cite.verifyDraft.mockResolvedValueOnce({
      result: { outcome: "grounded", answer: { points: [] } },
      citations: [],
      stats: { total: 0, removed: 0, quoteMismatch: 0 },
    });
    await analyzeInquiry(
      { ...INQ, masked_text: "가".repeat(1_990), materials: many },
      ANON,
      new Headers(),
    );
    // 1,990자 질문은 긴 질문이라 DeepSearch(Opus xhigh)로 간다 (DEC-062) — 자료 몫만큼 그 상한·가중치 위로 늘어난다
    const [, deps] = deepMod.runDeepAnalysis.mock.calls[0] as [unknown, { costCapUsd: number }];
    expect(deps.costCapUsd).toBeGreaterThan(LONG_DEEP.capUsd);
    expect(rate.tryAiQuota).toHaveBeenCalledWith(expect.any(Number));
    expect((rate.tryAiQuota.mock.calls[0] as unknown as [number])[0]).toBeGreaterThan(
      LONG_DEEP.weight,
    );
  });

  test("모양이 틀린 저장 값은 없는 것으로 본다", async () => {
    await analyzeInquiry({ ...INQ, materials: [{ kind: "모름" }] }, ANON, new Headers());
    expect(lite.runLiteAnalysis).toHaveBeenCalledWith(
      expect.not.objectContaining({ materials: expect.anything() }),
      expect.anything(),
    );
  });
});
