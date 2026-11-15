// 개발 전용 · 편집기 되돌리기 기록 그림 미리보기 (.studio/mascot-history, 이 컴퓨터에만 있음). 배포에서는 404.
import { ApiError } from "@/lib/api/errors";
import { withRoute } from "@/lib/api/route";
import { studioAllowed } from "@/lib/mascot/policy";
import { readHistoryImage } from "@/lib/mascot/store";

type Ctx = { params: Promise<{ name: string }> };

export const GET = withRoute<Ctx>(async (req, ctx) => {
  const allowed = studioAllowed({
    nodeEnv: process.env.NODE_ENV,
    method: req.method,
    host: req.headers.get("host"),
    origin: null,
    secFetchSite: null,
  });
  if (!allowed) throw new ApiError("NOT_FOUND");
  const { name } = await ctx.params;
  const bytes = await readHistoryImage(name);
  if (!bytes) throw new ApiError("NOT_FOUND");
  return new Response(bytes as BodyInit, {
    headers: { "content-type": "image/webp", "cache-control": "no-store" },
  });
});
