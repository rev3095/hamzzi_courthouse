// Supabase 환경변수. 값은 에러 메시지·로그에 넣지 않고 변수 이름만 알린다.

export function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`환경변수 ${name}이(가) 없습니다. .env.local을 확인하세요.`);
  return value;
}

// NEXT_PUBLIC_* 는 빌드 시 인라인되므로 process.env.X 형태로 직접 참조해야 한다.
// 공개 키는 새 형식 publishable 키(sb_publishable_)를 쓰고, 없으면 이전 형식 anon JWT를 쓴다. 둘 다 RLS가 적용된다.
export function publicEnv() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}
