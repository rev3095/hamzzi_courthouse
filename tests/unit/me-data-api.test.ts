// @vitest-environment node
// DELETE /me/data — 내 기록 삭제 (PRD 9.2, DEC-018 제안). 감사 로그·질문 횟수 유지는 DB 함수(db:verify)에서 검사한다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  deleteAnonData: vi.fn(),
  requestUserDeletion: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));

const { DELETE } = await import("@/app/api/v1/me/data/route");
const call = () => DELETE(new Request("http://localhost/api/v1/me/data", { method: "DELETE" }), {});

beforeEach(() => {
  vi.clearAllMocks();
  rate.assertRateLimit.mockResolvedValue(undefined);
  store.deleteAnonData.mockResolvedValue(2);
  store.requestUserDeletion.mockResolvedValue("del-1");
});

describe("DELETE /me/data", () => {
  test("9.2 비로그인은 자기 익명 세션 기록만 바로 지운다", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ status: "completed", deletedInquiries: 2 });
    expect(store.deleteAnonData).toHaveBeenCalledWith("anon-1", expect.any(Headers));
    // 쿠키가 없으면 새 익명 세션을 만들지 않는다
    expect(store.resolveOwner).toHaveBeenCalledWith(expect.anything(), { create: false });
  });

  test("쿠키가 없으면 지울 것이 없다 (0건, DB 호출 없음)", async () => {
    store.resolveOwner.mockResolvedValue(null);
    expect((await (await call()).json()).data).toEqual({
      status: "completed",
      deletedInquiries: 0,
    });
    expect(store.deleteAnonData).not.toHaveBeenCalled();
  });

  test("로그인 사용자는 삭제 요청 접수 202", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "user", userId: "u-1" });
    const res = await call();
    expect(res.status).toBe(202);
    expect((await res.json()).data).toEqual({ status: "received", deletionRequestId: "del-1" });
  });

  test("레이트 리밋 초과 429 — 지우지 않는다", async () => {
    rate.assertRateLimit.mockRejectedValue(new ApiError("RATE_LIMITED"));
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
    expect((await call()).status).toBe(429);
    expect(store.deleteAnonData).not.toHaveBeenCalled();
  });
});
