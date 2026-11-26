// 질문 남용 막기 (DEC-072, 절대 규칙 9) — 유료 모델을 부르기 전 서버가 거는 세 겹의 안전장치.
// ① 경고 한도: 경고(지시문 바꾸기·모델 판별 거절)가 같은 네트워크(로그인은 계정)에서 한 창에 ABUSE_STRIKE_RULE.limit번 쌓이면
//    그 창이 끝날 때까지 받지 않는다. 규칙 판별의 법률 무관·반복 거절은 비용이 없어 세지 않는다
// ② 규칙 판별(screenQuestion, 무료): 분명한 법률 무관 요청·같은 글 반복·지시문 바꾸기 → 저장·모델 호출 없이 거절
// ③ 모델 판별: 규칙을 지난 애매한 글은 질문 해석(Haiku)이 off_topic이면 답변 모델 전에 거절 (lib/ai/lite.ts·deep.ts)
// 관리자 모드(DEC-024)는 ①②를 받지 않는다(운영 점검용). 질문 글은 판별에만 쓰고 로그·오류 세부에 넣지 않는다(이유 코드만).
import "server-only";
import { ApiError } from "@/lib/api/errors";
import { assertNotAbuseBlocked, recordAbuseStrike } from "@/lib/auth/rate-limit";
import { countsAsStrike, screenQuestion, type AbuseReason } from "./abuse";
import type { Owner } from "./policy";

const userIdOf = (owner: Owner) => (owner.kind === "user" ? owner.userId : null);

/** 거절 이유 → 오류 */
export function abuseError(reason: AbuseReason | "model"): ApiError {
  return reason === "repetition"
    ? new ApiError("REPETITIVE_INPUT", { reason })
    : new ApiError("OFF_TOPIC", { reason });
}

/** ①② — 질문을 받기 전(POST /inquiries)과 분석 직전(analyze)에 가린 문장으로 부른다. 지시문 바꾸기 거절만 경고로 센다 */
export async function assertQuestionAllowed(text: string, owner: Owner, headers: Headers) {
  if (owner.admin) return;
  await assertNotAbuseBlocked(headers, userIdOf(owner));
  const verdict = screenQuestion(text);
  if (verdict.ok) return;
  if (countsAsStrike(verdict.reason)) await recordAbuseStrike(headers, userIdOf(owner));
  throw abuseError(verdict.reason);
}

/** ③ — 질문 해석이 법률 무관으로 본 질문. 경고를 하나 세고 거절한다 (관리자 모드는 경고를 세지 않는다) */
export async function rejectOffTopic(owner: Owner, headers: Headers): Promise<never> {
  if (!owner.admin) await recordAbuseStrike(headers, userIdOf(owner));
  throw abuseError("model");
}
