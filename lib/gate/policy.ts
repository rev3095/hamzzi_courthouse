// F-013 기능 게이트 규칙 (순수 함수). DB·인증과 분리해 테스트한다.
import { ApiError } from "@/lib/api/errors";

export const GATE_STATUSES = ["pending_review", "conditional", "approved", "excluded"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

/** DATA_MODEL 4절. 법률 게이트 5개 + Phase 2 출시 플래그 2개 */
export const FEATURE_KEYS = [
  "lawyer_verification",
  "brief_posting",
  "proposals",
  "billing",
  "legal_documents",
  "consult_agent",
  "procedure_guide",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type GateCondition = { item: string; resolved: boolean };

export type Gate = {
  featureKey: FeatureKey;
  status: GateStatus;
  conditions: GateCondition[];
  reviewRef: string | null;
  approvedAt: string | null;
};

export type GateChangeRequest = {
  status: GateStatus;
  conditions?: GateCondition[];
  reviewRef: string;
  reason: string;
};

export const isFeatureKey = (v: string): v is FeatureKey =>
  (FEATURE_KEYS as readonly string[]).includes(v);

/** 승인된 게이트만 연다. 행이 없거나 pending_review·conditional·excluded면 닫힌다 (기본 거부). */
export function isOpen(gate: Pick<Gate, "status"> | null | undefined): boolean {
  return gate?.status === "approved";
}

/** 기능 실행 전 검사. 닫혀 있으면 403 FEATURE_GATED (F-013 AC1·AC2). */
export function assertOpen(key: FeatureKey, gate: Gate | null | undefined): void {
  if (!isOpen(gate)) {
    throw new ApiError("FEATURE_GATED", { featureKey: key, status: gate?.status ?? "missing" });
  }
}

/** 승인에 필요한데 아직 끝나지 않은 검토 항목 (F-013 AC1 "미완료 항목 표시"). */
export function unresolvedItems(gate: Pick<Gate, "conditions" | "reviewRef">): string[] {
  const missing: string[] = [];
  if (!gate.reviewRef?.trim()) missing.push("reviewRef");
  for (const c of gate.conditions) if (!c.resolved) missing.push(c.item);
  return missing;
}

/**
 * 관리자 상태 변경 검증 (API.md PATCH /admin/feature-gates/{key}).
 * approved로 바꾸려면 검토 기록(reviewRef)이 있고 모든 조건이 해결돼야 한다. 아니면 409 INVALID_STATE.
 * 승인 요청으로 기존 조건 항목을 지울 수 없다 — 지운 항목은 미해결로 본다 (조건 '삭제'로 승인 우회 방지).
 * reviewRef를 비워 보내면 기존 검토 기록을 유지한다.
 * 반환값은 저장할 다음 상태. 변경 이력(gate_changes)은 저장소가 같은 트랜잭션에서 남긴다.
 * DB 함수 change_feature_gate도 같은 규칙을 검사한다.
 */
export function planChange(current: Gate, req: GateChangeRequest) {
  const next = {
    status: req.status,
    conditions: req.conditions ?? current.conditions,
    reviewRef: req.reviewRef.trim() || current.reviewRef || "",
    reason: req.reason.trim(),
  };
  if (next.status === "approved") {
    const kept = new Set(next.conditions.map((c) => c.item));
    const removed = current.conditions.map((c) => c.item).filter((item) => !kept.has(item));
    const unresolved = [...unresolvedItems(next), ...removed];
    if (unresolved.length) {
      throw new ApiError("INVALID_STATE", {
        featureKey: current.featureKey,
        status: current.status,
        unresolved,
      });
    }
  }
  return next;
}

/** PATCH 본문 검증. 형식 오류는 VALIDATION_ERROR(필드 이름만). */
export function parseChangeRequest(body: unknown): GateChangeRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const fields: string[] = [];
  const status = b.status;
  if (typeof status !== "string" || !(GATE_STATUSES as readonly string[]).includes(status)) {
    fields.push("status");
  }
  if (typeof b.reviewRef !== "string") fields.push("reviewRef");
  if (typeof b.reason !== "string" || !b.reason.trim()) fields.push("reason");
  const conditions = b.conditions;
  if (
    conditions !== undefined &&
    !(
      Array.isArray(conditions) &&
      conditions.every(
        (c) =>
          c &&
          typeof c === "object" &&
          typeof (c as GateCondition).item === "string" &&
          (c as GateCondition).item.trim() !== "" &&
          typeof (c as GateCondition).resolved === "boolean",
      )
    )
  ) {
    fields.push("conditions");
  }
  if (fields.length) throw new ApiError("VALIDATION_ERROR", { fields });
  return {
    status: status as GateStatus,
    reviewRef: b.reviewRef as string,
    reason: b.reason as string,
    ...(conditions !== undefined && {
      conditions: (conditions as GateCondition[]).map((c) => ({
        item: c.item.trim(),
        resolved: c.resolved,
      })),
    }),
  };
}
