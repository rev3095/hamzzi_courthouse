// @vitest-environment node
// POST /materials/read · POST /inquiries의 materials (F-017, DEC-058, API.md) — 동의·횟수·비용 예산·no-store·AI 고지·저장 전 다시 거르기.
// 저장소·모델은 모두 가짜다 (절대 규칙 8).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AI_NOTICE } from "@/lib/api/respond";
import { MATERIALS_WEIGHT } from "@/lib/ai/models";
import { ANON_QUESTION_LIMIT } from "@/lib/inquiries/policy";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  getAnonQuestionsUsed: vi.fn(),
  getUserQuestionsUsed: vi.fn(),
  assertAnonIpAvailable: vi.fn(),
  createInquiry: vi.fn(),
  getOwnedInquiry: vi.fn(),
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
const ai = vi.hoisted(() => ({ readMaterials: vi.fn() }));
vi.mock("@/lib/ai/materials", () => ai);

const { POST: read } = await import("@/app/api/v1/materials/read/route");
const { POST: create } = await import("@/app/api/v1/inquiries/route");
const { CASEFILE_RATE } = await import("@/lib/auth/rate-limit");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(60).fill(0)]).toString("base64");
const BODY = {
  images: [{ mediaType: "image/jpeg", data: JPEG }],
  question: "이 대화로 뭘 할 수 있나요",
  consent: { images: true, sensitive: true },
};
const MATERIALS = [
  {
    kind: "메신저 대화",
    summary: "보증금 반환 날짜를 두고 나눈 대화입니다.",
    details: ["다음 달에 돌려주겠다"],
    gaps: [],
  },
];

const post = (handler: typeof read, path: string, body: unknown) =>
  handler(
    new Request(`http://localhost/api/v1/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    undefined,
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
  store.getAnonQuestionsUsed.mockResolvedValue(0);
  store.getUserQuestionsUsed.mockResolvedValue(0);
  store.assertAnonIpAvailable.mockResolvedValue(undefined);
  store.createInquiry.mockResolvedValue({ id: "inq-1", status: "draft" });
  rate.assertRateLimit.mockResolvedValue(undefined);
  rate.tryAiQuota.mockResolvedValue(true);
  rate.settleAiQuota.mockResolvedValue(undefined);
  mode.aiMode.mockReturnValue("paid");
  ai.readMaterials.mockResolvedValue({
    ok: true,
    costUsd: 0.0011,
    materials: MATERIALS,
    queries: ["임대차보증금 반환"],
    findings: [],
    sensitive: [],
    dropped: 0,
  });
});

describe("F-017 AC1 POST /materials/read 동의·횟수", () => {
  test("동의가 없으면 409 — 소유자·예산·모델을 건드리지 않는다", async () => {
    const res = await post(read, "materials/read", {
      ...BODY,
      consent: { images: true, sensitive: false },
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "CONSENT_REQUIRED",
      details: { kind: "sensitive_info" },
    });
    expect(store.resolveOwner).not.toHaveBeenCalled();
    expect(ai.readMaterials).not.toHaveBeenCalled();
  });

  test("비로그인이 하루 횟수를 다 썼으면 모델 전에 401 (절대 규칙 7)", async () => {
    store.getAnonQuestionsUsed.mockResolvedValue(ANON_QUESTION_LIMIT);
    const res = await post(read, "materials/read", BODY);
    expect(res.status).toBe(401);
    expect(ai.readMaterials).not.toHaveBeenCalled();
  });

  test("서류 판독과 같은 네트워크 시간 한도를 쓴다. 관리자 모드는 건너뛴다", async () => {
    await post(read, "materials/read", BODY);
    expect(rate.assertRateLimit).toHaveBeenCalledWith(CASEFILE_RATE, expect.anything());
    vi.clearAllMocks();
    store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "a", admin: true });
    rate.tryAiQuota.mockResolvedValue(true);
    ai.readMaterials.mockResolvedValue({ ok: false, reason: "unreadable", costUsd: 0.001 });
    await post(read, "materials/read", BODY);
    expect(rate.assertRateLimit).not.toHaveBeenCalled();
  });
});

describe("F-017 AC2 판독 결과·비용", () => {
  test("가린 정리·검색어·AI 고지를 싣고 저장하지 않는다(no-store). 쓴 금액으로 정산한다", async () => {
    const res = await post(read, "materials/read", BODY);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(data).toMatchObject({
      materials: MATERIALS,
      queries: ["임대차보증금 반환"],
      ai: { used: true },
      notice: AI_NOTICE,
    });
    expect(JSON.stringify(data)).not.toContain(JPEG);
    expect(rate.tryAiQuota).toHaveBeenCalledWith(MATERIALS_WEIGHT);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(MATERIALS_WEIGHT, 0.0011);
  });

  test("무료 모드·예산 없음이면 모델을 부르지 않는다", async () => {
    mode.aiMode.mockReturnValue("free");
    const free = await (await post(read, "materials/read", BODY)).json();
    expect(free.data.ai).toEqual({ used: false, reason: "free_mode" });
    mode.aiMode.mockReturnValue("paid");
    rate.tryAiQuota.mockResolvedValue(false);
    const budget = await (await post(read, "materials/read", BODY)).json();
    expect(budget.data.ai).toEqual({ used: false, reason: "budget" });
    expect(budget.data.notice).toBeNull();
    expect(ai.readMaterials).not.toHaveBeenCalled();
  });

  test("모델이 예상 밖 오류로 끝나도 잡아 둔 예산은 돌려준다", async () => {
    ai.readMaterials.mockRejectedValue(new Error("boom"));
    const res = await post(read, "materials/read", BODY);
    expect(res.status).toBe(500);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(MATERIALS_WEIGHT, 0);
  });
});

describe("F-017 AC3 POST /inquiries materials", () => {
  test("자료를 서버가 다시 가려 질문 행에 넘긴다", async () => {
    const r2 = await create(
      new Request("http://localhost/api/v1/inquiries", {
        method: "POST",
        body: JSON.stringify({
          text: "이 대화로 뭘 할 수 있나요",
          materials: [{ ...MATERIALS[0], summary: "홍길동 님과 나눈 대화입니다." }],
        }),
      }),
      undefined,
    );
    expect(r2.status).toBe(201);
    const attached = store.createInquiry.mock.calls[0][5];
    expect(attached.materials).toHaveLength(1);
    expect(JSON.stringify(attached.materials)).not.toContain("홍길동");
  });

  test("자료 글에 새로 적힌 개인정보도 가린 것으로 알려 확인 단계를 거친다 (F-007)", async () => {
    const r = await create(
      new Request("http://localhost/api/v1/inquiries", {
        method: "POST",
        body: JSON.stringify({
          text: "어떻게 하죠",
          materials: [{ ...MATERIALS[0], details: ["연락처 010-1234-5678"] }],
        }),
      }),
      undefined,
    );
    const { data } = await r.json();
    expect(data.piiConfirmationRequired).toBe(true);
    expect(data.piiFindings).toEqual([{ type: "phone", count: 1 }]);
  });

  test("예시 질문 글이라도 자료가 붙으면 예시 한도가 아니라 하루 횟수를 본다", async () => {
    const { demoExamples } = await import("@/lib/demo/policy");
    store.getAnonQuestionsUsed.mockResolvedValue(ANON_QUESTION_LIMIT);
    const r = await create(
      new Request("http://localhost/api/v1/inquiries", {
        method: "POST",
        body: JSON.stringify({ text: demoExamples()[0].question, materials: MATERIALS }),
      }),
      undefined,
    );
    expect(r.status).toBe(401);
  });

  test("자료에 민감정보가 있으면 동의 없이 저장하지 않는다 (409)", async () => {
    const r = await create(
      new Request("http://localhost/api/v1/inquiries", {
        method: "POST",
        body: JSON.stringify({
          text: "어떻게 하죠",
          materials: [{ ...MATERIALS[0], summary: "병원 진단서 사진입니다." }],
        }),
      }),
      undefined,
    );
    expect(r.status).toBe(409);
    expect(store.createInquiry).not.toHaveBeenCalled();
  });

  test("형식이 틀린 자료는 400", async () => {
    const r = await create(
      new Request("http://localhost/api/v1/inquiries", {
        method: "POST",
        body: JSON.stringify({ text: "어떻게 하죠", materials: "자료" }),
      }),
      undefined,
    );
    expect(r.status).toBe(400);
  });
});
