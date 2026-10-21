// @vitest-environment node
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { clientIp, hashIp } from "@/lib/auth/ip";
import {
  ANON_QUESTION_LIMIT,
  MAX_INPUT_CHARS,
  answerSummary,
  assertAnalyzable,
  assertAnonQuota,
  finishedResultId,
  assertConsumed,
  assertParentAnalyzed,
  quotaView,
  assertReadyToAnalyze,
  assertSensitiveConsent,
  initialPiiFindings,
  isOwner,
  parseConfirmation,
  parseCreateRequest,
  wantsEventStream,
} from "./policy";

const caught = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("예외가 나야 한다");
};

describe("입력 검증", () => {
  test("F-001 AC2 빈 입력(공백만)은 EMPTY_INPUT", () => {
    expect(caught(() => parseCreateRequest({ text: "   \n" })).code).toBe("EMPTY_INPUT");
  });

  test("최대 길이를 넘으면 VALIDATION_ERROR이고 입력 값은 담지 않는다 (OQ-API-01 임시 값)", () => {
    const err = caught(() => parseCreateRequest({ text: "가".repeat(MAX_INPUT_CHARS + 1) }));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(err.details)).not.toContain("가가");
  });

  test("text가 문자열이 아니면 VALIDATION_ERROR", () => {
    expect(caught(() => parseCreateRequest({ text: 1 })).details?.fields).toEqual(["text"]);
  });
});

describe("F-007 AC2 민감정보 별도 동의", () => {
  test("F-007 AC2 동의 없이 민감정보 가능성이 있으면 CONSENT_REQUIRED(범주만)", () => {
    const err = caught(() => assertSensitiveConsent(["health"], false));
    expect(err.code).toBe("CONSENT_REQUIRED");
    expect(err.details).toEqual({ kind: "sensitive_info", categories: ["health"] });
  });

  test("F-007 AC2 동의했거나 민감정보가 없으면 통과", () => {
    expect(() => assertSensitiveConsent(["health"], true)).not.toThrow();
    expect(() => assertSensitiveConsent([], false)).not.toThrow();
  });
});

describe("F-007 AC1 마스킹 확인 전 분석 차단", () => {
  const now = new Date("2026-10-19T00:00:00Z");

  test("F-007 AC1 PII가 탐지됐고 확인 전이면 PII_CONFIRMATION_REQUIRED", () => {
    const piiFindings = initialPiiFindings([{ type: "phone", count: 1 }], now);
    const err = caught(() => assertReadyToAnalyze({ status: "draft", piiFindings }));
    expect(err.code).toBe("PII_CONFIRMATION_REQUIRED");
    expect(err.details).toEqual({ types: ["phone"] });
  });

  test("PII가 없으면 확인 없이 분석할 수 있다", () => {
    const piiFindings = initialPiiFindings([], now);
    expect(() => assertReadyToAnalyze({ status: "draft", piiFindings })).not.toThrow();
  });

  test("마스킹본을 거절(acceptMasked=false)하면 고쳐서 다시 제출하라고 알린다", () => {
    const err = caught(() => parseConfirmation({ acceptMasked: false }));
    expect(err.details).toMatchObject({ reason: "resubmit_with_edits" });
  });
});

describe("소유권", () => {
  test("로그인 사용자는 자기 user_id 행만", () => {
    expect(isOwner({ userId: "u1", anonSessionId: null }, { kind: "user", userId: "u1" })).toBe(
      true,
    );
    expect(isOwner({ userId: "u2", anonSessionId: null }, { kind: "user", userId: "u1" })).toBe(
      false,
    );
  });

  test("비로그인은 같은 익명 세션이고 계정에 연결되지 않은 행만", () => {
    const anon = { kind: "anon", anonSessionId: "a1" } as const;
    expect(isOwner({ userId: null, anonSessionId: "a1" }, anon)).toBe(true);
    expect(isOwner({ userId: "u1", anonSessionId: "a1" }, anon)).toBe(false);
    expect(isOwner({ userId: null, anonSessionId: "a2" }, anon)).toBe(false);
    expect(isOwner({ userId: null, anonSessionId: "a1" }, null)).toBe(false);
  });
});

describe("F-001 AC3 비로그인 3회 (DEC-010)", () => {
  test("F-001 AC3 3회 미만은 통과, 3회부터 LOGIN_REQUIRED", () => {
    expect(ANON_QUESTION_LIMIT).toBe(3);
    expect(() => assertAnonQuota(2)).not.toThrow();
    const err = caught(() => assertAnonQuota(3));
    expect(err.code).toBe("LOGIN_REQUIRED");
    expect(err.details).toEqual({ loginProviders: ["google"] });
  });

  test("F-001 AC3 DB 함수 결과: 세션 초과는 LOGIN_REQUIRED, IP 상한은 RATE_LIMITED", () => {
    expect(() => assertConsumed("ok")).not.toThrow();
    expect(caught(() => assertConsumed("session_limit")).code).toBe("LOGIN_REQUIRED");
    expect(caught(() => assertConsumed("unknown_session")).code).toBe("LOGIN_REQUIRED");
    const ip = caught(() => assertConsumed("ip_limit"));
    expect(ip.code).toBe("RATE_LIMITED");
    expect(ip.details).toEqual({ reason: "anon_ip_daily" });
  });

  test("F-001 AC3 quota 보기", () => {
    expect(quotaView(null, 0)).toMatchObject({
      anonymous: true,
      remaining: 3,
      loginRequired: false,
    });
    expect(quotaView({ kind: "anon", anonSessionId: "a" }, 5)).toMatchObject({
      used: 3,
      remaining: 0,
      loginRequired: true,
    });
    expect(quotaView({ kind: "user", userId: "u" }, 0).anonymous).toBe(false);
  });
});

describe("F-002 AC3 이어 묻기", () => {
  test("F-002 AC3 parentInquiryId는 UUID만 받는다", () => {
    const id = "99999999-8888-7777-6666-555555555555";
    expect(parseCreateRequest({ text: "이어서", parentInquiryId: id }).parentInquiryId).toBe(id);
    expect(parseCreateRequest({ text: "새 질문" }).parentInquiryId).toBeNull();
    expect(caught(() => parseCreateRequest({ text: "x", parentInquiryId: 1 })).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  test("F-002 AC3 분석이 끝난 질문에만 이어 묻는다", () => {
    expect(() => assertParentAnalyzed({ status: "analyzed" })).not.toThrow();
    expect(caught(() => assertParentAnalyzed({ status: "draft" })).code).toBe("INVALID_STATE");
  });
});

describe("DEC-010 IP 해시", () => {
  test("프록시 헤더의 첫 IP를 쓰고, 원본 IP는 해시로만 남긴다", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h)).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
    const hash = hashIp("203.0.113.7", "salt")!;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
    expect(hashIp("203.0.113.7", "other")).not.toBe(hash);
  });

  test("salt가 없으면 해시를 만들지 않는다", () => {
    expect(hashIp("203.0.113.7", undefined)).toBeNull();
    expect(hashIp(null, "salt")).toBeNull();
  });
});

describe("P5 분석 규칙", () => {
  test("draft·failed만 분석할 수 있다", () => {
    expect(() => assertAnalyzable("draft")).not.toThrow();
    expect(() => assertAnalyzable("failed")).not.toThrow();
    expect(() => assertAnalyzable("analyzed")).toThrow(ApiError);
  });

  test("F-002 AC3 직전 답변 요약은 문단 본문만 이어 붙여 자른다", () => {
    const response = {
      answer: { points: [{ text: "가".repeat(400) }, { text: "나".repeat(400) }] },
    };
    const s = answerSummary(response);
    expect(s.length).toBe(601);
    expect(answerSummary(null)).toBe("");
    expect(answerSummary({ answer: { points: [{ text: 1 }] } })).toBe("");
  });

  test("Accept: text/event-stream이면 스트리밍", () => {
    const req = (accept: string) => new Request("http://x", { headers: { accept } });
    expect(wantsEventStream(req("text/event-stream"))).toBe(true);
    expect(wantsEventStream(req("application/json"))).toBe(false);
  });
});

describe("DEC-010 분석 마무리 결과 (finish_demo_analysis)", () => {
  test("ok면 결과 ID, 중복·상한·소유자 불일치는 각각의 오류", () => {
    expect(finishedResultId({ status: "ok", resultId: "r-1" })).toBe("r-1");
    expect(caught(() => finishedResultId({ status: "already_analyzed" })).code).toBe(
      "INVALID_STATE",
    );
    expect(caught(() => finishedResultId({ status: "session_limit" })).code).toBe("LOGIN_REQUIRED");
    expect(caught(() => finishedResultId({ status: "ip_limit" })).code).toBe("RATE_LIMITED");
    expect(caught(() => finishedResultId({ status: "not_owner" })).code).toBe("FORBIDDEN");
    expect(caught(() => finishedResultId({ status: "unknown_inquiry" })).code).toBe("NOT_FOUND");
  });
});
