// @vitest-environment node
// POST /documents/{kind}/draft (DEC-023, API.md 5절) — legal_documents 게이트 뒤의 초안 도우미 (절대 규칙 5·6, F-007).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { demoExamples, findExample, replayResult } from "@/lib/demo/policy";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ requireFeature: vi.fn() }));
vi.mock("@/lib/gate/store", () => gate);
const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getOwnedInquiry: vi.fn(),
  getLatestResult: vi.fn(),
  loadFollowupContext: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const rate = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  tryGlobalQuota: vi.fn(),
  settleAiQuota: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
  tryGlobalQuota: rate.tryGlobalQuota,
  // 주간·하루 상한 확인(DEC-026)도 같은 가짜로 본다
  tryAiQuota: rate.tryGlobalQuota,
}));
const mode = vi.hoisted(() => ({ aiMode: vi.fn() }));
vi.mock("@/lib/ai/mode", () => mode);
const ai = vi.hoisted(() => ({ draftFacts: vi.fn() }));
vi.mock("@/lib/ai/doc-draft", () => ai);

const { POST } = await import("@/app/api/v1/documents/[kind]/draft/route");

const ID = "11111111-2222-3333-4444-555555555555";
const lease = demoExamples().find((e) => e.id === "lease-01")!;

const call = (kind: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/v1/documents/${kind}/draft`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ kind }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireFeature.mockResolvedValue(undefined);
  store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
  store.getOwnedInquiry.mockResolvedValue({
    id: ID,
    status: "analyzed",
    masked_text: lease.question,
    parent_inquiry_id: null,
  });
  store.getLatestResult.mockResolvedValue({
    id: "r-1",
    response: replayResult(findExample(lease.question)!),
  });
  store.loadFollowupContext.mockResolvedValue([]);
  rate.assertRateLimit.mockResolvedValue(undefined);
  rate.tryGlobalQuota.mockResolvedValue(true);
  mode.aiMode.mockReturnValue("pro");
  ai.draftFacts.mockResolvedValue({
    ok: true,
    text: "1. 원고는 전세 계약을 맺었습니다.",
    missing: ["계약이 끝난 날짜가 언제인가요?"],
    dropped: [],
    costUsd: 0.0003,
  });
});

describe("POST /documents/{kind}/draft", () => {
  test("DEC-055 초안 도우미(AI 대리 작성)는 게이트 없이 열려 있다", async () => {
    gate.requireFeature.mockRejectedValue(
      new ApiError("FEATURE_GATED", { featureKey: "legal_documents", status: "pending_review" }),
    );
    const res = await call("complaint", { inquiryId: ID });
    expect(res.status).toBe(200);
    expect(gate.requireFeature).not.toHaveBeenCalled();
  });

  test("DEC-023 규칙 칸 + Haiku 사실관계, AI 고지, 저장 없음(no-store)", async () => {
    const res = await call("complaint", { inquiryId: ID });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(data.suggestions.caseName).toBe("임대차보증금 반환 청구의 소");
    expect(data.suggestions.evidence).toMatch(/^갑 제1호증/);
    expect(data.suggestions.claimCause).toBe("1. 원고는 전세 계약을 맺었습니다.");
    expect(data.ai).toEqual({ used: true });
    expect(data.notice).toBe("AI 생성 · 무료 법률 상담");
    // 모델에는 마스킹본 사연만 넘긴다 (이름·주소 칸은 이 API가 받지 않는다)
    expect(ai.draftFacts).toHaveBeenCalledWith({ kind: "complaint", maskedStory: lease.question });
  });

  test("이어 묻기면 앞선 질문(마스킹본)만 사연에 붙이고 AI 답변은 넣지 않는다", async () => {
    store.loadFollowupContext.mockResolvedValue([{ question: "앞 질문", answer: "AI 답변 요약" }]);
    await call("demand-letter", { inquiryId: ID });
    const story = ai.draftFacts.mock.calls[0][0].maskedStory as string;
    expect(story).toBe(`앞 질문\n${lease.question}`);
    expect(story).not.toContain("AI 답변 요약");
  });

  test("무료 모드·하루 상한 초과면 Claude 없이 규칙 칸만", async () => {
    mode.aiMode.mockReturnValue("free");
    let data = (await (await call("complaint", { inquiryId: ID })).json()).data;
    expect(data.ai).toEqual({ used: false, reason: "free_mode" });
    expect(data.notice).toBeNull();
    expect(data.suggestions.claimCause).toBeUndefined();
    expect(rate.tryGlobalQuota).not.toHaveBeenCalled();

    mode.aiMode.mockReturnValue("pro");
    rate.tryGlobalQuota.mockResolvedValue(false);
    data = (await (await call("complaint", { inquiryId: ID })).json()).data;
    expect(data.ai).toEqual({ used: false, reason: "daily_limit" });
    expect(ai.draftFacts).not.toHaveBeenCalled();
  });

  test("모델이 문장을 못 내면 규칙 칸만, 이유를 알려 준다", async () => {
    ai.draftFacts.mockResolvedValue({ ok: false, reason: "cost_cap", costUsd: 0 });
    const data = (await (await call("complaint", { inquiryId: ID })).json()).data;
    expect(data.ai).toEqual({ used: false, reason: "cost_cap" });
    expect(data.notice).toBeNull();
  });

  test("질문 번호가 없으면 400, 분석 전이면 409, 남의 질문이면 403", async () => {
    expect((await call("complaint", {})).status).toBe(400);
    store.getOwnedInquiry.mockResolvedValueOnce({ id: ID, status: "draft", masked_text: "" });
    expect((await call("complaint", { inquiryId: ID })).status).toBe(409);
    store.getOwnedInquiry.mockRejectedValueOnce(new ApiError("FORBIDDEN"));
    expect((await call("complaint", { inquiryId: ID })).status).toBe(403);
    expect(ai.draftFacts).not.toHaveBeenCalled();
  });

  test("모르는 문서 종류는 404", async () => {
    expect((await call("will", { inquiryId: ID })).status).toBe(404);
  });
});

describe("DEC-025 새 서식의 초안 도우미", () => {
  test("사실관계 칸이 없는 서식(간이대지급금)은 모델을 부르지 않고 하루 상한도 쓰지 않는다", async () => {
    const res = await call("wage-advance", { inquiryId: ID });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.ai).toEqual({ used: false, reason: "no_facts" });
    expect(data.notice).toBeNull();
    expect(ai.draftFacts).not.toHaveBeenCalled();
    expect(rate.tryGlobalQuota).not.toHaveBeenCalled();
  });

  test("고소장은 무고 서약이 붙는 문서라 AI 초안을 쓰지 않는다 (사용자가 직접 적는다)", async () => {
    const data = (await (await call("criminal-complaint", { inquiryId: ID })).json()).data;
    expect(data.ai).toEqual({ used: false, reason: "no_facts" });
    expect(data.suggestions.damageDetail).toBeUndefined();
    expect(ai.draftFacts).not.toHaveBeenCalled();
  });

  test("임차권등기명령은 신청이유 추가 사정 칸에 넣는다", async () => {
    const data = (await (await call("lease-registration", { inquiryId: ID })).json()).data;
    expect(data.suggestions.extraReason).toBe("1. 원고는 전세 계약을 맺었습니다.");
  });
});
