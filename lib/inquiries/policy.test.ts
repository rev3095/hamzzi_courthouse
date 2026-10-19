// @vitest-environment node
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  MAX_INPUT_CHARS,
  assertReadyToAnalyze,
  assertSensitiveConsent,
  initialPiiFindings,
  isOwner,
  parseConfirmation,
  parseCreateRequest,
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
