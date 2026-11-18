"use client";
// Google 로그인·로그아웃 (DEC-035). 로그인 방법은 Google 하나뿐이다 — 다른 공급자는 화면·서버 어디에도 두지 않는다.
// NEXT_PUBLIC_GOOGLE_LOGIN=1일 때만 버튼이 켜진다(Supabase에 Google 공급자를 켜기 전에 배포해도 깨지지 않게).
// 돌아갈 주소에는 현재 경로만 담는다 — 검색어·질문은 주소에 두지 않는다.
import { safeNextPath } from "@/lib/auth/next-path";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { notifyQuotaChanged } from "./api";

export const GOOGLE_LOGIN_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";

/** Google 로그인 화면으로 보낸다. 시작하지 못하면 false (페이지는 그대로) */
export async function signInWithGoogle(next: string = window.location.pathname): Promise<boolean> {
  if (!GOOGLE_LOGIN_ENABLED) return false;
  try {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
    const { error } = await createBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    return !error;
  } catch {
    return false;
  }
}

/** 이 브라우저의 로그인 세션을 지운다. 질문 횟수 표시를 다시 읽게 알린다 */
export async function signOut(): Promise<boolean> {
  try {
    const { error } = await createBrowserSupabase().auth.signOut();
    notifyQuotaChanged();
    return !error;
  } catch {
    return false;
  }
}
