// @vitest-environment node
// DEC-035 Google 로그인·내 질문 기록 — 돌아갈 주소 검사, 기록 남기기, 내 기록 API, 프로필 값. DB·인증은 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { parseCreateRequest } from "@/lib/inquiries/policy";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/lib/auth/server", () => auth);
const store = vi.hoisted(() => ({ listSavedInquiries: vi.fn() }));
vi.mock("@/lib/inquiries/store", () => store);
const supa = vi.hoisted(() => ({ exchange: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createUserClient: async () => ({ auth: { exchangeCodeForSession: supa.exchange } }),
  createServiceClient: () => ({ rpc: supa.rpc }),
}));

const { GET: callback, safeNext } = await import("@/app/auth/callback/route");
const { GET: myInquiries } = await import("@/app/api/v1/me/inquiries/route");
const { USER_DAILY_RATE, assertUserDaily } = await import("@/lib/auth/rate-limit");
const { profileOf } = await import("@/lib/client/auth");

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("DEC-035 로그인에서 돌아오는 주소", () => {
  test("같은 사이트의 경로만 받는다 — 바깥 주소는 홈으로", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("/inquiries/abc?x=1")).toBe("/inquiries/abc?x=1");
    for (const bad of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "me",
    ]) {
      expect(safeNext(bad)).toBe("/");
    }
  });

  test("로그인이 꺼져 있으면 코드를 쓰지 않고 홈으로 보낸다", async () => {
    const res = await callback(new Request("https://hz.test/auth/callback?code=abc&next=/me"));
    expect(res.headers.get("location")).toBe("https://hz.test/");
    expect(supa.exchange).not.toHaveBeenCalled();
  });

  test("켜져 있으면 코드를 세션으로 바꾸고 원래 화면으로 보낸다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_LOGIN", "on");
    supa.exchange.mockResolvedValue({ error: null });
    const res = await callback(new Request("https://hz.test/auth/callback?code=abc&next=/me"));
    expect(supa.exchange).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://hz.test/me");
  });

  test("교환이 실패해도 오류 내용을 주소에 싣지 않는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_LOGIN", "on");
    supa.exchange.mockResolvedValue({ error: { message: "secret detail" } });
    const res = await callback(
      new Request("https://hz.test/auth/callback?code=abc&next=//evil.example"),
    );
    expect(res.headers.get("location")).toBe("https://hz.test/?login=failed");
  });
});

describe("DEC-035 내 기록에 남기기", () => {
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

describe("DEC-035 로그인 사용자 하루 상한", () => {
  test("계정 하나가 하루 20회 — 카운터 키는 사용자 ID가 아니라 해시다", async () => {
    expect(USER_DAILY_RATE).toEqual({ bucket: "user_daily", limit: 20, windowSeconds: 86_400 });
    supa.rpc.mockResolvedValue({ data: true, error: null });
    await assertUserDaily("u-1");
    const args = supa.rpc.mock.calls[0][1];
    expect(args.p_bucket).toBe("user_daily");
    expect(args.p_key).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_key).not.toContain("u-1");
  });

  test("넘으면 RATE_LIMITED", async () => {
    supa.rpc.mockResolvedValue({ data: false, error: null });
    await expect(assertUserDaily("u-1")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("DEC-035 프로필 표시 값", () => {
  test("Google 프로필 사진은 https 주소만 쓴다", () => {
    expect(profileOf({ full_name: "홍길동", avatar_url: "https://lh3.example/a.png" })).toEqual({
      name: "홍길동",
      avatarUrl: "https://lh3.example/a.png",
    });
    expect(profileOf({ picture: "javascript:alert(1)" }, "user@example.com")).toEqual({
      name: "user",
      avatarUrl: null,
    });
    expect(profileOf(undefined).name).toBe("사용자");
  });
});
