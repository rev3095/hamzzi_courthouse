import { type Gate, unresolvedItems } from "./policy";

/** 관리자 응답 형태. unresolved = 승인 전에 끝내야 할 항목 (F-013 AC1 "미완료 항목 표시"). */
export function gateView(g: Gate) {
  return {
    featureKey: g.featureKey,
    status: g.status,
    conditions: g.conditions,
    reviewRef: g.reviewRef,
    ...(g.approvedAt && { approvedAt: g.approvedAt }),
    unresolved: g.status === "approved" ? [] : unresolvedItems(g),
  };
}
