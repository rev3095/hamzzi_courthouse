// @vitest-environment node
// GET /inquiries/{id}/result (API.md 4절) — 소유자만, 분석된 질문의 최신 결과만.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getOwnedInquiry: vi.fn(),
  getLatestResult: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);

const { GET } = await import("@/app/api/v1/inquiries/[id]/result/route");

const ID = "11111111-2222-3333-4444-555555555555";
const call = () =>
  GET(new Request(`http://localhost/api/v1/inquiries/${ID}/result`), {
    params: Promise.resolve({ id: ID }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
  store.getOwnedInquiry.mockResolvedValue({ id: ID, status: "analyzed" });
  store.getLatestResult.mockResolvedValue({ id: "r-1", response: { outcome: "grounded" } });
});

describe("GET /inquiries/{id}/result", () => {
  test("8.3 분석된 질문의 최신 결과를 돌려준다 (SSE가 끊겨도 다시 볼 수 있음)", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      status: "analyzed",
      resultId: "r-1",
      result: { outcome: "grounded" },
    });
  });

  test("분석 전이면 404", async () => {
    store.getOwnedInquiry.mockResolvedValue({ id: ID, status: "draft" });
    expect((await call()).status).toBe(404);
    expect(store.getLatestResult).not.toHaveBeenCalled();
  });

  test("남의 질문은 403", async () => {
    store.getOwnedInquiry.mockRejectedValue(new ApiError("FORBIDDEN"));
    expect((await call()).status).toBe(403);
  });
});
