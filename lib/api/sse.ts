// Server-Sent Events 응답 (API.md 4.1 데모 스트리밍). 이벤트에는 고정 문구·식별자만 넣고 입력 원문을 넣지 않는다.
// 스트림을 연 뒤에 난 오류는 HTTP 상태로 알릴 수 없어 `error` 이벤트로 보낸다 (코드·고정 문구만, F-007).
import { ApiError, type ErrorCode } from "./errors";

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export type SseSend = (event: string, data: unknown) => void;

export function sseResponse(
  requestId: string,
  run: (send: SseSend) => Promise<void>,
  onDone?: (errorCode?: ErrorCode, errorType?: string) => void,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: SseSend = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          closed = true; // 클라이언트가 연결을 끊음 — 분석은 계속해 결과를 저장한다
        }
      };
      try {
        await run(send);
        onDone?.();
      } catch (err) {
        const apiErr = err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR");
        send("error", {
          code: apiErr.code,
          message: apiErr.message,
          ...(apiErr.details && { details: apiErr.details }),
          requestId,
        });
        onDone?.(
          apiErr.code,
          err instanceof ApiError ? undefined : err instanceof Error ? err.name : typeof err,
        );
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // 이미 닫힌 스트림
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
