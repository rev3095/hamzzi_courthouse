"use client";
// Google 로그인 (DEC-035). NEXT_PUBLIC_GOOGLE_LOGIN=on일 때만 화면에 나온다 — 꺼져 있으면 데모는 지금처럼 비로그인 전용(DEC-016).
// 로그인 상태는 Supabase 세션 쿠키로 이 브라우저에 유지된다(다시 와도 로그인된 채로 열린다).
// 같은 IP라는 이유로 자동 로그인하지는 않는다 — 공유 네트워크의 다른 사람이 남의 계정으로 들어가게 되기 때문이다.
// 이름·프로필 사진은 화면 표시에만 쓰고 서버·로그·저장소에 따로 남기지 않는다.
import { useEffect, useState, useSyncExternalStore } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export const LOGIN_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "on";

export type AuthUser = { name: string; avatarUrl: string | null };

type Meta = Record<string, unknown> | undefined;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Google이 준 프로필에서 화면에 쓸 값만 고른다. 사진 주소는 https만 받는다 */
export function profileOf(meta: Meta, email?: string | null): AuthUser {
  const avatar = text(meta?.avatar_url) ?? text(meta?.picture);
  return {
    name: text(meta?.full_name) ?? text(meta?.name) ?? email?.split("@")[0] ?? "사용자",
    avatarUrl: avatar && avatar.startsWith("https://") ? avatar : null,
  };
}

/** 로그인 사용자 (없거나 로그인이 꺼져 있으면 null). 세션은 브라우저 쿠키에서 읽는다 */
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    if (!LOGIN_ENABLED) return;
    let supabase: ReturnType<typeof createBrowserSupabase>;
    try {
      supabase = createBrowserSupabase();
    } catch {
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? profileOf(u.user_metadata, u.email) : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return user;
}

/** 로그인 뒤 돌아올 화면. 같은 사이트의 경로만 넘긴다 */
export function signInWithGoogle(next: string = window.location.pathname) {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  return createBrowserSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}

export async function signOut() {
  await createBrowserSupabase().auth.signOut();
  // 로그인 상태에 기대는 화면(헤더·남은 질문·내 기록)을 처음부터 다시 그린다
  window.location.reload();
}

// ── 내 기록에 남기기 (이 기기에 기억하는 선택. 기본은 남기지 않음) ──
const SAVE_KEY = "hz:save";
const SAVE_EVENT = "hz:save";

export function readSave(): boolean {
  try {
    return LOGIN_ENABLED && localStorage.getItem(SAVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSave(on: boolean) {
  try {
    if (on) localStorage.setItem(SAVE_KEY, "1");
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // 저장소를 못 쓰면 남기지 않는 쪽으로 동작한다
  }
  window.dispatchEvent(new Event(SAVE_EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(SAVE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SAVE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useSave(): boolean {
  return useSyncExternalStore(subscribe, readSave, () => false);
}
