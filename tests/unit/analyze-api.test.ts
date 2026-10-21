// @vitest-environment node
// POST /inquiries/{id}/analyze (API.md 4.1 데모) — 저장소·분석 실행을 목으로 바꾸고 권한·상태·응답·SSE·로그를 본다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { type RequestLog, setLogSink } from "@/lib/api/log";
import { AI_NOTICE } from "@/lib/api/respond";

const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getOwnedInquiry: vi.fn(),
  getAnonQuestionsUsed: vi.fn(),
  assertAnonIpAvailable: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const runner = vi.hoisted(() => ({ analyzeInquiry: vi.fn() }));
vi.mock("@/lib/inquiries/analyze", () => runner);

const { POST } = await import("@/app/api/v1/inquiries/[id]/analyze/route");

const INQ_ID = "11111111-2222-3333-4444-555555555555";
const MASKED = "집주인 [이름1]이 보증금을 안 돌려줘요";
const RESULT = {
  outcome: "grounded",
  aiNotice: AI_NOTICE,
  answer: { points: [{ text: "설명", source: "law:민법:제536조", quote: "q", check: "verified" }] },
};

let logs: RequestLog[] = [];
setLogSink((e) => logs.push(e));

const call = (accept?: string) =>
  POST(
    new Request(`http://localhost/api/v1/inquiries/${INQ_ID}/analyze`, {
      method: "POST",
      headers: accept ? { accept } : {},
    }),
    { params: Promise.resolve({ id: INQ_ID }) },
  );

function inquiry(over: Record<string, unknown> = {}) {
  return {
    id: INQ_ID,
    user_id: null,
    anon_session_id: "anon-1",
    status: "draft",
    pii_findings: { findings: [], confirmedAt: "2026-10-21T00:00:00Z" },
    sensitive_consent_at: null,
    masked_text: MASKED,
    parent_inquiry_id: null,
    ...over,
  };
}

/** SSE 본문 → [event, data][] */
async function events(res: Response) {
  const text = await res.text();
  return text
    .trim()
    .split("\n\n")
    .map((chunk) => {
      const [ev, data] = chunk.split("\n");
      return [ev.replace("event: ", ""), JSON.parse(data.replace("data: ", ""))] as const;
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
  store.getOwnedInquiry.mockResolvedValue(inquiry());
  store.getAnonQuestionsUsed.mockResolvedValue(0);
  store.assertAnonIpAvailable.mockResolvedValue(undefined);
  runner.analyzeInquiry.mockResolvedValue({ resultId: "r-1", result: RESULT });
});

describe("POST /inquiries/{id}/analyze", () => {
  test("F-005 검증된 결과를 AI 고지와 함께 돌려준다 (JSON)", async () => {
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ status: "analyzed", resultId: "r-1", result: RESULT });
    expect(body.data.result.aiNotice).toBe(AI_NOTICE);
    expect(runner.analyzeInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ id: INQ_ID }),
      { kind: "anon", anonSessionId: "anon-1" },
      expect.any(Headers),
    );
  });

  test("DEC-010 3회를 다 쓴 비로그인은 모델을 부르기 전에 LOGIN_REQUIRED", async () => {
    store.getAnonQuestionsUsed.mockResolvedValue(3);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("LOGIN_REQUIRED");
    expect(runner.analyzeInquiry).not.toHaveBeenCalled();
  });

  test("DEC-010 같은 IP 해시 24시간 상한도 모델을 부르기 전에 막는다 (429)", async () => {
    store.assertAnonIpAvailable.mockRejectedValue(
      new ApiError("RATE_LIMITED", { reason: "anon_ip_daily" }),
    );
    const res = await call();
    expect(res.status).toBe(429);
    expect(runner.analyzeInquiry).not.toHaveBeenCalled();
  });

  test("로그인 사용자는 비로그인 횟수를 보지 않는다", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "user", userId: "u-1" });
    store.getOwnedInquiry.mockResolvedValue(inquiry({ user_id: "u-1", anon_session_id: null }));
    expect((await call()).status).toBe(200);
    expect(store.getAnonQuestionsUsed).not.toHaveBeenCalled();
    expect(store.assertAnonIpAvailable).not.toHaveBeenCalled();
  });

  test("F-007 AC1 마스킹 확인 전이면 422 PII_CONFIRMATION_REQUIRED", async () => {
    store.getOwnedInquiry.mockResolvedValue(
      inquiry({ pii_findings: { findings: [{ type: "phone", count: 1 }], confirmedAt: null } }),
    );
    const res = await call();
    expect(res.status).toBe(422);
    expect(runner.analyzeInquiry).not.toHaveBeenCalled();
  });

  test("이미 분석한 질문은 다시 분석하지 않는다 (409, 횟수 이중 차감 방지)", async () => {
    store.getOwnedInquiry.mockResolvedValue(inquiry({ status: "analyzed" }));
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVALID_STATE");
  });

  test("실패했던 질문은 재시도할 수 있다", async () => {
    store.getOwnedInquiry.mockResolvedValue(inquiry({ status: "failed" }));
    expect((await call()).status).toBe(200);
  });

  test("남의 질문은 403", async () => {
    store.getOwnedInquiry.mockRejectedValue(new ApiError("FORBIDDEN"));
    expect((await call()).status).toBe(403);
  });

  test("F-006 AC2 검색 실패는 502 SEARCH_UPSTREAM_FAILED (JSON)", async () => {
    runner.analyzeInquiry.mockRejectedValue(
      new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "verify" }),
    );
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("SEARCH_UPSTREAM_FAILED");
  });

  test("DEC-013 SSE: 진행 단계 뒤에 result를 보내고 입력 원문은 넣지 않는다", async () => {
    runner.analyzeInquiry.mockImplementation(async (_i, _o, _h, onStep) => {
      onStep({ stage: "intent", message: "질문 의도를 분석하고 있어요" });
      onStep({ stage: "verify", message: "확인 중", added: ["민법 제536조"] });
      return { resultId: "r-1", result: RESULT };
    });
    const res = await call("text/event-stream");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const evs = await events(res);
    expect(evs.map(([e]) => e)).toEqual(["step", "step", "result"]);
    expect(evs[2][1]).toEqual({ status: "analyzed", resultId: "r-1", result: RESULT });
    expect(JSON.stringify(evs)).not.toContain("보증금을 안 돌려줘요");
    expect(logs.at(-1)).toMatchObject({ status: 200, path: expect.stringContaining("#stream") });
  });

  test("SSE: 스트림 중 오류는 error 이벤트(코드·고정 문구)로 보내고 로그에 코드만 남긴다", async () => {
    runner.analyzeInquiry.mockRejectedValue(new Error(`모델 오류: ${MASKED}`));
    const res = await call("text/event-stream");
    const evs = await events(res);
    expect(evs).toEqual([
      [
        "error",
        {
          code: "INTERNAL_ERROR",
          message: "일시적인 오류가 발생했습니다.",
          requestId: expect.any(String),
        },
      ],
    ]);
    expect(JSON.stringify(logs)).not.toContain("보증금");
    expect(logs.at(-1)).toMatchObject({
      status: 500,
      errorCode: "INTERNAL_ERROR",
      errorType: "Error",
    });
  });

  test("SSE 전 검사 오류는 일반 JSON 오류로 돌려준다", async () => {
    store.getAnonQuestionsUsed.mockResolvedValue(3);
    const res = await call("text/event-stream");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
