// POST /api/v1/inquiries/{id}/pii-confirmation — 사용자가 마스킹본을 확인 (F-007 AC1)
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { parseConfirmation } from "@/lib/inquiries/policy";
import { getOwnedInquiry, markPiiConfirmed, resolveOwner } from "@/lib/inquiries/store";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  parseConfirmation(await readJson(req));
  const owner = await resolveOwner(scope, { create: false });
  const inquiry = await getOwnedInquiry(id, owner);
  if (inquiry.status !== "draft") throw new ApiError("INVALID_STATE", { status: inquiry.status });

  await markPiiConfirmed(inquiry);
  return ok({ id, status: "draft", readyToAnalyze: true }, scope.requestId);
});
