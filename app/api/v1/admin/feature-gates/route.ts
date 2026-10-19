// GET /api/v1/admin/feature-gates — 게이트 상태와 미완료 검토 항목 (F-013, admin)
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { requireRole } from "@/lib/auth/server";
import { listGates } from "@/lib/gate/store";
import { gateView } from "@/lib/gate/view";

export const GET = withRoute(async (_req, _ctx, scope) => {
  await requireRole(scope, "admin");
  const gates = await listGates();
  return ok(gates.map(gateView), scope.requestId);
});
