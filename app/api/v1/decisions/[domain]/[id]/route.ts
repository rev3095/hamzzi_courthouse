// GET /api/v1/decisions/{domain}/{id} — 결정문 상세 (DEC-029 제안). 요지 항목만 준다. 요지가 모두 없을 때만 판례와 같이 개인정보를 가린 본문 일부(fromBody)를 주고, 이유·전문 전체는 주지 않는다 (DEC-007과 같은 원칙).
// 법제처에 없으면 404 — 대체 내용을 만들지 않는다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { LOOKUP_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { assertDecisionDomain, assertSeq, withNotice } from "@/lib/search/explore";
import { createLawSource } from "@/lib/search/law-source";

type Ctx = { params: Promise<{ domain: string; id: string }> };

export const GET = withRoute<Ctx>(async (req, ctx, scope) => {
  const p = await ctx.params;
  const domain = assertDecisionDomain(p.domain);
  assertSeq(p.id);
  await assertRateLimit(LOOKUP_RATE, req.headers);
  const detail = await createLawSource({ timeoutMs: 10_000 }).getDecision(domain, p.id);
  if (!detail) throw new ApiError("NOT_FOUND");
  return ok(withNotice(detail), scope.requestId);
});
