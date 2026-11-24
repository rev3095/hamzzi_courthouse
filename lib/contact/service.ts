import "server-only";

import { ApiError } from "@/lib/api/errors";
import { assertRateLimit, type RateRule } from "@/lib/auth/rate-limit";
import { scanInput } from "@/lib/pii";
import {
  buildContactMail,
  isBotFilled,
  parseContact,
  type ContactInput,
  type ContactResult,
} from "./policy";
import { sendContactMail } from "./send";

// 문의 남기기 (DEC-051). 라우트는 이 함수만 부른다.
// 순서: 횟수 제한 → 형식 검사 → scanInput으로 가림 → 민감정보면 보내지 않음 → 마스킹본만 메일로.
// DB에 저장하지 않는다. 원문 변수는 scanInput 뒤로 쓰지 않는다.

/** 문의: 같은 네트워크 1시간 5회 */
export const CONTACT_RATE: RateRule = { bucket: "contact", limit: 5, windowSeconds: 3600 };

export async function submitContact(headers: Headers, input: ContactInput): Promise<ContactResult> {
  await assertRateLimit(CONTACT_RATE, headers);
  // 자동 입력(봇)은 보낸 것처럼 답하고 아무것도 하지 않는다
  if (isBotFilled(input)) return { status: "sent", maskedCount: 0 };

  const parsed = parseContact(input);
  if ("error" in parsed) {
    const { code, fields, reason } = parsed.error;
    throw new ApiError(code, { fields, reason });
  }
  const { topic, replyTo } = parsed.value;
  const scan = scanInput(parsed.value.body);
  // 건강·범죄경력처럼 민감한 정보로 보이는 문의는 동의 절차가 없으므로 보내지 않고 빼 달라고 안내한다 (F-007 AC2)
  if (scan.sensitive.length > 0) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["body"], reason: "sensitive" });
  }
  const maskedCount = scan.findings.reduce((n, f) => n + f.count, 0);
  const mail = buildContactMail(topic, scan.maskedText, maskedCount, replyTo);
  const outcome = await sendContactMail(mail);
  if (outcome === "sent") return { status: "sent", maskedCount };
  return {
    status: outcome,
    maskedCount,
    fallback: { subject: mail.subject, body: scan.maskedText },
  };
}
