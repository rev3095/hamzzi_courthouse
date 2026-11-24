// POST /api/v1/matters/summarize — 사건 진행: 찾은 글을 노트용으로 줄이기 (F-016 AC5, DEC-053, API.md). 로그인 사용자만.
// 본문 { text, matterId, personNames?, consent? }. 글은 이름·연락처를 가린 뒤에만 모델로 간다.
// 가릴 이름은 서버가 저장된 그 사건의 당사자에서 직접 모은다(maskNamesOf).
// 민감정보로 보이는 글은 동의(consent: true) 없이는 보내지 않는다. 결과는 여기서 저장하지 않는다.
import { summarizeText } from "@/lib/ai/matter";
import { MATTER_SUMMARY_WEIGHT } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { runMatterAi } from "@/lib/matters/ai-gate";
import { COMPANY_LIMITS, maskForModel, maskNamesOf, parseTextRequest } from "@/lib/matters/policy";
import { getMatter, requireMatterUser } from "@/lib/matters/store";

export const maxDuration = 40;

export const POST = withRoute(async (req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  const body = (await readJson<Record<string, unknown>>(req)) ?? {};
  const { text, matterId, personNames } = parseTextRequest(body, COMPANY_LIMITS.pastedChars);
  const matter = await getMatter(user.userId, matterId);
  const masked = maskForModel(text, maskNamesOf(matter.data, personNames));
  if (masked.sensitive.length > 0 && body.consent !== true) {
    throw new ApiError("CONSENT_REQUIRED", {
      kind: "sensitive_info",
      categories: masked.sensitive,
    });
  }
  const r = await runMatterAi(user, MATTER_SUMMARY_WEIGHT, () => summarizeText(masked.text));
  const ai =
    r.skipped ??
    (r.out.ok ? { used: true as const } : { used: false as const, reason: r.out.reason });
  const lines = !r.skipped && r.out.ok ? r.out.lines : [];
  const res = ok({ lines, ai, notice: lines.length > 0 ? AI_NOTICE : null }, scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
