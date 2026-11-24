// 마이페이지 프로필 (DEC-056) — Google 로그인 때 인증 서비스가 받아 둔 이름·프로필 사진 주소를 본인 화면용으로 고른다.
// 순수 규칙이다. 새로 저장하지 않고(이미 Supabase Auth user_metadata에 있다), 본인 요청에만 돌려주며 로그·에러에 남기지 않는다.
// 이메일은 돌려주지 않는다. 사진 주소는 Google 프로필 사진 호스트의 https 주소만 받는다(그 밖의 주소는 화면이 기본 아이콘).

export const PROFILE_NAME_CHARS = 40;

export type MyProfile = {
  /** Google 계정 이름. 없으면 null — 화면은 "회원님"으로 부른다 */
  name: string | null;
  /** Google 프로필 사진 주소. 없거나 허용하지 않는 주소면 null */
  avatarUrl: string | null;
};

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** 이름: 제어 문자·꺾쇠를 빼고 공백을 줄여 길이를 맞춘다 */
export function profileName(meta: Record<string, unknown>): string | null {
  const raw = text(meta.full_name) || text(meta.name);
  const t = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return t.length > PROFILE_NAME_CHARS ? `${t.slice(0, PROFILE_NAME_CHARS - 1)}…` : t;
}

/** 사진: googleusercontent.com의 https 주소만 */
export function profileAvatar(meta: Record<string, unknown>): string | null {
  const raw = text(meta.avatar_url) || text(meta.picture);
  if (!raw || raw.length > 1_000) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (!/(^|\.)googleusercontent\.com$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** 인증 서비스의 user_metadata(모양을 믿지 않는다)를 화면용으로 */
export function profileView(meta: unknown): MyProfile {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  return { name: profileName(m), avatarUrl: profileAvatar(m) };
}

/** "{이름}님, 안녕하세요" — 이름이 없으면 "회원님, 안녕하세요" */
export const greeting = (name: string | null) => `${name ?? "회원"}님, 안녕하세요`;
