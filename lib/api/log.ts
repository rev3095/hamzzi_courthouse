// 요청 로그 (docs/API.md 6절). requestId·경로·상태·지연·사용자 ID 해시·오류 유형 이름만 남긴다.
// 요청 본문, 쿼리 문자열, 에러 메시지는 PII가 섞일 수 있어 기록하지 않는다 (F-007).
import { createHash } from "node:crypto";

export type RequestLog = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  userIdHash?: string;
  errorCode?: string;
  errorType?: string;
};

export type LogSink = (entry: RequestLog) => void;

let sink: LogSink = (entry) => console.info(JSON.stringify(entry));

/** 테스트·관측 도구 연동용 (OQ-ARC-09). 이전 sink를 돌려준다. */
export function setLogSink(next: LogSink): LogSink {
  const prev = sink;
  sink = next;
  return prev;
}

export function writeRequestLog(entry: RequestLog) {
  sink(entry);
}

export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}
