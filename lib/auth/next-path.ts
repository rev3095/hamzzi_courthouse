// 로그인 뒤 돌아갈 주소 (DEC-033). 사이트 안 경로만 받아 외부 주소로 튕기는 열린 리다이렉트를 막는다. 브라우저·서버 공용 순수 함수
const FALLBACK = "/me";

/** "/"로 시작하는 사이트 안 경로만 돌려준다. "//"·"/\"·제어 문자·로그인 콜백 자신은 FALLBACK */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next.length > 512) return FALLBACK;
  if (!next.startsWith("/") || next.startsWith("//")) return FALLBACK;
  // 역슬래시("/\evil.com")·제어 문자는 브라우저가 다른 호스트로 읽을 수 있어 막는다
  if (/[\u0000-\u001f\\]/.test(next)) return FALLBACK;
  if (next.startsWith("/auth/")) return FALLBACK;
  return next;
}
