// @vitest-environment node
// DEC-056 GET /me/profile — Google 이름·프로필 사진 주소를 본인에게만. 인증은 가짜, 이름·주소는 가상이다.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const supa = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({ auth: { getUser: supa.getUser } }),
  createServiceClient: () => ({}),
}));

const { GET } = await import("@/app/api/v1/me/profile/route");
const req = () => new Request("https://hz.test/api/v1/me/profile");

beforeEach(() => vi.clearAllMocks());

describe("DEC-056 GET /me/profile", () => {
  test("비로그인은 401", async () => {
    supa.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req(), {});
    expect(res.status).toBe(401);
  });

  test("로그인하면 이름·사진 주소만 돌려주고 이메일은 싣지 않는다", async () => {
    supa.getUser.mockResolvedValue({
      data: {
        user: {
          id: "u-1",
          email: "someone@example.com",
          user_metadata: {
            full_name: "가상이름",
            avatar_url: "https://lh3.googleusercontent.com/a/x",
            email: "someone@example.com",
          },
        },
      },
    });
    const res = await GET(req(), {});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.data).toEqual({
      name: "가상이름",
      avatarUrl: "https://lh3.googleusercontent.com/a/x",
    });
    expect(JSON.stringify(body)).not.toContain("example.com");
  });

  test("값이 없으면 null로 돌려준다", async () => {
    supa.getUser.mockResolvedValue({ data: { user: { id: "u-2", user_metadata: {} } } });
    const body = await (await GET(req(), {})).json();
    expect(body.data).toEqual({ name: null, avatarUrl: null });
  });
});
