// @vitest-environment node
// POST /contact (DEC-051) — 문의는 마스킹본만 메일로 보내고 저장하지 않는다 (F-007, 절대 규칙 4).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { developerEmail } from "@/lib/contact/policy";

vi.mock("server-only", () => ({}));
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));
// 이 라우트는 DB를 쓰지 않는다 — 불리면 테스트가 실패하도록 막아 둔다
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => {
    throw new Error("문의는 DB에 저장하지 않는다");
  },
  createUserClient: () => {
    throw new Error("문의는 DB에 저장하지 않는다");
  },
}));

const { POST } = await import("@/app/api/v1/contact/route");
const { sendContactMail, DEFAULT_FROM } = await import("@/lib/contact/send");

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/contact", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    undefined,
  );

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  rate.assertRateLimit.mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sentPayload = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe("POST /contact (DEC-051)", () => {
  test("DEC-051 키가 있으면 가린 본문만 개발자 메일로 보낸다 (원문 전화번호가 나가지 않음)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const res = await call({
      topic: "bug",
      body: "결과 화면이 안 열려요. 010-1234-5678로 연락 주세요",
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual({ status: "sent", maskedCount: 1 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_test");
    const p = sentPayload();
    expect(p.to).toEqual([developerEmail()]);
    expect(p.from).toBe(DEFAULT_FROM);
    expect(p.subject).toContain("오류 신고");
    expect(p.text).not.toContain("010-1234-5678");
    expect(p.text).toContain("[전화번호");
    expect(p.reply_to).toBeUndefined();
  });

  test("DEC-051 답장 이메일을 적으면 reply_to로만 넣는다", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await call({
      topic: "idea",
      body: "검색 화면에 즐겨찾기가 있으면 좋겠어요",
      replyTo: "me@example.com",
    });
    expect(sentPayload().reply_to).toBe("me@example.com");
  });

  test("DEC-051 키가 없으면 보내지 않고, 메일 앱용 가린 제목·본문을 돌려준다", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const res = await call({ body: "제 이름은 김철수이고 사이트가 느려요" });
    const { data } = await res.json();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(data.status).toBe("not_configured");
    expect(data.fallback.subject).toContain("기타");
    expect(data.fallback.body).not.toContain("김철수");
  });

  test("DEC-051 발송이 실패하면 send_failed와 메일 앱용 본문 (재시도하지 않음)", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const { data } = await (await call({ body: "문의 내용이 여기에 있어요" })).json();
    expect(data.status).toBe("send_failed");
    expect(data.fallback.body).toBe("문의 내용이 여기에 있어요");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("F-001 AC2 빈 본문은 EMPTY_INPUT", async () => {
    const res = await call({ topic: "service", body: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("EMPTY_INPUT");
  });

  test("DEC-051 형식 오류: 너무 짧은 본문·모르는 종류·잘못된 답장 주소", async () => {
    for (const body of [
      { body: "짧아요" },
      { topic: "lawsuit", body: "충분히 긴 문의 내용이에요" },
      { body: "충분히 긴 문의 내용이에요", replyTo: "not-an-email" },
    ]) {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("F-007 AC2 민감정보로 보이는 문의는 보내지 않고 빼 달라고 한다", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const res = await call({ body: "우울증 진단을 받았는데 상담을 받고 싶어요" });
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.details).toMatchObject({ reason: "sensitive" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("DEC-051 자동 입력 칸이 채워지면 보낸 것처럼 답하고 보내지 않는다", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const { data } = await (
      await call({ body: "광고 문구 광고 문구 광고", website: "http://spam.example" })
    ).json();
    expect(data.status).toBe("sent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("DEC-051 같은 네트워크 횟수 제한에 걸리면 RATE_LIMITED", async () => {
    rate.assertRateLimit.mockRejectedValue(
      new ApiError("RATE_LIMITED", { reason: "contact_hourly" }),
    );
    const res = await call({ body: "충분히 긴 문의 내용이에요" });
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("F-007 에러 응답에 입력 본문이 섞이지 않는다", async () => {
    const res = await call({ body: "x".repeat(2001) });
    expect(JSON.stringify(await res.json())).not.toContain("xxxx");
  });

  test("발송 함수: 네트워크 예외는 send_failed", async () => {
    const outcome = await sendContactMail(
      { subject: "s", text: "t", replyTo: null },
      { RESEND_API_KEY: "k" },
      vi.fn().mockRejectedValue(new Error("down")),
    );
    expect(outcome).toBe("send_failed");
  });
});
