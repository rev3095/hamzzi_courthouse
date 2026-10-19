"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "./env";

/** 브라우저용(anon 키, RLS 적용). 소셜 로그인 시작 등에만 쓴다. 서버 전용 키는 여기에 오지 않는다. */
export function createBrowserSupabase() {
  const { url, anonKey } = publicEnv();
  return createBrowserClient(url, anonKey);
}
