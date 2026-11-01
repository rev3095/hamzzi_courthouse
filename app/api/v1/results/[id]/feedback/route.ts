// POST /api/v1/results/{id}/feedback — 도움 여부 (PRD 14, API.md 4절). 결과 소유자만(비로그인은 같은 익명 세션).
// 결과마다 1건(다시 보내면 덮어씀). 의견은 마스킹본만, 민감정보로 보이면 의견은 저장하지 않는다 (F-007, DEC-006).
import { readJson, withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { parseFeedbackRequest } from "@/lib/inquiries/policy";
import { getOwnedResultId, resolveOwner, saveFeedback } from "@/lib/inquiries/store";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  const { helpful, commentMasked } = parseFeedbackRequest(await readJson(req));
  const owner = await resolveOwner(scope, { create: false });
  const resultId = await getOwnedResultId(id, owner);
  await assertRateLimit(WRITE_RATE, req.headers);
  await saveFeedback(resultId, owner!, helpful, commentMasked);
  return new Response(null, { status: 204 });
});
