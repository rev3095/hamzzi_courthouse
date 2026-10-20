# lib/supabase — DB·인증 클라이언트
서버 전용 키는 클라이언트 번들에 넣지 않는다.

| 파일 | 용도 |
|---|---|
| `server.ts` | `createUserClient()` 요청 사용자 권한(RLS 적용) · `createServiceClient()` service_role(RLS 우회 — 검사를 코드에서 직접) |
| `browser.ts` | 브라우저용 anon 클라이언트(소셜 로그인 시작 등) |
| `env.ts` | 환경변수 읽기. 없으면 변수 이름만 알리고 값은 출력하지 않는다 |

환경변수(`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`(없으면 이전 형식 `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`(서버 전용).
