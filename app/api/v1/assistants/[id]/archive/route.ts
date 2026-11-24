// GET /api/v1/assistants/{id}/archive — 전문 에이전트 아카이브 (F-018, DEC-057). 저장소에 둔 고정 질답 세트를 돌려준다.
// 모델·DB를 부르지 않는다. 인증 없음(공개 예시와 같은 자료).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { isAssistantId } from "@/lib/assistants/agents";
import { archiveOf } from "@/lib/assistants/archive-data";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withRoute<Ctx>(async (_req, ctx, scope) => {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) throw new ApiError("NOT_FOUND");
  return ok({ items: archiveOf(id) }, scope.requestId);
});
