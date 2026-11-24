// @vitest-environment node
// POST /casefiles/read · POST /businesses/lookup (F-015, DEC-052, API.md) — 동의·횟수·비용 예산·no-store·AI 고지.
// 저장소·모델·외부 API는 모두 가짜다 (절대 규칙 8).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE } from "@/lib/api/respond";
import { CASEFILE_WEIGHT } from "@/lib/ai/models";
import { ANON_QUESTION_LIMIT, USER_QUESTION_LIMIT } from "@/lib/inquiries/policy";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getAnonQuestionsUsed: vi.fn(),
  getUserQuestionsUsed: vi.fn(),
  assertAnonIpAvailable: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);
const rate = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  tryAiQuota: vi.fn(),
  settleAiQuota: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  ...rate,
}));
const mode = vi.hoisted(() => ({ aiMode: vi.fn() }));
vi.mock("@/lib/ai/mode", () => mode);
const ai = vi.hoisted(() => ({ readCaseFiles: vi.fn() }));
vi.mock("@/lib/ai/casefile", () => ai);
const source = vi.hoisted(() => ({ searchPlaces: vi.fn(), searchCorps: vi.fn() }));
vi.mock("@/lib/business/source", () => source);

const { POST: read } = await import("@/app/api/v1/casefiles/read/route");
const { POST: lookup } = await import("@/app/api/v1/businesses/lookup/route");
const { CASEFILE_RATE, BUSINESS_RATE } = await import("@/lib/auth/rate-limit");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(60).fill(0)]).toString("base64");
const BODY = {
  images: [{ mediaType: "image/jpeg", data: JPEG }],
  question: "어떻게 하죠",
  consent: { images: true, sensitive: true },
};
const READING = {
  docTypes: ["내용증명"],
  summary: "발신인은 보증금 반환을 요구했습니다.",
  claims: [],
  parties: [{ role: "수신인", side: "respondent", kind: "business", name: "주식회사 한빛주택" }],
};

const post = (handler: typeof read, path: string, body: unknown, headers?: HeadersInit) =>
  handler(
    new Request(`http://localhost/api/v1/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    }),
    undefined,
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
  store.getAnonQuestionsUsed.mockResolvedValue(0);
  store.getUserQuestionsUsed.mockResolvedValue(0);
  store.assertAnonIpAvailable.mockResolvedValue(undefined);
  rate.assertRateLimit.mockResolvedValue(undefined);
  rate.tryAiQuota.mockResolvedValue(true);
  rate.settleAiQuota.mockResolvedValue(undefined);
  mode.aiMode.mockReturnValue("paid");
  ai.readCaseFiles.mockResolvedValue({
    ok: true,
    costUsd: 0.0012,
    reading: READING,
    findings: [{ type: "name", count: 1 }],
    sensitive: [],
    dropped: 0,
  });
  source.searchPlaces.mockResolvedValue({ status: "no_key", items: [] });
  source.searchCorps.mockResolvedValue({ status: "no_key", items: [] });
});

describe("F-015 AC1 POST /casefiles/read 동의·횟수", () => {
  test("동의가 없으면 409 CONSENT_REQUIRED — 소유자·예산·모델을 건드리지 않는다", async () => {
    const res = await post(read, "casefiles/read", {
      ...BODY,
      consent: { images: false, sensitive: true },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "CONSENT_REQUIRED",
      details: { kind: "casefile_images" },
    });
    expect(store.resolveOwner).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(ai.readCaseFiles).not.toHaveBeenCalled();
  });

  test("비로그인이 하루 횟수를 다 썼으면 모델 전에 401 LOGIN_REQUIRED (절대 규칙 7)", async () => {
    store.getAnonQuestionsUsed.mockResolvedValue(ANON_QUESTION_LIMIT);
    const res = await post(read, "casefiles/read", BODY);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("LOGIN_REQUIRED");
    expect(ai.readCaseFiles).not.toHaveBeenCalled();
  });

  test("로그인 사용자가 하루 한도를 다 썼으면 429 (DEC-035)", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "user", userId: "u-1" });
    store.getUserQuestionsUsed.mockResolvedValue(USER_QUESTION_LIMIT);
    const res = await post(read, "casefiles/read", BODY);
    expect(res.status).toBe(429);
    expect((await res.json()).error.details).toMatchObject({ reason: "user_daily" });
    expect(ai.readCaseFiles).not.toHaveBeenCalled();
  });

  test("같은 네트워크 판독 횟수를 따로 막고, 관리자 모드는 횟수 검사를 받지 않는다 (비용 예산은 받는다)", async () => {
    rate.assertRateLimit.mockRejectedValueOnce(
      new ApiError("RATE_LIMITED", { reason: "casefile_hourly" }),
    );
    expect((await post(read, "casefiles/read", BODY)).status).toBe(429);
    expect(rate.assertRateLimit).toHaveBeenCalledWith(CASEFILE_RATE, expect.anything());
    expect(ai.readCaseFiles).not.toHaveBeenCalled();

    vi.clearAllMocks();
    rate.tryAiQuota.mockResolvedValue(true);
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "a", admin: true });
    expect((await post(read, "casefiles/read", BODY)).status).toBe(200);
    expect(store.getAnonQuestionsUsed).not.toHaveBeenCalled();
    expect(rate.assertRateLimit).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).toHaveBeenCalledWith(CASEFILE_WEIGHT);
  });

  test("본문이 너무 크면 읽기 전에 400", async () => {
    const res = await post(read, "casefiles/read", BODY, { "content-length": "9000000" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toMatchObject({ reason: "too_large" });
    expect(store.resolveOwner).not.toHaveBeenCalled();
  });
});

describe("F-015 AC2 POST /casefiles/read 판독", () => {
  test("가린 판독 결과와 AI 고지를 no-store로 돌려주고, 실제 쓴 금액으로 정산한다", async () => {
    const res = await post(read, "casefiles/read", BODY);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(data).toEqual({
      reading: READING,
      piiFindings: [{ type: "name", count: 1 }],
      sensitive: [],
      dropped: 0,
      ai: { used: true },
      notice: AI_NOTICE,
    });
    expect(rate.tryAiQuota).toHaveBeenCalledWith(CASEFILE_WEIGHT);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(CASEFILE_WEIGHT, 0.0012);
    // 응답에 사진 내용이 되돌아오지 않는다
    expect(JSON.stringify(data)).not.toContain(JPEG);
  });

  test("무료 모드·예산 초과면 모델을 부르지 않고 이유만 알린다", async () => {
    mode.aiMode.mockReturnValue("free");
    let { data } = await (await post(read, "casefiles/read", BODY)).json();
    expect(data).toMatchObject({
      reading: null,
      ai: { used: false, reason: "free_mode" },
      notice: null,
    });
    expect(rate.tryAiQuota).not.toHaveBeenCalled();

    mode.aiMode.mockReturnValue("paid");
    rate.tryAiQuota.mockResolvedValue(false);
    ({ data } = await (await post(read, "casefiles/read", BODY)).json());
    expect(data).toMatchObject({ reading: null, ai: { used: false, reason: "budget" } });
    expect(ai.readCaseFiles).not.toHaveBeenCalled();
  });

  test("읽지 못한 경우에도 쓴 금액은 정산하고 AI 고지는 붙이지 않는다", async () => {
    ai.readCaseFiles.mockResolvedValue({ ok: false, reason: "unreadable", costUsd: 0.001 });
    const { data } = await (await post(read, "casefiles/read", BODY)).json();
    expect(data).toMatchObject({
      reading: null,
      ai: { used: false, reason: "unreadable" },
      notice: null,
    });
    expect(rate.settleAiQuota).toHaveBeenCalledWith(CASEFILE_WEIGHT, 0.001);
  });
});

describe("F-015 AC4 POST /businesses/lookup", () => {
  test("공식 API 결과와 바로 가기 링크, 고지를 no-store로 돌려준다 (모델 없음)", async () => {
    source.searchPlaces.mockResolvedValue({
      status: "ok",
      items: [{ title: "한빛주택", category: null, address: null, roadAddress: null, link: null }],
    });
    const res = await post(lookup, "businesses/lookup", { name: " 주식회사  한빛주택 " });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(source.searchPlaces).toHaveBeenCalledWith("주식회사 한빛주택");
    expect(source.searchCorps).toHaveBeenCalledWith("주식회사 한빛주택");
    expect(rate.assertRateLimit).toHaveBeenCalledWith(BUSINESS_RATE, expect.anything());
    expect(data.places.status).toBe("ok");
    expect(data.corps).toEqual({ status: "no_key", items: [] });
    expect(data.links).toHaveLength(3);
    expect(data.notice).toContain("AI 생성 아님");
    expect(ai.readCaseFiles).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("상호·기관 표지가 없는 이름(개인 이름·일반 낱말)은 외부로 보내지 않고 400", async () => {
    for (const name of ["김민수", "강남역 맛집"]) {
      const res = await post(lookup, "businesses/lookup", { name });
      expect(res.status).toBe(400);
      expect((await res.json()).error.details).toMatchObject({ reason: "not_business" });
    }
    expect(source.searchPlaces).not.toHaveBeenCalled();
    expect(source.searchCorps).not.toHaveBeenCalled();
    // 대표자 이름이 붙어 오면 상호만 보낸다
    await post(lookup, "businesses/lookup", { name: "주식회사 한빛주택 대표이사 김민수" });
    expect(source.searchPlaces).toHaveBeenCalledWith("주식회사 한빛주택");
  });

  test("연락처가 섞인 이름은 외부로 보내지 않고 400", async () => {
    const res = await post(lookup, "businesses/lookup", { name: "한빛상사 010-1234-5678" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("010-1234-5678");
    expect(source.searchPlaces).not.toHaveBeenCalled();
    expect(source.searchCorps).not.toHaveBeenCalled();
  });
});
