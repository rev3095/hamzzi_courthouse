// @vitest-environment node
// F-013 관리자 게이트 API — 인증·DB는 목으로 바꾸고 라우트의 권한·검증·응답 형식을 본다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { setLogSink } from "@/lib/api/log";
import type { Gate } from "@/lib/gate/policy";

const auth = vi.hoisted(() => ({ requireRole: vi.fn() }));
const store = vi.hoisted(() => ({ getGate: vi.fn(), listGates: vi.fn(), changeGate: vi.fn() }));
vi.mock("@/lib/auth/server", () => auth);
vi.mock("@/lib/gate/store", () => store);

const { GET } = await import("@/app/api/v1/admin/feature-gates/route");
const { PATCH } = await import("@/app/api/v1/admin/feature-gates/[key]/route");

setLogSink(() => {});

const pending: Gate = {
  featureKey: "brief_posting",
  status: "pending_review",
  conditions: [{ item: "간접식별 점검 기준", resolved: false }],
  reviewRef: null,
  approvedAt: null,
};

const patch = (key: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/v1/admin/feature-gates/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireRole.mockResolvedValue({ userId: "admin-1", role: "admin" });
  store.getGate.mockResolvedValue(pending);
});

describe("GET /admin/feature-gates", () => {
  test("F-013 AC1 게이트 목록에 미완료 항목을 표시한다", async () => {
    store.listGates.mockResolvedValue([pending]);
    const res = await GET(new Request("http://localhost/api/v1/admin/feature-gates"), undefined);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      featureKey: "brief_posting",
      status: "pending_review",
      unresolved: ["reviewRef", "간접식별 점검 기준"],
    });
  });

  test("관리자가 아니면 403 FORBIDDEN", async () => {
    auth.requireRole.mockRejectedValue(new ApiError("FORBIDDEN"));
    const res = await GET(new Request("http://localhost/api/v1/admin/feature-gates"), undefined);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(store.listGates).not.toHaveBeenCalled();
  });
});

describe("PATCH /admin/feature-gates/{key}", () => {
  test("F-013 AC1 Pending Review에서 바로 승인하면 409 INVALID_STATE, 변경하지 않음", async () => {
    const res = await patch("brief_posting", { status: "approved", reviewRef: "", reason: "출시" });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("INVALID_STATE");
    expect(body.error.details.unresolved).toEqual(["reviewRef", "간접식별 점검 기준"]);
    expect(store.changeGate).not.toHaveBeenCalled();
  });

  test("F-013 AC2 조건 해결·검토 기록이 있으면 승인하고 변경자 ID와 함께 저장소에 넘긴다", async () => {
    const conditions = [{ item: "간접식별 점검 기준", resolved: true }];
    store.changeGate.mockResolvedValue({
      ...pending,
      status: "approved",
      conditions,
      reviewRef: "legal/brief.md",
      approvedAt: "2026-10-19T12:00:00Z",
    });
    const res = await patch("brief_posting", {
      status: "approved",
      reviewRef: "legal/brief.md",
      reason: "검토 완료",
      conditions,
    });
    expect(res.status).toBe(200);
    expect(store.changeGate).toHaveBeenCalledWith(
      "brief_posting",
      { status: "approved", conditions, reviewRef: "legal/brief.md", reason: "검토 완료" },
      "admin-1",
    );
    expect((await res.json()).data).toMatchObject({ status: "approved", unresolved: [] });
  });

  test("모르는 기능 키는 404", async () => {
    const res = await patch("auto_matching", { status: "approved", reviewRef: "x", reason: "y" });
    expect(res.status).toBe(404);
  });

  test("비로그인은 401 UNAUTHENTICATED", async () => {
    auth.requireRole.mockRejectedValue(new ApiError("UNAUTHENTICATED"));
    const res = await patch("billing", { status: "conditional", reviewRef: "r", reason: "x" });
    expect(res.status).toBe(401);
  });

  test("본문 형식 오류는 400 VALIDATION_ERROR", async () => {
    const res = await patch("billing", { status: "approved" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.fields).toEqual(["reviewRef", "reason"]);
  });
});
