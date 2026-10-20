// POST /api/v1/inquiries — 문제 입력·이어 묻기, PII 탐지·마스킹 (F-001 AC1~AC3, F-002 AC3, F-007 AC1·AC2)
// 원문은 scanInput에서만 쓰고 저장·응답·로그에 남기지 않는다 (DEC-006).
// 비로그인은 3회까지 (DEC-010). 횟수는 analyze 성공 시 오르고, 여기서는 이미 다 썼는지만 본다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import {
  assertAnonQuota,
  assertParentAnalyzed,
  assertSensitiveConsent,
  parseCreateRequest,
} from "@/lib/inquiries/policy";
import {
  createInquiry,
  getAnonQuestionsUsed,
  getOwnedInquiry,
  resolveOwner,
} from "@/lib/inquiries/store";
import { scanInput } from "@/lib/pii";

export const POST = withRoute(async (req, _ctx, scope) => {
  const { text, sensitiveConsent, parentInquiryId } = parseCreateRequest(await readJson(req));
  const scan = scanInput(text);
  assertSensitiveConsent(scan.sensitive, sensitiveConsent);

  const owner = await resolveOwner(scope, { create: true });
  if (!owner) throw new Error("owner 없음");
  if (owner.kind === "anon") assertAnonQuota(await getAnonQuestionsUsed(owner.anonSessionId));

  if (parentInquiryId) {
    // 남의 것 403, 없으면 404 (getOwnedInquiry), 분석 전이면 409
    assertParentAnalyzed(await getOwnedInquiry(parentInquiryId, owner));
  }

  const { id, status } = await createInquiry(owner, scan, sensitiveConsent, parentInquiryId);

  return ok(
    {
      id,
      status,
      piiFindings: scan.findings,
      maskedText: scan.maskedText,
      piiConfirmationRequired: scan.findings.length > 0,
    },
    scope.requestId,
    { status: 201 },
  );
});
