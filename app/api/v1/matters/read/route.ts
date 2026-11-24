// POST /api/v1/matters/read — 사건 진행: 서류 사진 읽기 (F-016 AC2, DEC-053, API.md). 로그인 사용자만.
// 본문 { images, consent: { images: true, sensitive: true } } — 서류 분석(F-015)과 같은 검증·동의를 쓴다.
// 사진은 이 호출 한 번에만 모델로 가고 저장·로그하지 않는다. 결과도 여기서 저장하지 않는다 — 화면이 사건 자료에 합친 뒤 저장한다.
// 본인 사건의 정리라 서류에 적힌 이름은 결과에 남긴다(사용자 결정, DEC-053). 연락처·등록번호 꼴은 가린다.
import { readMatterDocs } from "@/lib/ai/matter";
import { MATTER_READ_WEIGHT } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { CASEFILE_LIMITS, parseReadRequest } from "@/lib/casefile/policy";
import { runMatterAi } from "@/lib/matters/ai-gate";
import { requireMatterUser } from "@/lib/matters/store";

/** 사진 올리기 + 읽기 1회 (시간 한도 80초) */
export const maxDuration = 100;

export const POST = withRoute(async (req, _ctx, scope) => {
  const user = await requireMatterUser(scope);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > CASEFILE_LIMITS.maxTotalChars + 100_000) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["images"], reason: "too_large" });
  }
  const { images } = parseReadRequest(await readJson(req));
  const r = await runMatterAi(user, MATTER_READ_WEIGHT, () => readMatterDocs({ images }));
  const ai =
    r.skipped ??
    (r.out.ok ? { used: true as const } : { used: false as const, reason: r.out.reason });
  const reading = !r.skipped && r.out.ok ? r.out.reading : null;
  const res = ok({ reading, ai, notice: reading ? AI_NOTICE : null }, scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});
