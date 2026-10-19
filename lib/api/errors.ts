// 에러 코드와 HTTP 상태 (docs/API.md 3절). 메시지는 고정 문구만 쓴다 — 입력·PII를 넣지 않는다 (F-007).

export const ERROR_STATUS = {
  EMPTY_INPUT: 400,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  LOGIN_REQUIRED: 401,
  FORBIDDEN: 403,
  FEATURE_GATED: 403,
  LAWYER_NOT_VERIFIED: 403,
  NOT_FOUND: 404,
  CONSENT_REQUIRED: 409,
  INVALID_STATE: 409,
  PII_CONFIRMATION_REQUIRED: 422,
  BRIEF_NEEDS_EDIT: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SEARCH_UPSTREAM_FAILED: 502,
  MODEL_FAILED: 502,
  TIMEOUT: 504,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const MESSAGES: Record<ErrorCode, string> = {
  EMPTY_INPUT: "내용을 입력해 주세요.",
  VALIDATION_ERROR: "입력 형식이 올바르지 않습니다.",
  UNAUTHENTICATED: "로그인이 필요합니다.",
  LOGIN_REQUIRED: "계속하려면 로그인해 주세요.",
  FORBIDDEN: "접근 권한이 없습니다.",
  FEATURE_GATED: "아직 제공하지 않는 기능입니다.",
  LAWYER_NOT_VERIFIED: "변호사 자격 확인이 완료되지 않았습니다.",
  NOT_FOUND: "찾을 수 없습니다.",
  CONSENT_REQUIRED: "동의가 필요합니다.",
  INVALID_STATE: "지금 상태에서는 할 수 없는 요청입니다.",
  PII_CONFIRMATION_REQUIRED: "개인정보 확인이 필요합니다.",
  BRIEF_NEEDS_EDIT: "개인을 알아볼 수 있는 내용이 있어 수정이 필요합니다.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  INTERNAL_ERROR: "일시적인 오류가 발생했습니다.",
  SEARCH_UPSTREAM_FAILED: "검색 중 오류가 발생했습니다. 다시 시도해 주세요.",
  MODEL_FAILED: "AI 응답 생성 중 오류가 발생했습니다. 다시 시도해 주세요.",
  TIMEOUT: "처리 시간이 초과되었습니다.",
};

/** details에는 코드·필드명·상태값 같은 구조 정보만 넣는다. 사용자 입력 값은 넣지 않는다. */
export type ErrorDetails = Record<string, string | number | boolean | string[] | null>;

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;

  constructor(code: ErrorCode, details?: ErrorDetails) {
    super(MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}
