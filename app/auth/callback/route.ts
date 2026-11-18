// GET /auth/callback — Google 로그인에서 돌아오는 주소 (DEC-035). Supabase가 준 일회용 코드를 세션 쿠키로 바꾸고
// 원래 보던 화면(사이트 안 경로만)으로 보낸다. 코드·토큰·이메일은 로그에 남기지 않는다(F-007).
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { createUserClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const { error } = await (await createUserClient()).auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    } catch {
      // 아래 실패 안내로
    }
  }
  return NextResponse.redirect(new URL("/me?login=failed", url.origin));
}
