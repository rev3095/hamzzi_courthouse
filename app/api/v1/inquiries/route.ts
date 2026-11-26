// POST /api/v1/inquiries — 문제 입력·이어 묻기, PII 탐지·마스킹 (F-001 AC1~AC3, F-002 AC3, F-007 AC1·AC2)
// 원문은 scanInput에서만 쓰고 저장·응답·로그에 남기지 않는다 (DEC-006).
// 비로그인은 하루 ANON_QUESTION_LIMIT회까지 (DEC-010·024). 횟수는 analyze 성공 시 오르고, 여기서는 이미 다 썼는지만 본다.
// 예시 질문은 저장된 분석을 재생할 뿐이라 횟수를 보지 않는다 (DEC-027).
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { EXAMPLE_RATE, assertRateLimit } from "@/lib/auth/rate-limit";
import { findExampleFor } from "@/lib/demo/policy";
import {
  assertAnonQuota,
  countsAnonQuota,
  countsUserQuota,
  assertUserQuota,
  assertParentAnalyzed,
  assertSensitiveConsent,
  parseCreateRequest,
} from "@/lib/inquiries/policy";
import {
  createInquiry,
  findRecentDuplicate,
  getAnonQuestionsUsed,
  getOwnedInquiry,
  resolveOwner,
  getUserQuestionsUsed,
} from "@/lib/inquiries/store";
import { mergeFindings, parseStoredMaterials } from "@/lib/materials/policy";
import { scanInput } from "@/lib/pii";
import { ApiError } from "@/lib/api/errors";
import { assertQuestionAllowed } from "@/lib/inquiries/abuse-guard";

export const POST = withRoute(async (req, _ctx, scope) => {
  const { text, sensitiveConsent, parentInquiryId, save, materials } = parseCreateRequest(
    await readJson(req),
  );
  const scan = scanInput(text);
  // 첨부 자료(F-017, DEC-058)는 판독 때 가린 것이지만 화면에서 고칠 수 있어 서버가 같은 규칙으로 다시 거른다
  const attached = parseStoredMaterials(materials);
  assertSensitiveConsent(
    [...new Set([...scan.sensitive, ...attached.sensitive])],
    sensitiveConsent,
  );

  const owner = await resolveOwner(scope, { create: true });
  if (!owner) throw new Error("owner 없음");
  // 남용 막기 (DEC-072, 절대 규칙 9): 경고 한도 → 법률 무관·반복·지시문 바꾸기 규칙 판별. 거절하면 저장하지 않는다
  // analyze와 같은 기준이 되도록 가린 문장으로 본다
  await assertQuestionAllowed(scan.maskedText, owner, req.headers);
  // 자료가 붙은 질문은 예시 재생으로 보지 않는다 (분석도 같은 기준, lib/inquiries/analyze)
  const example = findExampleFor(scan.maskedText, attached.materials) !== null;
  if (countsAnonQuota(owner)) {
    // 예시 질문은 하루 횟수 대신 같은 네트워크 1시간 30회만 본다 (DEC-027)
    if (example) await assertRateLimit(EXAMPLE_RATE, req.headers);
    else assertAnonQuota(await getAnonQuestionsUsed(owner.anonSessionId));
  } else if (countsUserQuota(owner) && !example) {
    // Google 로그인 사용자는 하루 USER_QUESTION_LIMIT회 (DEC-035). 예시 질문은 세지 않는다
    assertUserQuota(await getUserQuestionsUsed(owner.userId));
  }

  // 같은 질문을 방금 분석했으면 새로 만들지 않고 앞의 결과로 보낸다 (DEC-072). 예시 질문·관리자 모드는 보지 않는다
  if (!example && !owner.admin && attached.materials.length === 0) {
    const previous = await findRecentDuplicate(owner, scan.maskedText, parentInquiryId);
    if (previous) throw new ApiError("DUPLICATE_QUESTION", { inquiryId: previous });
  }

  if (parentInquiryId) {
    // 남의 것 403, 없으면 404 (getOwnedInquiry), 분석 전이면 409
    assertParentAnalyzed(await getOwnedInquiry(parentInquiryId, owner));
  }

  // 화면에서 고친 자료 글에 새로 적힌 개인정보도 가린 것으로 알리고 확인 단계를 거친다 (F-007)
  const findings = mergeFindings(scan.findings, attached.findings);
  const { id, status } = await createInquiry(
    owner,
    { ...scan, findings },
    sensitiveConsent,
    parentInquiryId,
    save,
    {
      materials: attached.materials,
      sensitive: attached.sensitive,
    },
  );

  return ok(
    {
      id,
      status,
      piiFindings: findings,
      maskedText: scan.maskedText,
      piiConfirmationRequired: findings.length > 0,
    },
    scope.requestId,
    { status: 201 },
  );
});
