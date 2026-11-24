// POST /api/v1/materials/read — 질문·검색에 붙인 자료 사진 판독 (F-017 AC1·AC2, DEC-058, API.md).
// 본문: { images: [{ mediaType, data(base64) }], question?, consent: { images: true, sensitive: true } }. 동의가 하나라도 없으면 409 CONSENT_REQUIRED.
// 서류 분석(POST /casefiles/read)과 같은 검증·동의·예외를 쓴다: 사진은 판독 호출 1회에만 그대로 쓰고(절대 규칙 4 예외 하나),
// 사진·판독 원문은 저장·로그하지 않는다. 응답에는 lib/materials/policy가 가린 자료 정리와 검색어 후보만 싣는다(no-store).
// 질문 횟수는 여기서 차감하지 않는다 — 다 썼는지만 보고, 차감은 자료를 붙인 질문을 분석할 때 한다 (절대 규칙 7).
// 판독만 되풀이하지 못하게 서류 판독과 같은 네트워크 1시간 CASEFILE_RATE회 한도를 함께 쓴다. 비용은 1건 상한 + 전체 예산.
import { readMaterials } from "@/lib/ai/materials";
import { aiMode } from "@/lib/ai/mode";
import { MATERIALS_WEIGHT } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { CASEFILE_RATE, assertRateLimit, settleAiQuota, tryAiQuota } from "@/lib/auth/rate-limit";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
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
import { parseMaterialsReadRequest, type ScreenedMaterials } from "@/lib/materials/policy";

/** 사진·문서 올리기 + 판독 1회 (시간 한도 45초) */
export const maxDuration = 60;

type AiState =
  | { used: true }
  | { used: false; reason: "free_mode" | "budget" | "cost_cap" | "model_failed" | "unreadable" };

/** base64 본문 + JSON 겉감 여유 */
const MAX_BODY_BYTES = CASEFILE_LIMITS.maxTotalChars + 100_000;

export const POST = withRoute(async (req, _ctx, scope) => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["images"], reason: "too_large" });
  }
  const input = parseMaterialsReadRequest(await readJson(req));

  const owner = await resolveOwner(scope, { create: true });
  if (!owner) throw new Error("owner 없음");
  if (countsAnonQuota(owner)) {
    assertAnonQuota(await getAnonQuestionsUsed(owner.anonSessionId));
    await assertAnonIpAvailable(req.headers);
  } else if (countsUserQuota(owner)) {
    assertUserQuota(await getUserQuestionsUsed(owner.userId));
  }
  if (!owner.admin) await assertRateLimit(CASEFILE_RATE, req.headers);

  let ai: AiState;
  let data: ScreenedMaterials | null = null;
  if (aiMode() === "free") ai = { used: false, reason: "free_mode" };
  else if (!(await tryAiQuota(MATERIALS_WEIGHT))) ai = { used: false, reason: "budget" };
  else {
    // 기간 예산(DEC-040): 실제로 쓴 금액만 남긴다. 예상 밖 오류로 끝나도 잡아 둔 몫은 돌려준다
    let spent = 0;
    let out: Awaited<ReturnType<typeof readMaterials>>;
    try {
      out = await readMaterials(input);
      spent = out.costUsd;
    } finally {
      await settleAiQuota(MATERIALS_WEIGHT, spent);
    }
    if (out.ok) {
      ai = { used: true };
      data = {
        materials: out.materials,
        queries: out.queries,
        findings: out.findings,
        sensitive: out.sensitive,
        dropped: out.dropped,
      };
    } else ai = { used: false, reason: out.reason };
  }

  const res = ok(
    {
      materials: data?.materials ?? [],
      queries: data?.queries ?? [],
      piiFindings: data?.findings ?? [],
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
