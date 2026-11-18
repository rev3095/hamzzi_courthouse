// @vitest-environment node
// GET /me/quota — 남은 비로그인 질문 수 (F-001 AC3, DEC-010). DB·인증은 목으로 바꾼다.
import { beforeEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getAnonQuestionsUsed: vi.fn(),
  getUserQuestionsUsed: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);

const { GET } = await import("@/app/api/v1/me/quota/route");
const get = () => GET(new Request("http://localhost/api/v1/me/quota"), undefined);

beforeEach(() => vi.clearAllMocks());

describe("GET /me/quota", () => {
  test("F-001 AC3 첫 방문자는 세션을 만들지 않고 하루 한도(5회, DEC-031) 남음", async () => {
    store.resolveOwner.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      anonymous: true,
      used: 0,
      limit: 5,
      remaining: 5,
      loginRequired: false,
      admin: false,
    });
    expect(store.resolveOwner.mock.calls[0][1]).toEqual({ create: false });
  });

  test("F-001 AC3 한도를 다 쓴 비로그인은 loginRequired", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "a1" });
    store.getAnonQuestionsUsed.mockResolvedValue(5);
    expect((await (await get()).json()).data).toMatchObject({ remaining: 0, loginRequired: true });
  });

  test("DEC-035 Google 로그인 사용자는 하루 10회 기준 남은 횟수", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "user", userId: "u1" });
    store.getUserQuestionsUsed.mockResolvedValue(4);
    expect((await (await get()).json()).data).toEqual({
      anonymous: false,
      used: 4,
      limit: 10,
      remaining: 6,
      loginRequired: false,
      admin: false,
    });
    expect(store.getUserQuestionsUsed).toHaveBeenCalledWith("u1");
    expect(store.getAnonQuestionsUsed).not.toHaveBeenCalled();
  });

  test("DEC-024 관리자 모드는 횟수 없이 무제한 (DB 횟수를 읽지 않는다)", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "a1", admin: true });
    expect((await (await get()).json()).data).toEqual({
      anonymous: true,
      used: null,
      limit: null,
      remaining: null,
      loginRequired: false,
      admin: true,
    });
    expect(store.getAnonQuestionsUsed).not.toHaveBeenCalled();
  });
});
