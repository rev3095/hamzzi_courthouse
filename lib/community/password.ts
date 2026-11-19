// 비로그인 글·댓글 비밀번호 (DEC-047). scrypt 해시만 저장하고 평문은 어디에도 남기지 않는다(로그·응답·에러 포함).
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 32;
const PREFIX = "s1";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LEN);
  return `${PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** 저장된 해시와 맞는지. 해시가 없거나 모양이 다르면 false */
export function verifyPassword(password: unknown, stored: string | null): boolean {
  if (typeof password !== "string" || !password || !stored) return false;
  const [prefix, salt, key] = stored.split("$");
  if (prefix !== PREFIX || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_LEN) return false;
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), KEY_LEN);
  return timingSafeEqual(actual, expected);
}
