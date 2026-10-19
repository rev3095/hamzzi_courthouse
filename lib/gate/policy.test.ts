// @vitest-environment node
import { describe, expect, test } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  FEATURE_KEYS,
  type Gate,
  assertOpen,
  isOpen,
  parseChangeRequest,
  planChange,
} from "./policy";
import { gateView } from "./view";

const gate = (over: Partial<Gate> = {}): Gate => ({
  featureKey: "billing",
  status: "pending_review",
  conditions: [],
  reviewRef: null,
  approvedAt: null,
  ...over,
});

const caught = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("예외가 나야 한다");
};

describe("F-013 AC1 Pending Review", () => {
  test("F-013 AC1 Pending Review 기능 실행은 FEATURE_GATED로 차단", () => {
    const err = caught(() => assertOpen("billing", gate()));
    expect(err.code).toBe("FEATURE_GATED");
    expect(err.details).toEqual({ featureKey: "billing", status: "pending_review" });
  });

  test("F-013 AC1 검토 기록 없이 승인 시도는 INVALID_STATE이고 미완료 항목을 알려 준다", () => {
    const err = caught(() =>
      planChange(gate({ conditions: [{ item: "개인정보 제3자 제공 검토", resolved: false }] }), {
        status: "approved",
        reviewRef: "",
        reason: "출시",
      }),
    );
    expect(err.code).toBe("INVALID_STATE");
    expect(err.details?.unresolved).toEqual(["reviewRef", "개인정보 제3자 제공 검토"]);
  });

  test("F-013 AC1 관리자 화면 응답에 미완료 항목이 보인다", () => {
    const view = gateView(gate({ conditions: [{ item: "약관 검토", resolved: false }] }));
    expect(view.unresolved).toEqual(["reviewRef", "약관 검토"]);
  });

  test("F-013 AC1 게이트 행이 없으면 기본 거부", () => {
    expect(isOpen(null)).toBe(false);
    expect(caught(() => assertOpen("proposals", null)).details?.status).toBe("missing");
  });
});

describe("F-013 AC2 Conditional", () => {
  const conditional = gate({
    status: "conditional",
    reviewRef: "legal/2026-10-review.md",
    conditions: [
      { item: "광고 표시 문구", resolved: true },
      { item: "환불 정책", resolved: false },
    ],
  });

  test("F-013 AC2 Conditional 상태는 실행이 차단된다", () => {
    expect(caught(() => assertOpen("billing", conditional)).code).toBe("FEATURE_GATED");
  });

  test("F-013 AC2 조건이 남아 있으면 재승인할 수 없다", () => {
    const err = caught(() =>
      planChange(conditional, { status: "approved", reviewRef: "legal/r2.md", reason: "재승인" }),
    );
    expect(err.code).toBe("INVALID_STATE");
    expect(err.details?.unresolved).toEqual(["환불 정책"]);
  });

  test("F-013 AC2 조건을 모두 해결하고 검토 기록을 남기면 재승인된다", () => {
    const next = planChange(conditional, {
      status: "approved",
      reviewRef: "legal/r2.md",
      reason: "조건 해결 후 재승인",
      conditions: [
        { item: "광고 표시 문구", resolved: true },
        { item: "환불 정책", resolved: true },
      ],
    });
    expect(next.status).toBe("approved");
    expect(next.reason).toBe("조건 해결 후 재승인");
  });
});

describe("F-013 AC3 Approved", () => {
  test("F-013 AC3 승인된 게이트만 열린다", () => {
    expect(() => assertOpen("billing", gate({ status: "approved" }))).not.toThrow();
  });

  test("F-013 AC3 승인 범위는 해당 기능 키뿐 — 다른 게이트는 그대로 닫혀 있다", () => {
    const gates = new Map(
      FEATURE_KEYS.map((k) => [
        k,
        gate({ featureKey: k, status: k === "billing" ? "approved" : "pending_review" }),
      ]),
    );
    expect(FEATURE_KEYS.filter((k) => isOpen(gates.get(k)))).toEqual(["billing"]);
  });

  test("F-013 excluded는 열리지 않는다", () => {
    expect(isOpen(gate({ status: "excluded" }))).toBe(false);
  });
});

describe("PATCH 본문 검증", () => {
  test("잘못된 필드는 이름만 VALIDATION_ERROR로 알린다", () => {
    const err = caught(() => parseChangeRequest({ status: "open", reason: " ", conditions: [{}] }));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details?.fields).toEqual(["status", "reviewRef", "reason", "conditions"]);
  });
});

describe("F-013 AC2 조건 삭제로 승인 우회 방지", () => {
  const withCondition = gate({
    status: "conditional",
    reviewRef: "legal/r1.md",
    conditions: [{ item: "환불 정책", resolved: false }],
  });

  test("F-013 AC2 승인 요청에서 미해결 조건을 지우면 그 항목을 미해결로 보고 차단한다", () => {
    const err = caught(() =>
      planChange(withCondition, {
        status: "approved",
        reviewRef: "legal/r2.md",
        reason: "승인",
        conditions: [],
      }),
    );
    expect(err.code).toBe("INVALID_STATE");
    expect(err.details?.unresolved).toEqual(["환불 정책"]);
  });

  test("reviewRef를 비워 보내면 기존 검토 기록을 유지한다", () => {
    const next = planChange(withCondition, {
      status: "conditional",
      reviewRef: " ",
      reason: "메모",
    });
    expect(next.reviewRef).toBe("legal/r1.md");
  });
});
