// POST /api/v1/documents/{kind} — 내용증명·소장 양식 채우기 (DEC-022, API.md 5절). [게이트] legal_documents.
// OQ-003(AI 문서 범위) 법률 검토로 게이트가 승인되기 전에는 맨 앞에서 403 FEATURE_GATED (절대 규칙 5).
// 사용자 입력을 양식 칸에 넣기만 한다(LLM 없음). 입력·결과는 저장하지 않고 로그에도 남기지 않는다 (F-007, DEC-006).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { WRITE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import {
  DOCUMENT_NOTICE,
  fillDocument,
  isDocumentKind,
  parseDocumentInput,
} from "@/lib/documents/policy";
import { requireFeature } from "@/lib/gate/store";

type Ctx = { params: Promise<{ kind: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  await requireFeature("legal_documents");
  const { kind } = await ctx.params;
  if (!isDocumentKind(kind)) throw new ApiError("NOT_FOUND");
  await assertRateLimit(WRITE_RATE, req.headers);
  const input = parseDocumentInput(kind, await readJson(req));
  const doc = fillDocument(kind, input);
  const res = ok({ kind, ...doc, notice: DOCUMENT_NOTICE }, scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
