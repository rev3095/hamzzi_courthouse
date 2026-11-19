import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_TTL_MS,
  adminSecrets,
  issueAdminToken,
  verifyAdminToken,
} from "./admin-pass";

// 관리자 모드 쿠키 읽기·쓰기 (DEC-024). 관리자는 비로그인 하루 횟수 제한을 받지 않는다.
// 질문 1건 비용 상한·주간 전체 유료 상한(AI_WEEKLY_BUDGET_USD, DEC-026)은 관리자도 똑같이 받는다 — 비용 안전장치.

/** 이 요청이 관리자 모드인지. ADMIN_PASSCODE·ADMIN_PASSWORD가 모두 없으면 항상 false */
export async function isAdminRequest(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token, adminSecrets(process.env));
}

/** 관리자 쿠키를 심는다. Route Handler에서만 */
export async function setAdminCookie() {
  const secrets = adminSecrets(process.env);
  if (!secrets) throw new Error("관리자 모드 설정 없음");
  (await cookies()).set(ADMIN_COOKIE, issueAdminToken(secrets), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ADMIN_TTL_MS / 1000),
  });
}

export async function clearAdminCookie() {
  (await cookies()).delete(ADMIN_COOKIE);
}
