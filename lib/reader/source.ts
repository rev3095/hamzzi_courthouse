// 판독 경로 고르기 (DEC-048). 인터넷이 없으면 언제나 오프라인 판독(read.ts, 비용 0)이다.
// 온라인 판독(햄찌법원 API로 AI 답변)은 자리만 두고 꺼 둔다 — 켜려면 ONLINE_READER_ENABLED를 바꾸고,
// API가 정한 하루 횟수·금액 상한(lib/inquiries·lib/auth, 서버)과 AI_NOTICE를 그대로 따라야 한다.
// 앱은 이 파일에서 경로만 정하고, 온라인 호출 코드는 켤 때 만든다 (지금 앱에는 네트워크 호출이 없다).

/** 온라인 AI 판독 스위치. 사용자 승인 전까지 false (유료 API, 절대 규칙 8) */
export const ONLINE_READER_ENABLED = false;

/** 온라인 판독이 부를 주소 (켤 때 쓴다). 웹과 같은 분석 API */
export const ONLINE_READER_ENDPOINT = "https://hamzzi-courthouse.vercel.app/api/v1/inquiries";

/** 웹에서 AI 답변을 받을 수 있는 주소 — 온라인일 때 앱이 바깥 브라우저로 연다 */
export const WEB_URL = "https://hamzzi-courthouse.vercel.app";

export type ReaderKind = "offline" | "online";

/** 지금 쓸 판독 경로 */
export function chooseReader(env: { online: boolean }): ReaderKind {
  return ONLINE_READER_ENABLED && env.online ? "online" : "offline";
}
