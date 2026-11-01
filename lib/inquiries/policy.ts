// 질문(inquiry) 입력·확인 규칙 (F-001 AC2, F-007). 순수 함수 — DB·인증과 분리해 테스트한다.
import { ApiError } from "@/lib/api/errors";
import { scanInput } from "@/lib/pii";
import type { PiiFinding, SensitiveCategory } from "@/lib/pii";

/** 입력 최대 길이 — 임시 값. 확정은 OQ-API-01 */
export const MAX_INPUT_CHARS = 2000;

export type CreateRequest = {
  text: string;
  sensitiveConsent: boolean;
  parentInquiryId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /inquiries 본문 검증. 오류에는 필드 이름만 담고 입력 값은 담지 않는다. */
export function parseCreateRequest(body: unknown): CreateRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.text !== "string") throw new ApiError("VALIDATION_ERROR", { fields: ["text"] });
  if (b.sensitiveConsent !== undefined && typeof b.sensitiveConsent !== "boolean") {
    throw new ApiError("VALIDATION_ERROR", { fields: ["sensitiveConsent"] });
  }
  if (
    b.parentInquiryId !== undefined &&
    b.parentInquiryId !== null &&
    (typeof b.parentInquiryId !== "string" || !UUID.test(b.parentInquiryId))
  ) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["parentInquiryId"] });
  }
  if (!b.text.trim()) throw new ApiError("EMPTY_INPUT");
  if (b.text.length > MAX_INPUT_CHARS) {
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["text"],
      reason: "too_long",
      maxChars: MAX_INPUT_CHARS,
    });
  }
  return {
    text: b.text,
    sensitiveConsent: b.sensitiveConsent === true,
    parentInquiryId: typeof b.parentInquiryId === "string" ? b.parentInquiryId : null,
  };
}

// --- 비로그인 질문 횟수 (F-001 AC3, DEC-005, DEC-010) -----------------------------------
/** 비로그인 질문 횟수 (이어 묻기 포함). 1회 = analyze 성공 1건 */
export const ANON_QUESTION_LIMIT = 3;
/** 같은 IP 해시의 24시간 비로그인 분석 상한 — 쿠키 삭제 남용 방지용 느슨한 상한 (PRD OQ-009) */
export const ANON_IP_DAILY_LIMIT = 10;
export const ANON_IP_WINDOW = "24 hours";
export const ANON_IP_WINDOW_MS = 24 * 60 * 60 * 1000;
/** LOGIN_REQUIRED details.loginProviders (DEC-005 소셜 로그인) */
export const LOGIN_PROVIDERS = ["google"];

const loginRequired = () => new ApiError("LOGIN_REQUIRED", { loginProviders: LOGIN_PROVIDERS });

/** 질문 접수 전 검사: 이미 3회를 썼으면 저장하지 않고 401 LOGIN_REQUIRED */
export function assertAnonQuota(questionsUsed: number) {
  if (questionsUsed >= ANON_QUESTION_LIMIT) throw loginRequired();
}

export type ConsumeResult = "ok" | "session_limit" | "ip_limit" | "unknown_session";

/** consume_anon_question(DB 함수) 결과 → 에러 */
export function assertConsumed(result: ConsumeResult) {
  if (result === "ok") return;
  if (result === "ip_limit") throw new ApiError("RATE_LIMITED", { reason: "anon_ip_daily" });
  throw loginRequired();
}

export type Quota = {
  anonymous: boolean;
  used: number | null;
  limit: number | null;
  remaining: number | null;
  loginRequired: boolean;
};

/** GET /me/quota. 로그인 사용자 사용량 제한은 아직 정하지 않았다 (PRD 11) */
export function quotaView(owner: Owner | null, questionsUsed: number): Quota {
  if (owner?.kind === "user") {
    return { anonymous: false, used: null, limit: null, remaining: null, loginRequired: false };
  }
  const used = Math.min(Math.max(questionsUsed, 0), ANON_QUESTION_LIMIT);
  return {
    anonymous: true,
    used,
    limit: ANON_QUESTION_LIMIT,
    remaining: ANON_QUESTION_LIMIT - used,
    loginRequired: used >= ANON_QUESTION_LIMIT,
  };
}

// --- 이어 묻기 (F-002 AC3, DEC-011) -------------------------------------------------
/** 앞선 질문은 같은 소유자(호출 전 getOwnedInquiry가 403)이고 분석이 끝난 것만 */
export function assertParentAnalyzed(parent: { status: string }) {
  if (parent.status !== "analyzed") {
    throw new ApiError("INVALID_STATE", { field: "parentInquiryId", reason: "not_analyzed" });
  }
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

// --- 분석 (P5, API.md 4.1 데모) ----------------------------------------------------
/** 분석할 수 있는 상태: 처음(draft)이나 실패 후 재시도(failed). 이미 분석했으면 다시 하지 않는다 (횟수 이중 차감 방지) */
export function assertAnalyzable(status: string) {
  if (status !== "draft" && status !== "failed") {
    throw new ApiError("INVALID_STATE", { status });
  }
}

/** 이어 묻기 맥락으로 넘길 직전 답변 요약 — 저장된 결과의 문단 본문만 이어 붙여 자른다 (F-002 AC3, DEC-011) */
export function answerSummary(response: unknown, maxChars = 600): string {
  const points = (response as { answer?: { points?: { text?: unknown }[] } } | null)?.answer
    ?.points;
  if (!Array.isArray(points)) return "";
  const text = points
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join(" ");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** 진행 단계 스트리밍 요청인가 (API.md 4.1: Accept: text/event-stream) */
export function wantsEventStream(req: Request): boolean {
  return (req.headers.get("accept") ?? "").includes("text/event-stream");
}

export type FinishResult =
  | { status: "ok"; resultId: string }
  | { status: "already_analyzed" | "unknown_inquiry" | "not_owner" | Exclude<ConsumeResult, "ok"> };

/** finish_demo_analysis(DB 함수) 결과 → 결과 ID 또는 에러 */
export function finishedResultId(r: FinishResult): string {
  if (r.status === "ok") return r.resultId;
  if (r.status === "already_analyzed") throw new ApiError("INVALID_STATE", { status: "analyzed" });
  if (r.status === "unknown_inquiry") throw new ApiError("NOT_FOUND");
  if (r.status === "not_owner") throw new ApiError("FORBIDDEN");
  assertConsumed(r.status);
  throw new ApiError("INTERNAL_ERROR");
}

// --- 도움 여부 피드백 (PRD 14, API.md POST /results/{id}/feedback) ------------------------
export const MAX_FEEDBACK_CHARS = 500;

/**
 * 피드백 본문. 의견은 원문을 저장하지 않고 마스킹본만 남긴다 (DEC-006). 민감정보로 보이는 의견은
 * 동의 절차가 없으므로 저장하지 않는다(도움 여부만 저장)
 */
export function parseFeedbackRequest(body: unknown): {
  helpful: boolean;
  commentMasked: string | null;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.helpful !== "boolean")
    throw new ApiError("VALIDATION_ERROR", { fields: ["helpful"] });
  if (b.comment !== undefined && b.comment !== null && typeof b.comment !== "string") {
    throw new ApiError("VALIDATION_ERROR", { fields: ["comment"] });
  }
  const comment = typeof b.comment === "string" ? b.comment.trim() : "";
  if (comment.length > MAX_FEEDBACK_CHARS) {
    throw new ApiError("VALIDATION_ERROR", {
      fields: ["comment"],
      reason: "too_long",
      maxChars: MAX_FEEDBACK_CHARS,
    });
  }
  if (!comment) return { helpful: b.helpful, commentMasked: null };
  const scan = scanInput(comment);
  return { helpful: b.helpful, commentMasked: scan.sensitive.length > 0 ? null : scan.maskedText };
}
