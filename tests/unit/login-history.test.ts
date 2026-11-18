// @vitest-environment node
// DEC-039 내 질문 기록 — 기록 남기기 선택, 내 기록 API. DB·인증은 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { parseCreateRequest } from "@/lib/inquiries/policy";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/lib/auth/server", () => auth);
const store = vi.hoisted(() => ({ listSavedInquiries: vi.fn() }));
vi.mock("@/lib/inquiries/store", () => store);

const { GET: myInquiries } = await import("@/app/api/v1/me/inquiries/route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("DEC-039 내 기록에 남기기", () => {
  test("save는 참·거짓만 받고 기본은 남기지 않음", () => {
    expect(parseCreateRequest({ text: "질문" }).save).toBe(false);
    expect(parseCreateRequest({ text: "질문", save: true }).save).toBe(true);
    expect(() => parseCreateRequest({ text: "질문", save: "yes" })).toThrow();
  });

  test("GET /me/inquiries: 비로그인은 401, 로그인하면 자기 기록만 조회한다", async () => {
    auth.getActor.mockResolvedValue(null);
    const denied = await myInquiries(new Request("https://hz.test/api/v1/me/inquiries"), {});
    expect(denied.status).toBe(401);
    expect(store.listSavedInquiries).not.toHaveBeenCalled();

    auth.getActor.mockResolvedValue({ userId: "u-1", role: "user" });
    store.listSavedInquiries.mockResolvedValue([
      { id: "q-1", maskedText: "가린 문장", status: "analyzed", createdAt: "t", followup: false },
    ]);
    const res = await myInquiries(new Request("https://hz.test/api/v1/me/inquiries"), {});
    expect(res.status).toBe(200);
    expect(store.listSavedInquiries).toHaveBeenCalledWith("u-1");
    expect((await res.json()).data).toHaveLength(1);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
