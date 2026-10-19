// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ApiError, ERROR_STATUS } from "./errors";
import { type RequestLog, setLogSink } from "./log";
import { AI_NOTICE, ok } from "./respond";
import { readJson, withRoute } from "./route";

const PII_TEXT = "홍길동 010-1234-5678 900101-1234567";

let logs: RequestLog[];
let restore: ReturnType<typeof setLogSink>;
beforeEach(() => {
  logs = [];
  restore = setLogSink((e) => logs.push(e));
});
afterEach(() => setLogSink(restore));

const post = (body: string) =>
  new Request("http://localhost/api/v1/inquiries?q=x", { method: "POST", body });

describe("공통 응답 형식 (API.md 2절)", () => {
  test("성공 응답은 data와 meta.requestId를 담는다", async () => {
    const route = withRoute(async (_req, _ctx, { requestId }) => ok({ hello: 1 }, requestId));
    const res = await route(post("{}"), undefined);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ hello: 1 });
    expect(body.meta.requestId).toBe(res.headers.get("x-request-id"));
  });

  test("ApiError는 코드별 HTTP 상태와 고정 메시지로 바뀐다", async () => {
    const route = withRoute(async () => {
      throw new ApiError("FEATURE_GATED", { featureKey: "billing", status: "pending_review" });
    });
    const res = await route(post("{}"), undefined);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toMatchObject({
      code: "FEATURE_GATED",
      details: { featureKey: "billing", status: "pending_review" },
    });
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  test("LOGIN_REQUIRED는 401이다 (DEC-005)", () => {
    expect(ERROR_STATUS.LOGIN_REQUIRED).toBe(401);
  });

  test("AI 고지 문구가 정해져 있다 (8.3)", () => {
    expect(AI_NOTICE).toBe("AI 생성 · 법률 자문 아님");
  });
});

describe("F-007 에러·로그에 개인정보를 남기지 않는다", () => {
  test("예상 못 한 예외는 INTERNAL_ERROR로 바뀌고 예외 메시지가 응답·로그에 없다", async () => {
    const route = withRoute(async () => {
      throw new Error(`분석 실패: ${PII_TEXT}`);
    });
    const res = await route(post("{}"), undefined);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe("INTERNAL_ERROR");
    expect(text).not.toContain("홍길동");
    expect(JSON.stringify(logs)).not.toContain("홍길동");
    expect(logs[0]).toMatchObject({ status: 500, errorCode: "INTERNAL_ERROR", errorType: "Error" });
  });

  test("요청 로그는 본문·쿼리 없이 경로·상태·지연·사용자 해시만 남긴다", async () => {
    const route = withRoute(async (req, _ctx, scope) => {
      scope.setUser("user-uuid-1");
      await readJson(req);
      return ok(null, scope.requestId);
    });
    await route(post(JSON.stringify({ text: PII_TEXT })), undefined);
    const entry = logs[0];
    expect(Object.keys(entry).sort()).toEqual(
      ["latencyMs", "method", "path", "requestId", "status", "userIdHash"].sort(),
    );
    expect(entry.path).toBe("/api/v1/inquiries");
    expect(entry.userIdHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(entry)).not.toContain("user-uuid-1");
    expect(JSON.stringify(entry)).not.toContain("010-1234");
  });

  test("깨진 JSON은 VALIDATION_ERROR이고 본문을 되돌려 주지 않는다", async () => {
    const route = withRoute(async (req, _ctx, { requestId }) => ok(await readJson(req), requestId));
    const res = await route(post(`{"text": "${PII_TEXT}"`), undefined);
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(JSON.parse(text).error.code).toBe("VALIDATION_ERROR");
    expect(text).not.toContain("홍길동");
  });
});
