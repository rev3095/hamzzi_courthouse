// 개발 전용 · 햄찌법원 편집기(/studio) 마스코트 상태 그림 API. 공개 API(v1) 계약이 아니다.
// GET 지금 상태 · POST multipart(mood, file) 그림 저장 · POST JSON {action: "undo"|"reset", mood}
// 배포(production)·다른 주소·다른 사이트에서 보낸 요청은 404 (lib/mascot/policy.ts studioAllowed).
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import { isMood } from "@/lib/mascot/moods";
import { checkMascotUpload, MAX_MASCOT_BYTES, studioAllowed } from "@/lib/mascot/policy";
import { loadStudio, resetMood, saveMoodImage, undoMood } from "@/lib/mascot/store";
import { studioView } from "@/lib/mascot/view";

function guard(req: Request) {
  const h = req.headers;
  const allowed = studioAllowed({
    nodeEnv: process.env.NODE_ENV,
    method: req.method,
    host: h.get("host"),
    origin: h.get("origin"),
    secFetchSite: h.get("sec-fetch-site"),
  });
  if (!allowed) throw new ApiError("NOT_FOUND");
}

export const GET = withRoute(async (req, _ctx, { requestId }) => {
  guard(req);
  return ok(studioView(await loadStudio()), requestId);
});

export const POST = withRoute(async (req, _ctx, { requestId }) => {
  guard(req);
  const type = req.headers.get("content-type") ?? "";

  if (type.startsWith("multipart/form-data")) {
    // 본문을 다 읽기 전에 크기부터 본다 (그림 800KB + 양식 여유)
    if (Number(req.headers.get("content-length") ?? 0) > MAX_MASCOT_BYTES + 64 * 1024)
      throw new ApiError("VALIDATION_ERROR", { field: "file", reason: "too_large" });
    const form = await req.formData().catch(() => {
      throw new ApiError("VALIDATION_ERROR", { reason: "invalid_form" });
    });
    const mood = form.get("mood");
    const file = form.get("file");
    if (!isMood(mood)) throw new ApiError("VALIDATION_ERROR", { field: "mood" });
    if (!(file instanceof Blob)) throw new ApiError("VALIDATION_ERROR", { field: "file" });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = checkMascotUpload(bytes);
    if (problem) throw new ApiError("VALIDATION_ERROR", { field: "file", reason: problem });
    return ok(studioView(await saveMoodImage(mood, bytes)), requestId);
  }

  const body = await readJson<{ action?: unknown; mood?: unknown }>(req);
  if (!isMood(body.mood)) throw new ApiError("VALIDATION_ERROR", { field: "mood" });
  if (body.action !== "undo" && body.action !== "reset")
    throw new ApiError("VALIDATION_ERROR", { field: "action" });
  const next = body.action === "undo" ? await undoMood(body.mood) : await resetMood(body.mood);
  if (!next) throw new ApiError("INVALID_STATE", { reason: `nothing_to_${body.action}` });
  return ok(studioView(next), requestId);
});
