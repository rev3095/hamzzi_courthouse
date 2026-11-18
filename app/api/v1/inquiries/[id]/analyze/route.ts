// POST /api/v1/inquiries/{id}/analyze — 데모 분석 (API.md 4.1, F-002 AC3, F-003~F-007, DEC-009~013)
// 소유자 확인 → 상태·PII 확인·비로그인 3회 검사 → 분석·인용 검증·횟수 차감·저장 (lib/inquiries/analyze).
// Accept: text/event-stream이면 진행 단계(step)를 스트리밍하고 마지막에 result 또는 error를 보낸다.
import { writeRequestLog } from "@/lib/api/log";
import { ok } from "@/lib/api/respond";
import { withRoute } from "@/lib/api/route";
import { sseResponse } from "@/lib/api/sse";
import { ERROR_STATUS } from "@/lib/api/errors";
import { findExample } from "@/lib/demo/policy";
import { analyzeInquiry } from "@/lib/inquiries/analyze";
import {
  assertAnalyzable,
  assertAnonQuota,
  parseAnalyzeRequest,
  countsAnonQuota,
  countsUserQuota,
  assertUserQuota,
  assertReadyToAnalyze,
  wantsEventStream,
} from "@/lib/inquiries/policy";
import {
  assertAnonIpAvailable,
  claimInquiryForUser,
  getAnonQuestionsUsed,
  getUserQuestionsUsed,
  getOwnedInquiry,
  resolveOwner,
} from "@/lib/inquiries/store";

/** 데모 응답 기준 p95 ≤ 90초 (DEC-014). 분석 예산은 lib/inquiries/analyze의 ANALYSIS_BUDGET_MS. Vercel Hobby 한도 300초 */
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export const POST = withRoute<Ctx>(async (req, ctx, scope) => {
  const { id } = await ctx.params;
  // 본문은 선택: 홈 카테고리(DEC-028). 검증 실패는 소유자 확인 전에 400
  const { category } = parseAnalyzeRequest(await req.text());
  const owner = await resolveOwner(scope, { create: false });
  const inquiry = await getOwnedInquiry(id, owner);
  if (!owner) throw new Error("owner 없음"); // getOwnedInquiry가 이미 403을 낸다
  assertAnalyzable(inquiry.status);
  assertReadyToAnalyze({ status: inquiry.status, piiFindings: inquiry.pii_findings });
  // 로그인 전 질문을 로그인 뒤 분석하면 먼저 계정에 연결해 하루 한도에 들어가게 한다 (DEC-035)
  if (owner.kind === "user" && inquiry.user_id === null) await claimInquiryForUser(id, owner);
  // 3회를 다 쓴 비로그인은 모델을 부르기 전에 막는다 (DEC-010). 실제 차감은 성공 후
  // IP 해시 24시간 상한도 먼저 본다 — 쿠키를 바꿔 가며 분석 비용을 쓰는 것을 막는다. 최종 판정은 저장 트랜잭션에서
  // 관리자 모드(DEC-024)는 횟수·IP 상한을 받지 않는다 (질문 1건·주간 전체 비용 상한은 그대로)
  // 예시 질문은 저장된 분석 재생(토큰 0)이라 횟수·IP 상한을 보지 않고 차감도 없다 (DEC-027)
  if (countsAnonQuota(owner) && findExample(inquiry.masked_text) === null) {
    assertAnonQuota(await getAnonQuestionsUsed(owner.anonSessionId));
    await assertAnonIpAvailable(req.headers);
  } else if (countsUserQuota(owner) && findExample(inquiry.masked_text) === null) {
    // Google 로그인 사용자는 하루 USER_QUESTION_LIMIT회 (DEC-035) — 모델 호출 전에 오늘 분석 수를 본다
    assertUserQuota(await getUserQuestionsUsed(owner.userId));
  }

  if (!wantsEventStream(req)) {
    const out = await analyzeInquiry(inquiry, owner, req.headers, undefined, { category });
    return ok({ status: "analyzed", ...out }, scope.requestId);
  }

  const started = performance.now();
  return sseResponse(
    scope.requestId,
    async (send) => {
      const out = await analyzeInquiry(inquiry, owner, req.headers, (e) => send("step", e), {
        category,
      });
      send("result", { status: "analyzed", ...out });
    },
    // 스트림은 응답을 돌려준 뒤에 끝나므로 결과(오류 코드)를 따로 남긴다 — 본문·메시지는 남기지 않는다
    (errorCode, errorType) =>
      writeRequestLog({
        requestId: scope.requestId,
        method: "POST",
        path: `${new URL(req.url).pathname}#stream`,
        status: errorCode ? ERROR_STATUS[errorCode] : 200,
        latencyMs: Math.round(performance.now() - started),
        ...(errorCode && { errorCode }),
        ...(errorType && { errorType }),
      }),
  );
});
