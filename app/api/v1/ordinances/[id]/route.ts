// GET /api/v1/ordinances/{id} — 자치법규 조문 (DEC-026 제안). id = 법제처 자치법규일련번호. 없으면 404.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { assertSeq, withNotice } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  assertSeq(id);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const detail = await createLawSource({ timeoutMs: 10_000 }).getOrdinance(id);
  if (!detail) throw new ApiError("NOT_FOUND");
  return ok(withNotice(detail), scope.requestId);
});
