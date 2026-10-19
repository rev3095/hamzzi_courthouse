// API 라우트 공통 래퍼: requestId 부여, ApiError → 표준 에러 응답, 예상 못 한 예외 → INTERNAL_ERROR, 요청 로그.
import { ApiError } from "./errors";
import { hashUserId, writeRequestLog } from "./log";
import { fail } from "./respond";

export type RequestScope = {
  requestId: string;
  /** 인증된 사용자를 확인한 뒤 호출하면 로그에 ID 해시가 남는다. */
  setUser(userId: string): void;
};

type Handler<Ctx> = (req: Request, ctx: Ctx, scope: RequestScope) => Promise<Response>;

export function withRoute<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const started = performance.now();
    const requestId = crypto.randomUUID();
    let userIdHash: string | undefined;
    const scope: RequestScope = {
      requestId,
      setUser: (id) => {
        userIdHash = hashUserId(id);
      },
    };

    let res: Response;
    let errorCode: string | undefined;
    let errorType: string | undefined;
    try {
      res = await handler(req, ctx, scope);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR");
      errorCode = apiErr.code;
      // 예외 메시지·스택에는 입력이 섞일 수 있어 유형 이름만 남긴다
      if (!(err instanceof ApiError)) errorType = err instanceof Error ? err.name : typeof err;
      res = fail(apiErr, requestId);
    }

    res.headers.set("x-request-id", requestId);
    writeRequestLog({
      requestId,
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      latencyMs: Math.round(performance.now() - started),
      ...(userIdHash && { userIdHash }),
      ...(errorCode && { errorCode }),
      ...(errorType && { errorType }),
    });
    return res;
  };
}

/** JSON 본문 파싱. 형식 오류는 VALIDATION_ERROR (본문 내용은 노출하지 않는다). */
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("VALIDATION_ERROR", { reason: "invalid_json" });
  }
}
