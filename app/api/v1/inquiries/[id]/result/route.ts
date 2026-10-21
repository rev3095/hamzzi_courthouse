// GET /api/v1/inquiries/{id}/result — 소유자의 최신 분석 결과 (API.md 4절, PRD 8.3)
// 분석 중 연결이 끊겨도(SSE) 저장된 결과를 다시 볼 수 있게 한다. 조회만 하고 횟수를 쓰지 않는다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { getLatestResult, getOwnedInquiry, resolveOwner } from "@/lib/inquiries/store";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (_req, ctx, scope) => {
  const { id } = await ctx.params;
  const owner = await resolveOwner(scope, { create: false });
  const inquiry = await getOwnedInquiry(id, owner);
  const latest = inquiry.status === "analyzed" ? await getLatestResult(id) : null;
  if (!latest) throw new ApiError("NOT_FOUND");
  return ok({ status: "analyzed", resultId: latest.id, result: latest.response }, scope.requestId);
});
