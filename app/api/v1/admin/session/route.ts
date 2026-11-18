// POST·DELETE /api/v1/admin/session — 관리자 모드 켜기·끄기 (DEC-024, API.md 2절).
// 비밀번호는 서버 환경변수 ADMIN_PASSCODE(또는 ADMIN_PASSWORD)와 대조한다(코드·저장소에 두지 않음). 본문·비밀번호는 로그에 남기지 않는다.
// 짧은 비밀번호 대입을 막으려고 같은 네트워크 1시간 5번, 사이트 전체 하루 30번까지만 시도할 수 있다.
import { ApiError } from "@/lib/api/errors";
import { ok } from "@/lib/api/respond";
import { readJson, withRoute } from "@/lib/api/route";
import {
  ADMIN_LOGIN_GLOBAL,
  ADMIN_LOGIN_RATE,
  adminSecrets,
  passcodeMatches,
} from "@/lib/auth/admin-pass";
import { clearAdminCookie, setAdminCookie } from "@/lib/auth/admin-session";
import { assertRateLimit, tryGlobalQuota } from "@/lib/auth/rate-limit";

export const POST = withRoute(async (req, _ctx, scope) => {
  const secrets = adminSecrets(process.env);
  if (!secrets) throw new ApiError("NOT_FOUND");
  await assertRateLimit(ADMIN_LOGIN_RATE, req.headers);
  if (!(await tryGlobalQuota(ADMIN_LOGIN_GLOBAL))) {
    throw new ApiError("RATE_LIMITED", { reason: "admin_login_daily" });
  }
  const body = await readJson<{ passcode?: unknown }>(req);
  if (!passcodeMatches(body?.passcode, secrets)) throw new ApiError("UNAUTHENTICATED");
  await setAdminCookie();
  const res = ok({ admin: true }, scope.requestId);
  res.headers.set("cache-control", "no-store");
  return res;
});

export const DELETE = withRoute(async (_req, _ctx, scope) => {
  await clearAdminCookie();
  return ok({ admin: false }, scope.requestId);
});
