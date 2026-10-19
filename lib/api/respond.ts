// 공통 응답 형식 (docs/API.md 2절)
import { ApiError, type ErrorCode, type ErrorDetails } from "./errors";

/** 모든 AI 결과에 붙이는 고지 (CLAUDE.md 절대 규칙 6, PRD 8.3) */
export const AI_NOTICE = "AI 생성 · 법률 자문 아님";

export type Page = { cursor?: string; nextCursor?: string; limit: number };
export type Meta = { requestId: string; page?: Page };

export type SuccessBody<T> = { data: T; meta?: Meta };
export type ErrorBody = {
  error: { code: ErrorCode; message: string; details?: ErrorDetails; requestId: string };
};

export function ok<T>(data: T, requestId: string, init?: { status?: number; page?: Page }) {
  const meta: Meta = { requestId, ...(init?.page && { page: init.page }) };
  return Response.json({ data, meta } satisfies SuccessBody<T>, { status: init?.status ?? 200 });
}

export function fail(err: ApiError, requestId: string) {
  const body: ErrorBody = {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
      requestId,
    },
  };
  return Response.json(body, { status: err.status });
}
