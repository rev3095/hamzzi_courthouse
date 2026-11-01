// @vitest-environment node
// POST /results/{id}/feedback (PRD 14, API.md 4절) — 소유자만, 의견은 마스킹본만 (F-007, DEC-006).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { parseFeedbackRequest } from "@/lib/inquiries/policy";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getOwnedResultId: vi.fn(),
  saveFeedback: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));

const { POST } = await import("@/app/api/v1/results/[id]/feedback/route");

const RID = "11111111-2222-3333-4444-555555555555";
const OWNER = { kind: "anon", anonSessionId: "anon-1" };
const call = (body: unknown) =>
  POST(
    new Request(`http://localhost/api/v1/results/${RID}/feedback`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: RID }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.resolveOwner.mockResolvedValue(OWNER);
  store.getOwnedResultId.mockResolvedValue(RID);
  store.saveFeedback.mockResolvedValue(undefined);
  rate.assertRateLimit.mockResolvedValue(undefined);
});

describe("POST /results/{id}/feedback", () => {
  test("PRD 14 도움 여부를 저장하고 204", async () => {
    const res = await call({ helpful: true });
    expect(res.status).toBe(204);
    expect(store.saveFeedback).toHaveBeenCalledWith(RID, OWNER, true, null);
  });

  test("F-007 의견은 마스킹본만 저장한다 (원문 전화번호가 저장되지 않음)", async () => {
    await call({ helpful: false, comment: "010-1234-5678로 연락 주세요" });
    const saved = store.saveFeedback.mock.calls[0][3] as string;
    expect(saved).not.toContain("010-1234-5678");
    expect(saved).toContain("[전화번호");
  });

  test("F-007 AC2 민감정보로 보이는 의견은 동의 절차가 없어 저장하지 않는다 (도움 여부만)", () => {
    expect(parseFeedbackRequest({ helpful: true, comment: "우울증 진단을 받았어요" })).toEqual({
      helpful: true,
      commentMasked: null,
    });
  });

  test("9.2 남의 결과는 403, 없으면 404 — 저장하지 않는다", async () => {
    store.getOwnedResultId.mockRejectedValue(new ApiError("FORBIDDEN"));
    expect((await call({ helpful: true })).status).toBe(403);
    store.getOwnedResultId.mockRejectedValue(new ApiError("NOT_FOUND"));
    expect((await call({ helpful: true })).status).toBe(404);
    expect(store.saveFeedback).not.toHaveBeenCalled();
  });

  test("형식 오류 400 (helpful 없음, 의견 500자 초과)", async () => {
    expect((await call({ comment: "좋아요" })).status).toBe(400);
    expect((await call({ helpful: true, comment: "가".repeat(501) })).status).toBe(400);
  });

  test("레이트 리밋 초과 429", async () => {
    rate.assertRateLimit.mockRejectedValue(new ApiError("RATE_LIMITED"));
    expect((await call({ helpful: true })).status).toBe(429);
    expect(store.saveFeedback).not.toHaveBeenCalled();
  });
});
