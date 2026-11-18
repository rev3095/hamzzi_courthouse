// GET /api/v1/admin/procedure-labels — AI 절차 분류 라벨 목록 (DEC-033, 관리자 모드 DEC-024).
// 라벨에는 질문 문장·개인정보가 없다 (일반 낱말·절차 이름·단계 문구만).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { listLabels } from "@/lib/procedure/labels-store";

export const GET = withRoute(async (_req, _ctx, scope) => {
  if (!(await isAdminRequest())) throw new ApiError("FORBIDDEN");
  const res = ok(await listLabels(), scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
