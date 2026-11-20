// 판독 경로 고르기 (DEC-048·049). 인터넷이 없으면 언제나 오프라인 판독(read.ts, 비용 0)이다.
// 온라인 판독(햄찌법원 API로 AI 답변)은 2026-11-20 사용자 지시로 켰다(DEC-049). 호출 코드는 mobile/src/api.ts이고,
// API가 정한 하루 횟수·금액 상한(lib/inquiries·lib/auth, 서버)과 AI_NOTICE를 그대로 따른다.
// 서버에 닿지 않으면 앱은 규칙 판독과 검증된 예시로 동작한다.

/** 온라인 AI 판독 스위치 (DEC-049). 끄면 앱은 규칙 판독만 쓴다 */
export const ONLINE_READER_ENABLED = true;

/** 온라인 판독이 부를 주소 (켤 때 쓴다). 웹과 같은 분석 API */
export const ONLINE_READER_ENDPOINT = "https://hamzzi-courthouse.vercel.app/api/v1/inquiries";

/** 웹에서 AI 답변을 받을 수 있는 주소 — 온라인일 때 앱이 바깥 브라우저로 연다 */
export const WEB_URL = "https://hamzzi-courthouse.vercel.app";

export type ReaderKind = "offline" | "online";

/** 지금 쓸 판독 경로 */
export function chooseReader(env: { online: boolean }): ReaderKind {
  return ONLINE_READER_ENABLED && env.online ? "online" : "offline";
}
