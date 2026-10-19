// 질문(inquiry) 입력·확인 규칙 (F-001 AC2, F-007). 순수 함수 — DB·인증과 분리해 테스트한다.
import { ApiError } from "@/lib/api/errors";
import type { PiiFinding, SensitiveCategory } from "@/lib/pii";

/** 입력 최대 길이 — 임시 값. 확정은 OQ-API-01 */
export const MAX_INPUT_CHARS = 2000;

export type CreateRequest = { text: string; sensitiveConsent: boolean };

/** POST /inquiries 본문 검증. 오류에는 필드 이름만 담고 입력 값은 담지 않는다. */
export function parseCreateRequest(body: unknown): CreateRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.text !== "string") throw new ApiError("VALIDATION_ERROR", { fields: ["text"] });
  if (b.sensitiveConsent !== undefined && typeof b.sensitiveConsent !== "boolean") {
    throw new ApiError("VALIDATION_ERROR", { fields: ["sensitiveConsent"] });
  }
  if (!b.text.trim()) throw new ApiError("EMPTY_INPUT");
  if (b.text.length > MAX_INPUT_CHARS) {
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["text"],
      reason: "too_long",
      maxChars: MAX_INPUT_CHARS,
    });
  }
  return { text: b.text, sensitiveConsent: b.sensitiveConsent === true };
}

/**
 * 민감정보(건강·범죄경력) 가능성이 있으면 저장 전에 별도 동의가 있어야 한다 (F-007 AC2, DATA_MODEL [PII-S]).
 * 동의가 없으면 아무것도 저장하지 않고 409 CONSENT_REQUIRED.
 */
export function assertSensitiveConsent(sensitive: SensitiveCategory[], consent: boolean) {
  if (sensitive.length && !consent) {
    throw new ApiError("CONSENT_REQUIRED", { kind: "sensitive_info", categories: sensitive });
  }
}

export type Owner = { kind: "user"; userId: string } | { kind: "anon"; anonSessionId: string };

/**
 * 소유자 판단. 로그인 사용자는 user_id로, 비로그인은 같은 익명 세션이면서 아직 계정에 연결되지 않은 행만.
 * (로그인 후 이관은 OQ-DM-10)
 */
export function isOwner(
  row: { userId: string | null; anonSessionId: string | null },
  owner: Owner | null,
): boolean {
  if (!owner) return false;
  if (owner.kind === "user") return row.userId === owner.userId;
  return row.userId === null && row.anonSessionId === owner.anonSessionId;
}

/** pii_findings jsonb 형태: 탐지 유형·개수 + 사용자 마스킹 확인 시각. 값은 저장하지 않는다. */
export type StoredPiiFindings = { findings: PiiFinding[]; confirmedAt: string | null };

export function initialPiiFindings(findings: PiiFinding[], now: Date): StoredPiiFindings {
  // 탐지된 것이 없으면 확인할 것도 없다
  return { findings, confirmedAt: findings.length ? null : now.toISOString() };
}

export type InquiryForCheck = {
  status: string;
  piiFindings: StoredPiiFindings;
};

/** 분석(F-002~) 전 검사: PII가 있었으면 사용자가 마스킹본을 확인해야 한다 → 422 PII_CONFIRMATION_REQUIRED */
export function assertReadyToAnalyze(inq: InquiryForCheck) {
  if (inq.piiFindings.findings.length && !inq.piiFindings.confirmedAt) {
    throw new ApiError("PII_CONFIRMATION_REQUIRED", {
      types: inq.piiFindings.findings.map((f) => f.type),
    });
  }
}

/** POST /inquiries/{id}/pii-confirmation 본문 */
export function parseConfirmation(body: unknown): { acceptMasked: true } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.acceptMasked !== true) {
    // false = 마스킹본을 받아들이지 않음 → 내용을 고쳐 새로 제출해야 한다
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["acceptMasked"],
      reason: "resubmit_with_edits",
    });
  }
  return { acceptMasked: true };
}
