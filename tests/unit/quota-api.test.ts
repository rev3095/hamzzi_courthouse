// @vitest-environment node
// GET /me/quota — 남은 비로그인 질문 수 (F-001 AC3, DEC-010). DB·인증은 목으로 바꾼다.
import { beforeEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getAnonQuestionsUsed: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);

const { GET } = await import("@/app/api/v1/me/quota/route");
const get = () => GET(new Request("http://localhost/api/v1/me/quota"), undefined);

beforeEach(() => vi.clearAllMocks());

describe("GET /me/quota", () => {
  test("F-001 AC3 첫 방문자는 세션을 만들지 않고 3회 남음", async () => {
    store.resolveOwner.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      anonymous: true,
      used: 0,
      limit: 3,
      remaining: 3,
      loginRequired: false,
    });
    expect(store.resolveOwner.mock.calls[0][1]).toEqual({ create: false });
  });

  test("F-001 AC3 3회를 쓴 비로그인은 loginRequired", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "a1" });
    store.getAnonQuestionsUsed.mockResolvedValue(3);
    expect((await (await get()).json()).data).toMatchObject({ remaining: 0, loginRequired: true });
  });

  test("로그인 사용자는 비로그인 횟수가 없다", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "user", userId: "u1" });
    expect((await (await get()).json()).data).toEqual({
      anonymous: false,
      used: null,
      limit: null,
      remaining: null,
      loginRequired: false,
    });
    expect(store.getAnonQuestionsUsed).not.toHaveBeenCalled();
  });
});
