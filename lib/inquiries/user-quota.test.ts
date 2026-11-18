// DEC-035 Google 로그인 사용자: 하루 질문 한도, 로그인 전 질문 소유권, 로그인 뒤 돌아갈 주소
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { safeNextPath } from "@/lib/auth/next-path";
import {
  USER_QUESTION_LIMIT,
  assertUserQuota,
  countsAnonQuota,
  countsUserQuota,
  isOwner,
  kstDayStartIso,
  quotaView,
} from "./policy";

const caught = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("예외 없음");
};

describe("DEC-035 로그인 사용자 하루 한도", () => {
  test("DEC-035 한도 전에는 통과, 다 쓰면 429 RATE_LIMITED user_daily", () => {
    expect(() => assertUserQuota(USER_QUESTION_LIMIT - 1)).not.toThrow();
    const err = caught(() => assertUserQuota(USER_QUESTION_LIMIT));
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.details).toMatchObject({ reason: "user_daily", limit: USER_QUESTION_LIMIT });
  });

  test("DEC-035 quota 보기: 로그인 사용자는 n/한도, 로그인 필요 아님", () => {
    expect(quotaView({ kind: "user", userId: "u" }, 3)).toEqual({
      anonymous: false,
      used: 3,
      limit: USER_QUESTION_LIMIT,
      remaining: USER_QUESTION_LIMIT - 3,
      loginRequired: false,
      admin: false,
    });
    expect(quotaView({ kind: "user", userId: "u" }, 99).remaining).toBe(0);
    expect(quotaView({ kind: "user", userId: "u", admin: true }, 99)).toMatchObject({
      admin: true,
      remaining: null,
    });
  });

  test("DEC-035 관리자 모드면 로그인 사용자 한도도 받지 않는다", () => {
    expect(countsUserQuota({ kind: "user", userId: "u" })).toBe(true);
    expect(countsUserQuota({ kind: "user", userId: "u", admin: true })).toBe(false);
    expect(countsUserQuota({ kind: "anon", anonSessionId: "a" })).toBe(false);
    expect(countsAnonQuota({ kind: "user", userId: "u" })).toBe(false);
  });

  test("DEC-035 오늘 0시(한국 시간) 기준 시각", () => {
    // 2026-11-18 23:30 UTC = 2026-11-19 08:30 KST
    expect(kstDayStartIso(Date.UTC(2026, 10, 18, 23, 30))).toBe("2026-11-19T00:00:00+09:00");
    expect(kstDayStartIso(Date.UTC(2026, 10, 18, 14, 59))).toBe("2026-11-18T00:00:00+09:00");
  });
});

describe("DEC-035 로그인 전 질문 소유권", () => {
  const user = { kind: "user", userId: "u1", anonSessionId: "a1" } as const;
  test("DEC-035 같은 브라우저에서 로그인 전에 한 질문은 로그인 뒤에도 본인 것", () => {
    expect(isOwner({ userId: null, anonSessionId: "a1" }, user)).toBe(true);
  });
  test("DEC-035 다른 브라우저의 질문·다른 계정에 연결된 질문은 아니다", () => {
    expect(isOwner({ userId: null, anonSessionId: "a2" }, user)).toBe(false);
    expect(isOwner({ userId: "u2", anonSessionId: "a1" }, user)).toBe(false);
    expect(isOwner({ userId: null, anonSessionId: "a1" }, { kind: "user", userId: "u1" })).toBe(
      false,
    );
  });
});

describe("DEC-035 로그인 뒤 돌아갈 주소", () => {
  test("DEC-035 사이트 안 경로만 그대로", () => {
    expect(safeNextPath("/me")).toBe("/me");
    expect(safeNextPath("/inquiries/abc")).toBe("/inquiries/abc");
  });
  test("DEC-035 외부 주소·프로토콜 상대 주소·역슬래시·콜백 자신은 마이페이지로", () => {
    for (const bad of [
      null,
      "",
      "https://evil.example",
      "//evil.example",
      String.raw`/\evil.example`,
      "/%0a",
      "/a\nb",
      "/auth/callback",
      "me",
      `/${"a".repeat(600)}`,
    ]) {
      expect(safeNextPath(bad), String(bad)).toBe(bad === "/%0a" ? "/%0a" : "/me");
    }
  });
});
