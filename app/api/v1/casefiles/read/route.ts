// POST /api/v1/casefiles/read — 서류 사진 판독 (F-015 AC1~AC3, DEC-052, API.md).
// 본문: { images: [{ mediaType, data(base64) }], question?, consent: { images: true, sensitive: true } }. 동의가 하나라도 없으면 409 CONSENT_REQUIRED.
// 사진은 미리 가릴 수 없어 동의한 요청에서만 판독 호출 1회에 그대로 쓴다 (절대 규칙 4의 예외). 사진·판독 원문은 저장·로그하지 않고,
// 응답에는 lib/casefile/policy가 가린 사건 개요·요구·당사자(개인 이름 없음)만 싣는다. 결과도 저장하지 않는다(no-store).
// 질문 횟수는 여기서 차감하지 않는다 — 다 썼는지만 보고(비로그인·로그인 모두), 차감은 확인한 개요를 분석할 때 한다 (절대 규칙 7).
// 그래서 판독만 되풀이하지 못하게 같은 네트워크 1시간 CASEFILE_RATE회로 따로 막고, 로그인 사용자는 하루 CASEFILE_USER_RATE회도 센다(DEC-070 ③). 비용은 1건 상한 + 전체 예산을 함께 받는다.
import { readCaseFiles } from "@/lib/ai/casefile";
import { aiMode } from "@/lib/ai/mode";
import { CASEFILE_WEIGHT } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import {
  CASEFILE_RATE,
  CASEFILE_USER_RATE,
  assertRateLimit,
  assertUserRate,
  settleAiQuota,
  tryAiQuota,
} from "@/lib/auth/rate-limit";
import { CASEFILE_LIMITS, parseReadRequest } from "@/lib/casefile/policy";
import {
  assertAnonQuota,
  assertUserQuota,
  countsAnonQuota,
  countsUserQuota,
} from "@/lib/inquiries/policy";
import {
  assertAnonIpAvailable,
  getAnonQuestionsUsed,
  getUserQuestionsUsed,
  resolveOwner,
} from "@/lib/inquiries/store";

/** 사진 올리기 + 판독 1회 (시간 한도 45초) */
export const maxDuration = 60;

type AiState =
  | { used: true }
  | { used: false; reason: "free_mode" | "budget" | "cost_cap" | "model_failed" | "unreadable" };

/** base64 본문 + JSON 겉감 여유 */
const MAX_BODY_BYTES = CASEFILE_LIMITS.maxTotalChars + 100_000;

export const POST = withRoute(async (req, _ctx, scope) => {
  // 너무 큰 본문은 읽기 전에 막는다
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["images"], reason: "too_large" });
  }
  const input = parseReadRequest(await readJson(req));

  const owner = await resolveOwner(scope, { create: true });
  if (!owner) throw new Error("owner 없음");
  if (countsAnonQuota(owner)) {
    assertAnonQuota(await getAnonQuestionsUsed(owner.anonSessionId));
    await assertAnonIpAvailable(req.headers);
  } else if (countsUserQuota(owner)) {
    assertUserQuota(await getUserQuestionsUsed(owner.userId));
  }
  if (!owner.admin) await assertRateLimit(CASEFILE_RATE, req.headers);
  // 사건 진행으로 간 판독은 질문 횟수가 차감되지 않아 로그인 사용자의 판독을 따로 센다 (DEC-070 ③) — 실제로 읽을 때만
  if (countsUserQuota(owner) && owner.kind === "user" && aiMode() !== "free") {
    await assertUserRate(CASEFILE_USER_RATE, owner.userId);
  }

  let ai: AiState;
  let data: { reading: unknown; piiFindings: unknown; sensitive: unknown; dropped: number } | null =
    null;
  if (aiMode() === "free") ai = { used: false, reason: "free_mode" };
  else if (!(await tryAiQuota(CASEFILE_WEIGHT))) ai = { used: false, reason: "budget" };
  else {
    // 기간 예산(DEC-040): 실제로 쓴 금액만 남긴다. 예상 밖 오류로 끝나도 잡아 둔 몫은 돌려준다
    let spent = 0;
    let out: Awaited<ReturnType<typeof readCaseFiles>>;
    try {
      out = await readCaseFiles(input);
      spent = out.costUsd;
    } finally {
      await settleAiQuota(CASEFILE_WEIGHT, spent);
    }
    if (out.ok) {
      ai = { used: true };
      data = {
        reading: out.reading,
        piiFindings: out.findings,
        sensitive: out.sensitive,
        dropped: out.dropped,
      };
    } else ai = { used: false, reason: out.reason };
  }

  const res = ok(
    {
      reading: data?.reading ?? null,
      piiFindings: data?.piiFindings ?? [],
      sensitive: data?.sensitive ?? [],
      // 결과를 말하는 표현·조문이나 사건번호가 들어 있어 뺀 문장 수 (내용은 싣지 않는다)
      dropped: data?.dropped ?? 0,
      ai,
      notice: ai.used ? AI_NOTICE : null,
    },
    scope.requestId,
  );
  res.headers.set("cache-control", "no-store");
  return res;
});
