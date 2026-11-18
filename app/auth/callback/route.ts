// GET /auth/callback — Google 로그인에서 돌아오는 주소 (DEC-035). 인증 코드를 세션 쿠키로 바꾼 뒤 원래 화면으로 보낸다.
// 코드·오류 내용은 로그에 남기지 않는다. 돌아갈 곳은 같은 사이트의 경로만 받는다(외부 주소로 보내지 않는다).
import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/** 같은 사이트 안의 경로만 허용한다. "//host"·"/\\host"·주소 전체는 홈으로 */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const target = new URL(safeNext(url.searchParams.get("next")), url.origin);
  if (process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "on" || !code) {
    return NextResponse.redirect(new URL("/", url.origin));
  }
  try {
    const { error } = await (await createUserClient()).auth.exchangeCodeForSession(code);
    if (error) target.searchParams.set("login", "failed");
  } catch {
    target.searchParams.set("login", "failed");
  }
  return NextResponse.redirect(target);
}
