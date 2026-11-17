// 관리자 모드(DEC-024) 순수 규칙 — 비밀번호 대조와 관리자 쿠키 서명·확인. 쿠키·환경변수는 admin-session.ts가 읽는다.
// 비밀번호는 코드·저장소에 두지 않는다(공개 저장소). 서버 환경변수 ADMIN_PASSCODE로만 받는다.
// 쿠키 값 = "<만료 시각 ms>.<HMAC>". 서명 키는 서버 비밀(SUPABASE_SERVICE_ROLE_KEY)과 비밀번호로 만든다 —
// 비밀번호를 바꾸면 이전 쿠키는 모두 무효가 되고, 서버 비밀 없이는 쿠키를 만들 수 없다.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "hz_admin";
/** 관리자 쿠키 수명 7일 */
export const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 같은 네트워크 1시간 5번, 사이트 전체 하루 30번까지만 시도할 수 있다 (짧은 비밀번호 대입 방지) */
export const ADMIN_LOGIN_RATE = { bucket: "admin_login", limit: 5, windowSeconds: 3600 };
export const ADMIN_LOGIN_GLOBAL = { bucket: "admin_login_all", limit: 30, windowSeconds: 86_400 };

export type AdminSecrets = { passcode: string; serverSecret: string };

/** 둘 다 있을 때만 관리자 모드를 쓸 수 있다 */
export function adminSecrets(env: Record<string, string | undefined>): AdminSecrets | null {
  const passcode = env.ADMIN_PASSCODE?.trim();
  const serverSecret = env.SUPABASE_SERVICE_ROLE_KEY;
  return passcode && serverSecret ? { passcode, serverSecret } : null;
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** 입력 비밀번호 대조 (길이와 상관없이 같은 시간) */
export function passcodeMatches(input: unknown, secrets: AdminSecrets): boolean {
  if (typeof input !== "string" || input.length === 0 || input.length > 200) return false;
  return timingSafeEqual(sha(input.trim()), sha(secrets.passcode));
}

function sign(exp: number, secrets: AdminSecrets): string {
  const key = createHmac("sha256", secrets.serverSecret)
    .update(`hz-admin-v1:${secrets.passcode}`)
    .digest();
  return createHmac("sha256", key).update(`admin:${exp}`).digest("hex");
}

export function issueAdminToken(secrets: AdminSecrets, now: number = Date.now()): string {
  const exp = now + ADMIN_TTL_MS;
  return `${exp}.${sign(exp, secrets)}`;
}

export function verifyAdminToken(
  token: string | undefined,
  secrets: AdminSecrets | null,
  now: number = Date.now(),
): boolean {
  if (!token || !secrets) return false;
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > now) || exp > now + ADMIN_TTL_MS) return false;
  const want = Buffer.from(sign(exp, secrets), "hex");
  return timingSafeEqual(want, Buffer.from(m[2], "hex"));
}
