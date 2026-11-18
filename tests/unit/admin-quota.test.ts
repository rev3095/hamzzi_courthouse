// @vitest-environment node
// DEC-024 비로그인 하루 3회(한국 시간 0시 초기화) + 관리자 모드(비밀번호 서명 쿠키). 순수 규칙과 관리자 로그인 API.
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ADMIN_TTL_MS,
  adminSecrets,
  issueAdminToken,
  passcodeMatches,
  verifyAdminToken,
} from "@/lib/auth/admin-pass";
import { countsAnonQuota, kstDay, questionsUsedToday } from "@/lib/inquiries/policy";

vi.mock("server-only", () => ({}));
const session = vi.hoisted(() => ({ setAdminCookie: vi.fn(), clearAdminCookie: vi.fn() }));
vi.mock("@/lib/auth/admin-session", () => session);
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn(), tryGlobalQuota: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => rate);

const { POST, DELETE } = await import("@/app/api/v1/admin/session/route");

// 테스트용 가짜 값 (실제 비밀번호·키 아님)
const SECRETS = { passcode: "test-pass", serverSecret: "test-server-secret" };

describe("DEC-024 하루 3회 — 한국 시간 날짜", () => {
  test("UTC 15:00 = 한국 0시에 날짜가 바뀐다", () => {
    expect(kstDay(Date.parse("2026-11-17T14:59:59Z"))).toBe("2026-11-17");
    expect(kstDay(Date.parse("2026-11-17T15:00:00Z"))).toBe("2026-11-18");
  });

  test("오늘 센 값만 쓰고, 어제 센 값·센 적 없음은 0", () => {
    const now = Date.parse("2026-11-17T03:00:00Z");
    expect(questionsUsedToday(3, "2026-11-17", now)).toBe(3);
    expect(questionsUsedToday(3, "2026-11-16", now)).toBe(0);
    expect(questionsUsedToday(2, null, now)).toBe(0);
  });

  test("관리자 모드는 비로그인 횟수 제한을 받지 않는다", () => {
    expect(countsAnonQuota({ kind: "anon", anonSessionId: "a" })).toBe(true);
    expect(countsAnonQuota({ kind: "anon", anonSessionId: "a", admin: true })).toBe(false);
    expect(countsAnonQuota({ kind: "user", userId: "u" })).toBe(false);
  });
});

describe("DEC-024 관리자 비밀번호·쿠키", () => {
  test("환경변수 두 개가 다 있어야 켜진다", () => {
    expect(adminSecrets({})).toBeNull();
    expect(adminSecrets({ ADMIN_PASSCODE: "x" })).toBeNull();
    expect(adminSecrets({ ADMIN_PASSCODE: " x ", SUPABASE_SERVICE_ROLE_KEY: "k" })).toEqual({
      passcode: "x",
      serverSecret: "k",
    });
  });

  test("DEC-024 ADMIN_PASSWORD 이름으로 넣어도 켜지고, 둘 다 있으면 ADMIN_PASSCODE를 쓴다", () => {
    expect(adminSecrets({ ADMIN_PASSWORD: " y ", SUPABASE_SERVICE_ROLE_KEY: "k" })).toEqual({
      passcode: "y",
      serverSecret: "k",
    });
    expect(
      adminSecrets({ ADMIN_PASSCODE: "x", ADMIN_PASSWORD: "y", SUPABASE_SERVICE_ROLE_KEY: "k" }),
    ).toEqual({ passcode: "x", serverSecret: "k" });
    expect(
      adminSecrets({ ADMIN_PASSCODE: " ", ADMIN_PASSWORD: "", SUPABASE_SERVICE_ROLE_KEY: "k" }),
    ).toBeNull();
  });

  test("비밀번호 대조", () => {
    expect(passcodeMatches("test-pass", SECRETS)).toBe(true);
    expect(passcodeMatches("test-pas", SECRETS)).toBe(false);
    expect(passcodeMatches(1234, SECRETS)).toBe(false);
    expect(passcodeMatches("", SECRETS)).toBe(false);
  });

  test("서명 쿠키: 만료 전에만 유효, 변조·다른 비밀번호·다른 서버 비밀이면 무효", () => {
    const now = Date.parse("2026-11-17T00:00:00Z");
    const token = issueAdminToken(SECRETS, now);
    expect(verifyAdminToken(token, SECRETS, now + 1000)).toBe(true);
    expect(verifyAdminToken(token, SECRETS, now + ADMIN_TTL_MS + 1)).toBe(false);
    expect(
      verifyAdminToken(
        token.replace(/.$/, (c) => (c === "0" ? "1" : "0")),
        SECRETS,
        now,
      ),
    ).toBe(false);
    expect(verifyAdminToken(token, { ...SECRETS, passcode: "changed" }, now)).toBe(false);
    expect(verifyAdminToken(token, { ...SECRETS, serverSecret: "other" }, now)).toBe(false);
    expect(verifyAdminToken(undefined, SECRETS, now)).toBe(false);
    expect(verifyAdminToken(token, null, now)).toBe(false);
    // 만료를 늘려 서명 없이 만든 값
    expect(verifyAdminToken(`${now + ADMIN_TTL_MS * 10}.${"0".repeat(64)}`, SECRETS, now)).toBe(
      false,
    );
  });
});

const login = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/admin/session", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    undefined,
  );

describe("POST·DELETE /admin/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_PASSCODE", "test-pass");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-server-secret");
    rate.assertRateLimit.mockResolvedValue(undefined);
    rate.tryGlobalQuota.mockResolvedValue(true);
  });

  test("맞는 비밀번호면 쿠키를 심고 200, 틀리면 401·쿠키 없음", async () => {
    const ok = await login({ passcode: "test-pass" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ admin: true });
    expect(session.setAdminCookie).toHaveBeenCalledTimes(1);

    const bad = await login({ passcode: "wrong" });
    expect(bad.status).toBe(401);
    expect(JSON.stringify(await bad.json())).not.toContain("wrong");
    expect(session.setAdminCookie).toHaveBeenCalledTimes(1);
  });

  test("시도 상한: 같은 네트워크·사이트 전체 상한을 비밀번호 대조 전에 본다", async () => {
    rate.tryGlobalQuota.mockResolvedValue(false);
    const res = await login({ passcode: "test-pass" });
    expect(res.status).toBe(429);
    expect(session.setAdminCookie).not.toHaveBeenCalled();
    expect(rate.assertRateLimit.mock.calls[0][0]).toMatchObject({
      bucket: "admin_login",
      limit: 5,
    });
  });

  test("ADMIN_PASSCODE가 없으면 관리자 모드가 없다 (404)", async () => {
    vi.stubEnv("ADMIN_PASSCODE", "");
    expect((await login({ passcode: "" })).status).toBe(404);
  });

  test("끄기는 쿠키를 지운다", async () => {
    const res = await DELETE(new Request("http://localhost/api/v1/admin/session"), undefined);
    expect(res.status).toBe(200);
    expect(session.clearAdminCookie).toHaveBeenCalled();
  });
});
