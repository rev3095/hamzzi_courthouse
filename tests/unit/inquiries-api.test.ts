// @vitest-environment node
// F-001·F-007 질문 입력 API — DB·인증은 목으로 바꾸고 마스킹·동의·응답·로그를 본다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { type RequestLog, setLogSink } from "@/lib/api/log";

const store = vi.hoisted(() => ({
  resolveOwner: vi.fn(),
  createInquiry: vi.fn(),
  getOwnedInquiry: vi.fn(),
  markPiiConfirmed: vi.fn(),
  getAnonQuestionsUsed: vi.fn(),
}));
vi.mock("@/lib/inquiries/store", () => store);

const { POST: create } = await import("@/app/api/v1/inquiries/route");
const { POST: confirm } = await import("@/app/api/v1/inquiries/[id]/pii-confirmation/route");

const RAW =
  "집주인 최영호가 보증금 500만원을 안 돌려줘요. 연락처는 010-9876-5432, 계좌는 우리은행 1002-123-456789입니다.";
const RAW_VALUES = ["최영호", "010-9876-5432", "1002-123-456789"];
const INQ_ID = "11111111-2222-3333-4444-555555555555";

let logs: RequestLog[] = [];
setLogSink((e) => logs.push(e));

const post = (body: unknown) =>
  create(
    new Request("http://localhost/api/v1/inquiries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    undefined,
  );

const postConfirm = (body: unknown) =>
  confirm(
    new Request(`http://localhost/api/v1/inquiries/${INQ_ID}/pii-confirmation`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: INQ_ID }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  store.resolveOwner.mockResolvedValue({ kind: "anon", anonSessionId: "anon-1" });
  store.createInquiry.mockResolvedValue({ id: INQ_ID, status: "draft" });
  store.getAnonQuestionsUsed.mockResolvedValue(0);
});

describe("POST /inquiries", () => {
  test("F-007 AC1 PII를 경고(유형·개수)하고 마스킹본만 돌려준다", async () => {
    const res = await post({ text: RAW });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data).toEqual({
      id: INQ_ID,
      status: "draft",
      piiFindings: [
        { type: "name", count: 1 },
        { type: "phone", count: 1 },
        { type: "account", count: 1 },
      ],
      maskedText:
        "집주인 [이름1]가 보증금 500만원을 안 돌려줘요. 연락처는 [전화번호], 계좌는 우리은행 [계좌번호]입니다.",
      piiConfirmationRequired: true,
    });
  });

  test("F-007 AC1 원문 값이 응답·저장 인자·로그 어디에도 없다 (DEC-006)", async () => {
    const res = await post({ text: RAW });
    const everything = [
      await res.text(),
      JSON.stringify(store.createInquiry.mock.calls),
      JSON.stringify(logs),
    ].join("\n");
    for (const v of RAW_VALUES) expect(everything).not.toContain(v);
  });

  test("F-007 AC2 민감정보 가능성이 있고 동의가 없으면 409이고 아무것도 저장하지 않는다", async () => {
    const res = await post({ text: "폭행당해서 정신과 치료를 받고 있어요" });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "CONSENT_REQUIRED",
      details: { kind: "sensitive_info", categories: ["health"] },
    });
    expect(store.resolveOwner).not.toHaveBeenCalled();
    expect(store.createInquiry).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("정신과");
  });

  test("F-007 AC2 별도 동의를 함께 보내면 저장한다", async () => {
    const res = await post({
      text: "폭행당해서 정신과 치료를 받고 있어요",
      sensitiveConsent: true,
    });
    expect(res.status).toBe(201);
    const [, scan, consent] = store.createInquiry.mock.calls[0];
    expect(scan.sensitive).toEqual(["health"]);
    expect(consent).toBe(true);
  });

  test("F-001 AC2 빈 입력은 400 EMPTY_INPUT이고 실행하지 않는다", async () => {
    const res = await post({ text: "  " });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("EMPTY_INPUT");
    expect(store.createInquiry).not.toHaveBeenCalled();
  });

  test("F-001 AC1 일상어 입력은 PII 없이 바로 분석 가능한 draft가 된다", async () => {
    const res = await post({ text: "사기를 당했는데 어떻게 도움받을 수 있을까?" });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ piiFindings: [], piiConfirmationRequired: false });
  });
});

describe("F-001 AC3 비로그인 3회 (DEC-010)", () => {
  test("F-001 AC3 3회를 쓴 비로그인은 401 LOGIN_REQUIRED이고 저장하지 않는다", async () => {
    store.getAnonQuestionsUsed.mockResolvedValue(3);
    const res = await post({ text: "사기를 당했어요" });
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toMatchObject({
      code: "LOGIN_REQUIRED",
      details: { loginProviders: ["google"] },
    });
    expect(store.createInquiry).not.toHaveBeenCalled();
  });

  test("F-001 AC3 2회까지 쓴 비로그인은 질문을 접수한다", async () => {
    store.getAnonQuestionsUsed.mockResolvedValue(2);
    expect((await post({ text: "사기를 당했어요" })).status).toBe(201);
  });

  test("F-001 AC3 로그인 사용자는 비로그인 횟수를 보지 않는다", async () => {
    store.resolveOwner.mockResolvedValue({ kind: "user", userId: "u1" });
    expect((await post({ text: "사기를 당했어요" })).status).toBe(201);
    expect(store.getAnonQuestionsUsed).not.toHaveBeenCalled();
  });
});

describe("F-002 AC3 이어 묻기 (DEC-011)", () => {
  const PARENT = "99999999-8888-7777-6666-555555555555";
  const parent = { id: PARENT, user_id: null, anon_session_id: "anon-1", status: "analyzed" };

  test("F-002 AC3 분석이 끝난 내 질문에 이어 물으면 앞 질문과 연결해 저장한다", async () => {
    store.getOwnedInquiry.mockResolvedValue(parent);
    const res = await post({ text: "그럼 내용증명은 어떻게 보내요?", parentInquiryId: PARENT });
    expect(res.status).toBe(201);
    expect(store.getOwnedInquiry).toHaveBeenCalledWith(PARENT, {
      kind: "anon",
      anonSessionId: "anon-1",
    });
    expect(store.createInquiry.mock.calls[0][3]).toBe(PARENT);
  });

  test("F-002 AC3 분석 전 질문에는 이어 물을 수 없다 (409 INVALID_STATE)", async () => {
    store.getOwnedInquiry.mockResolvedValue({ ...parent, status: "draft" });
    const res = await post({ text: "이어서", parentInquiryId: PARENT });
    expect(res.status).toBe(409);
    expect(store.createInquiry).not.toHaveBeenCalled();
  });

  test("F-002 AC3 남의 질문에는 이어 물을 수 없다 (403)", async () => {
    store.getOwnedInquiry.mockRejectedValue(new ApiError("FORBIDDEN"));
    const res = await post({ text: "이어서", parentInquiryId: PARENT });
    expect(res.status).toBe(403);
    expect(store.createInquiry).not.toHaveBeenCalled();
  });

  test("parentInquiryId 형식이 틀리면 400", async () => {
    const res = await post({ text: "이어서", parentInquiryId: "abc" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual({ fields: ["parentInquiryId"] });
  });
});

describe("POST /inquiries/{id}/pii-confirmation", () => {
  const row = {
    id: INQ_ID,
    user_id: null,
    anon_session_id: "anon-1",
    status: "draft",
    pii_findings: { findings: [{ type: "phone", count: 1 }], confirmedAt: null },
    sensitive_consent_at: null,
  };

  test("F-007 AC1 소유자가 마스킹본을 확인하면 분석 준비 완료", async () => {
    store.getOwnedInquiry.mockResolvedValue(row);
    const res = await postConfirm({ acceptMasked: true });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: INQ_ID, status: "draft", readyToAnalyze: true });
    expect(store.markPiiConfirmed).toHaveBeenCalledWith(row);
  });

  test("남의 질문이면 403 FORBIDDEN", async () => {
    store.getOwnedInquiry.mockRejectedValue(new ApiError("FORBIDDEN"));
    const res = await postConfirm({ acceptMasked: true });
    expect(res.status).toBe(403);
    expect(store.markPiiConfirmed).not.toHaveBeenCalled();
  });

  test("이미 분석된 질문은 409 INVALID_STATE", async () => {
    store.getOwnedInquiry.mockResolvedValue({ ...row, status: "analyzed" });
    const res = await postConfirm({ acceptMasked: true });
    expect(res.status).toBe(409);
  });

  test("마스킹본을 거절하면 400이고 확인 처리하지 않는다", async () => {
    const res = await postConfirm({ acceptMasked: false });
    expect(res.status).toBe(400);
    expect(store.getOwnedInquiry).not.toHaveBeenCalled();
  });
});
