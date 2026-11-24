// @vitest-environment node
// POST /documents/{kind} (DEC-022, API.md 5절) — legal_documents 게이트 뒤의 양식 채우기 (절대 규칙 5, F-013).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { DOCUMENT_SPECS, fillDocument, parseDocumentInput } from "@/lib/documents/policy";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ requireFeature: vi.fn() }));
vi.mock("@/lib/gate/store", () => gate);
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));

const { POST } = await import("@/app/api/v1/documents/[kind]/route");

const LETTER = {
  subject: "대여금 반환 요청",
  senderName: "김햄찌",
  senderAddress: "서울시 가상구 해바라기로",
  recipientName: "이도토리",
  recipientAddress: "부산시 가상구 도토리길",
  facts: "작년 봄에 돈을 빌려주었습니다.",
  demand: "빌려준 돈을 돌려주시기 바랍니다.",
  deadline: "받으신 날부터 열흘 이내",
};

const call = (kind: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/v1/documents/${kind}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ kind }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireFeature.mockResolvedValue(undefined);
  rate.assertRateLimit.mockResolvedValue(undefined);
});

describe("POST /documents/{kind}", () => {
  test("DEC-055 문서 작성은 게이트 없이 모두에게 열려 있다 (게이트를 보지 않는다)", async () => {
    gate.requireFeature.mockRejectedValue(
      new ApiError("FEATURE_GATED", { featureKey: "legal_documents", status: "pending_review" }),
    );
    const res = await call("demand-letter", LETTER);
    expect(res.status).toBe(200);
    expect(gate.requireFeature).not.toHaveBeenCalled();
  });

  test("F-013 AC3 승인되면 입력값을 양식에 채워 돌려주고 저장하지 않는다 (no-store)", async () => {
    const res = await call("demand-letter", LETTER);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { data } = await res.json();
    expect(data.kind).toBe("demand-letter");
    expect(data.filename).toBe("내용증명.txt");
    expect(data.text).toContain("받는 사람: 이도토리");
    expect(data.notice).toMatch(/AI 생성 아님/);
  });

  test("모르는 문서 종류는 404", async () => {
    expect((await call("will", LETTER)).status).toBe(404);
  });

  test("빈 필드는 VALIDATION_ERROR — 필드 이름만 알리고 값은 넣지 않는다", async () => {
    const res = await call("demand-letter", {
      ...LETTER,
      facts: "  ",
      senderName: "김햄찌\n둘째줄",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details.fields).toEqual(["senderName", "facts"]);
    expect(JSON.stringify(body)).not.toContain("김햄찌");
  });
});

describe("DEC-022 양식 채우기 (LLM 없음)", () => {
  test("절대 규칙 3 사용자가 적지 않은 숫자·금액·이자를 만들지 않는다", () => {
    for (const kind of ["demand-letter", "complaint"] as const) {
      // 글자 칸만 채운다 (금액·날짜는 documents-forms.test.ts에서 따로 본다)
      const isWords = (f: { type: string }) => f.type === "text" || f.type === "textarea";
      const input: Record<string, string> = Object.fromEntries(
        DOCUMENT_SPECS[kind].fields
          .filter((f) => !f.optional && isWords(f))
          .map((f) => [f.key, `값${f.key}`]),
      );
      if (kind === "complaint") Object.assign(input, { claimAmount: "1", provisional: "no" });
      const { text } = fillDocument(kind, parseDocumentInput(kind, input));
      // 숫자는 목록 번호와 사용자가 적은 금액(1)뿐이다
      expect(text.replace(/^\d+\.\s/gm, "").replace("금 1원", ""), kind).not.toMatch(/[0-9]/);
      expect(text).not.toMatch(/이자|연\s*\d|%|승소|반드시/);
      for (const f of DOCUMENT_SPECS[kind].fields) {
        if (!f.optional && isWords(f)) expect(text).toContain(`값${f.key}`);
      }
    }
  });

  test("소장 청구취지는 기본 문장에 금액만 넣고, 청구원인은 입력 그대로 쓴다", () => {
    const input = {
      ...Object.fromEntries(
        DOCUMENT_SPECS.complaint.fields
          .filter((f) => f.type === "text" || f.type === "textarea")
          .map((f) => [f.key, f.optional ? "" : `${f.label} 입력`]),
      ),
      claimAmount: "1200000",
      provisional: "yes",
    };
    const { text, filename } = fillDocument("complaint", parseDocumentInput("complaint", input));
    expect(filename).toBe("소장.txt");
    expect(text).toMatch(/청 구 취 지\n1\. 피고는 원고에게 금 1,200,000원을 지급하라\./);
    expect(text).toMatch(/청 구 원 인\n청구원인 입력/);
    expect(text).toMatch(/제출할 법원 입력 귀중/);
  });
});
