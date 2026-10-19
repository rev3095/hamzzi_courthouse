// PATCH /api/v1/admin/feature-gates/{key} — 게이트 상태 변경 (F-013 AC1·AC2, admin)
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { requireRole } from "@/lib/auth/server";
import { isFeatureKey, parseChangeRequest, planChange } from "@/lib/gate/policy";
import { changeGate, getGate } from "@/lib/gate/store";
import { gateView } from "@/lib/gate/view";

type Ctx = { params: Promise<{ key: string }> };

export const PATCH = withRoute<Ctx>(async (req, ctx, scope) => {
  const actor = await requireRole(scope, "admin");
  const { key } = await ctx.params;
  if (!isFeatureKey(key)) throw new ApiError("NOT_FOUND");
  const request = parseChangeRequest(await readJson(req));

  const current = await getGate(key);
  if (!current) throw new ApiError("NOT_FOUND");
  const next = planChange(current, request);

  const updated = await changeGate(key, next, actor.userId);
  return ok(gateView(updated), scope.requestId);
});
