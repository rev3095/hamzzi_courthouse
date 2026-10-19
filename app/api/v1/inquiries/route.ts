// POST /api/v1/inquiries — 문제 입력, PII 탐지·마스킹 (F-001 AC1·AC2, F-007 AC1·AC2)
// 원문은 scanInput에서만 쓰고 저장·응답·로그에 남기지 않는다 (DEC-006).
// 비로그인 1회 제한(LOGIN_REQUIRED, F-001 AC3)은 4단계에서 추가한다.
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { assertSensitiveConsent, parseCreateRequest } from "@/lib/inquiries/policy";
import { createInquiry, resolveOwner } from "@/lib/inquiries/store";
import { scanInput } from "@/lib/pii";

export const POST = withRoute(async (req, _ctx, scope) => {
  const { text, sensitiveConsent } = parseCreateRequest(await readJson(req));
  const scan = scanInput(text);
  assertSensitiveConsent(scan.sensitive, sensitiveConsent);

  const owner = await resolveOwner(scope, { create: true });
  if (!owner) throw new Error("owner 없음");
  const { id, status } = await createInquiry(owner, scan, sensitiveConsent);

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
