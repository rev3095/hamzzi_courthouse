import "server-only";

import { contactMailConfigured, developerEmail, type ContactMail } from "./policy";

// 문의 메일 발송 (DEC-051). Resend HTTP API를 fetch로 직접 부른다 — SDK 의존성 없음.
// 키(RESEND_API_KEY)가 없으면 보내지 않고 "not_configured"를 돌려준다. 화면은 그때 메일 앱 열기로 바꾼다.
// 무료 요금제의 테스트 발신 주소(onboarding@resend.dev)는 Resend 계정을 만든 본인 메일로만 보낼 수 있어,
// 개발자 메일로 Resend에 가입하면 도메인 없이도 쓸 수 있다. 도메인을 연결하면 CONTACT_FROM으로 바꾼다.
// 메일 내용·주소·응답 본문은 로그에 남기지 않는다 (절대 규칙 4). 재시도하지 않는다(중복 발송 방지).

export type SendOutcome = "sent" | "not_configured" | "send_failed";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const RESEND_URL = "https://api.resend.com/emails";
export const DEFAULT_FROM = "햄찌법원 문의 <onboarding@resend.dev>";
const TIMEOUT_MS = 8000;

export async function sendContactMail(
  mail: ContactMail,
  env: Env = process.env,
  fetchImpl: Fetch = fetch,
): Promise<SendOutcome> {
  if (!contactMailConfigured(env)) return "not_configured";
  const key = env.RESEND_API_KEY?.trim() ?? "";
  try {
    const res = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.CONTACT_FROM?.trim() || DEFAULT_FROM,
        to: [developerEmail()],
        subject: mail.subject,
        text: mail.text,
        ...(mail.replyTo && { reply_to: mail.replyTo }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? "sent" : "send_failed";
  } catch {
    return "send_failed";
  }
}
