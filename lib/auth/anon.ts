import "server-only";

import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

// 비로그인 질문 추적용 익명 세션 쿠키 (DEC-005). 값은 anon_sessions.id
export const ANON_COOKIE = "hz_anon";
/** 쿠키 수명 — 임시 값. 보유 기간 확정은 OQ-DM-03 */
const ANON_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 쿠키의 익명 세션 ID. DB에 실제로 있는 세션만 인정한다. */
export async function getAnonSessionId(): Promise<string | null> {
  const value = (await cookies()).get(ANON_COOKIE)?.value;
  if (!value || !UUID.test(value)) return null;
  const { data, error } = await createServiceClient()
    .from("anon_sessions")
    .select("id")
    .eq("id", value)
    .maybeSingle<{ id: string }>();
  if (error) throw new Error("anon_sessions 조회 실패");
  return data?.id ?? null;
}

/** 익명 세션이 없으면 만들고 쿠키를 심는다. Route Handler에서만 호출한다(쿠키 쓰기). */
export async function ensureAnonSession(): Promise<string> {
  const existing = await getAnonSessionId();
  if (existing) return existing;
  const { data, error } = await createServiceClient()
    .from("anon_sessions")
    .insert({})
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error("anon_sessions 생성 실패");
  (await cookies()).set(ANON_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANON_COOKIE_MAX_AGE_S,
  });
  return data.id;
}
