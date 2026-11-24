// 문의 남기기 순수 규칙 (DEC-051). 서버(service.ts)와 화면(components/about/ContactForm)이 함께 쓴다.
// 본문은 서버에서 scanInput으로 가린 마스킹본만 메일로 보낸다. DB에 저장하지 않고 로그에 남기지 않는다 (절대 규칙 4).

/** 개발자 이메일 (사용자 요청 2026-11-18·2026-11-24). 페이지 HTML을 긁는 봇이 바로 못 읽게 조각으로 두고 쓸 때 합친다 */
const EMAIL_PARTS = ["mimmzy28", "gmail.com"] as const;
export const developerEmail = () => EMAIL_PARTS.join("@");

/** 문의 종류. 값은 메일 제목에만 쓰고 저장하지 않는다 */
export const CONTACT_TOPICS = {
  service: "서비스 이용",
  bug: "오류 신고",
  idea: "기능 제안",
  partner: "협업·제휴",
  other: "기타",
} as const;
export type ContactTopic = keyof typeof CONTACT_TOPICS;

export const CONTACT_LIMITS = {
  /** 본문 최소 글자 수 (공백 제외 아님 — 앞뒤 공백만 뺀다) */
  bodyMin: 10,
  /** 본문 최대 글자 수 */
  bodyMax: 2000,
  /** 답장 받을 이메일 최대 길이 (RFC 5321) */
  replyMax: 254,
} as const;

/** 사이트에서 바로 메일을 보낼 수 있는지 (RESEND_API_KEY). 개인정보처리방침이 외부 발송 업체 고지를 이 값으로 정한다 */
export const contactMailConfigured = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.RESEND_API_KEY?.trim());

/** 문의 화면·응답에 붙이는 안내. 문의는 법률 상담 창구가 아니다 */
export const CONTACT_NOTICE =
  "서비스 문의 창구예요. 사건에 대한 법률 상담은 받지 않아요. 이름·연락처·주소처럼 보이는 내용은 가린 뒤 보내요.";

export type ContactInput = {
  topic?: unknown;
  body?: unknown;
  replyTo?: unknown;
  /** 사람에게는 보이지 않는 칸. 채워져 있으면 자동 입력(봇)으로 보고 보내지 않는다 */
  website?: unknown;
};

export type ContactValue = { topic: ContactTopic; body: string; replyTo: string | null };
export type ContactParseError = {
  code: "EMPTY_INPUT" | "VALIDATION_ERROR";
  fields: string[];
  reason: string;
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export const isContactTopic = (v: unknown): v is ContactTopic =>
  typeof v === "string" && Object.hasOwn(CONTACT_TOPICS, v);

/** 자동 입력 방지 칸이 채워졌는지 */
export const isBotFilled = (input: ContactInput) =>
  typeof input.website === "string" && input.website.trim() !== "";

export function parseContact(
  input: ContactInput,
): { value: ContactValue } | { error: ContactParseError } {
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return { error: { code: "EMPTY_INPUT", fields: ["body"], reason: "empty" } };
  if (body.length < CONTACT_LIMITS.bodyMin)
    return { error: { code: "VALIDATION_ERROR", fields: ["body"], reason: "too_short" } };
  if (body.length > CONTACT_LIMITS.bodyMax)
    return { error: { code: "VALIDATION_ERROR", fields: ["body"], reason: "too_long" } };

  const topic = input.topic === undefined ? "other" : input.topic;
  if (!isContactTopic(topic))
    return { error: { code: "VALIDATION_ERROR", fields: ["topic"], reason: "unknown_topic" } };

  let replyTo: string | null = null;
  if (input.replyTo !== undefined && input.replyTo !== null && input.replyTo !== "") {
    const r = typeof input.replyTo === "string" ? input.replyTo.trim() : "";
    if (!r || r.length > CONTACT_LIMITS.replyMax || !EMAIL_RE.test(r))
      return { error: { code: "VALIDATION_ERROR", fields: ["replyTo"], reason: "invalid_email" } };
    replyTo = r;
  }
  return { value: { topic, body, replyTo } };
}

export type ContactMail = { subject: string; text: string; replyTo: string | null };

/** 메일 본문. 받은 문장은 마스킹본만 넣고, 가린 개수만 적는다(값은 적지 않는다) */
export function buildContactMail(
  topic: ContactTopic,
  maskedBody: string,
  maskedCount: number,
  replyTo: string | null,
): ContactMail {
  const lines = [
    `[햄찌법원 문의] ${CONTACT_TOPICS[topic]}`,
    "",
    maskedBody,
    "",
    "──────────",
    maskedCount > 0
      ? `개인정보로 보이는 부분 ${maskedCount}곳을 가린 뒤 보냈습니다.`
      : "개인정보로 보이는 부분이 없어 그대로 보냈습니다.",
    replyTo
      ? "답장: 이 메일에 답장하면 문의한 분에게 갑니다."
      : "답장 받을 이메일을 적지 않았습니다.",
    "이 문의는 햄찌법원 데이터베이스에 저장하지 않았습니다.",
  ];
  return { subject: `[햄찌법원 문의] ${CONTACT_TOPICS[topic]}`, text: lines.join("\n"), replyTo };
}

/** mailto 주소가 너무 길면 메일 앱이 못 여는 경우가 있어 본문을 자른다 */
export const MAILTO_BODY_MAX = 1500;

/** 메일 앱으로 보내기(키가 없거나 발송 실패 때). 본문은 서버가 가린 마스킹본만 넣는다 */
export function contactMailto(subject: string, maskedBody: string): string {
  const body =
    maskedBody.length > MAILTO_BODY_MAX ? `${maskedBody.slice(0, MAILTO_BODY_MAX)}…` : maskedBody;
  return `mailto:${developerEmail()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** POST /contact 응답 */
export type ContactResult =
  | { status: "sent"; maskedCount: number }
  | {
      status: "not_configured" | "send_failed";
      maskedCount: number;
      /** 메일 앱으로 보낼 때 쓰는 가린 제목·본문 */
      fallback: { subject: string; body: string };
    };
