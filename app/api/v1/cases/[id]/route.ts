// GET /api/v1/cases/{id} — 판례 상세 (F-003 AC3). 판시사항·판결요지와 참조조문만, 전문은 주지 않는다 (DEC-007).
// 법제처에 없으면 404 — 대체 내용을 만들지 않는다 (API.md 3절).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { assertCaseId, caseDetailResponse } from "@/lib/search/browse";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  assertCaseId(id);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const detail = await createLawSource({ timeoutMs: 10_000 }).getCase(id);
  if (!detail) throw new ApiError("NOT_FOUND");
  return ok(caseDetailResponse(detail), scope.requestId);
});
