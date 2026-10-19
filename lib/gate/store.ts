import "server-only";

import { ApiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import {
  type FeatureKey,
  type Gate,
  type GateChangeRequest,
  type GateCondition,
  type GateStatus,
  assertOpen,
  isFeatureKey,
} from "./policy";

type GateRow = {
  feature_key: string;
  status: GateStatus;
  conditions: GateCondition[] | null;
  review_ref: string | null;
  approved_at: string | null;
};

const toGate = (r: GateRow): Gate | null =>
  isFeatureKey(r.feature_key)
    ? {
        featureKey: r.feature_key,
        status: r.status,
        conditions: r.conditions ?? [],
        reviewRef: r.review_ref,
        approvedAt: r.approved_at,
      }
    : null;

const COLUMNS = "feature_key, status, conditions, review_ref, approved_at";

/** feature_gates 읽기·변경. 서버 판단만 쓴다 — 클라이언트 플래그로 열지 않는다 (ARCHITECTURE 3절). */
export async function getGate(key: FeatureKey): Promise<Gate | null> {
  const { data, error } = await createServiceClient()
    .from("feature_gates")
    .select(COLUMNS)
    .eq("feature_key", key)
    .maybeSingle<GateRow>();
  if (error) throw new Error("feature_gates 조회 실패");
  return data ? toGate(data) : null;
}

export async function listGates(): Promise<Gate[]> {
  const { data, error } = await createServiceClient()
    .from("feature_gates")
    .select(COLUMNS)
    .order("feature_key")
    .returns<GateRow[]>();
  if (error) throw new Error("feature_gates 조회 실패");
  return (data ?? []).map(toGate).filter((g): g is Gate => g !== null);
}

/**
 * 상태 변경 + gate_changes + audit_logs를 한 트랜잭션으로 남긴다 (DB 함수 change_feature_gate).
 * approved 조건(검토 기록·조건 해결)은 DB 함수도 다시 검사한다.
 */
export async function changeGate(
  key: FeatureKey,
  next: Required<Omit<GateChangeRequest, "conditions">> & { conditions: GateCondition[] },
  actorId: string,
): Promise<Gate> {
  const { data, error } = await createServiceClient()
    .rpc("change_feature_gate", {
      p_key: key,
      p_status: next.status,
      p_conditions: next.conditions,
      p_review_ref: next.reviewRef,
      p_reason: next.reason,
      p_actor: actorId,
    })
    .single<GateRow>();
  // 앱 검사와 DB 검사 사이에 상태가 바뀌어 DB가 승인을 거부한 경우도 409로 알린다
  if (error?.message?.includes("approval requires")) {
    throw new ApiError("INVALID_STATE", { featureKey: key, reason: "approval_conditions" });
  }
  if (error || !data) throw new Error("feature_gates 변경 실패");
  const gate = toGate(data);
  if (!gate) throw new Error("feature_gates 변경 실패");
  return gate;
}

/** Phase 2 `[게이트]` 엔드포인트 맨 앞에서 호출한다. 닫혀 있으면 403 FEATURE_GATED. */
export async function requireFeature(key: FeatureKey): Promise<void> {
  assertOpen(key, await getGate(key));
}
