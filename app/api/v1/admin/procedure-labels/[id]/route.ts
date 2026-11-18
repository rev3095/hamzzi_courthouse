// PATCH /api/v1/admin/procedure-labels/{id} — 라벨 승인·거절 (DEC-033, 관리자 모드 DEC-024).
// 승인하면 그 낱말이 든 질문에 절차 안내가 보이고, 거절하면 분류에 쓰지 않는다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { listLabels, reviewLabel } from "@/lib/procedure/labels-store";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = withRoute<Ctx>(async (req, ctx, scope) => {
  if (!(await isAdminRequest())) throw new ApiError("FORBIDDEN");
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND");
  const body = await readJson<{ status?: unknown }>(req);
  const status = body?.status;
  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    throw new ApiError("VALIDATION_ERROR", { fields: ["status"] });
  }
  if (status === "approved") {
    // 단계가 없는 "절차 미정" 라벨은 보여 줄 내용이 없어 승인할 수 없다
    const target = (await listLabels()).find((l) => l.id === id);
    if (target && !target.track && !target.steps?.length) {
      throw new ApiError("INVALID_STATE", { reason: "no_steps" });
    }
  }
  const label = await reviewLabel(id, status);
  if (!label) throw new ApiError("NOT_FOUND");
  return ok(label, scope.requestId);
});
