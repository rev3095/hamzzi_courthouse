// 비로그인 남용 방지용 IP 해시 (DEC-010). 원본 IP는 저장·로그·응답 어디에도 남기지 않는다.
import { createHmac } from "node:crypto";

/** 프록시(Vercel 등)가 넣는 헤더에서 클라이언트 IP. 첫 항목이 원래 클라이언트다 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "";
  return ip || null;
}

/** HMAC-SHA256(IP, salt). salt(ANON_IP_SALT)가 없으면 해시를 만들지 않는다 → IP 상한 미적용 */
export function hashIp(ip: string | null, salt: string | undefined): string | null {
  if (!ip || !salt) return null;
  return createHmac("sha256", salt).update(ip).digest("hex");
}

/**
 * 요청 IP의 솔트 해시 (레이트 리밋·남용 방지 공통). 솔트가 없으면 개발에서는 null(상한 끔),
 * production에서는 오류 — 상한이 조용히 꺼지지 않게 한다 (CLAUDE.md 환경변수 ANON_IP_SALT)
 */
export function requestIpHash(headers: Headers, env = process.env): string | null {
  const salt = env.ANON_IP_SALT;
  if (!salt && env.NODE_ENV === "production") {
    throw new Error("환경변수 ANON_IP_SALT이(가) 없습니다.");
  }
  return hashIp(clientIp(headers), salt);
}
