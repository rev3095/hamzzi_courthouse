// Claude API 키 점검 (DEC-019, 운영 점검). 모델 정보 조회(GET /v1/models/{id})만 한다 — 토큰을 쓰지 않아 과금되지 않는다.
// AI_MODE와 무관하게 "배포 서버에 키가 있고 유효한가"만 알려 준다. 키 값·오류 문구는 내보내지 않는다.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { answerModel } from "./models";
import { MODELS } from "./policy";

export type AiKeyStatus = "ok" | "missing" | "invalid" | "error";

export async function checkAiKey(
  env: Record<string, string | undefined> = process.env,
): Promise<AiKeyStatus> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return "missing";
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 5_000, logLevel: "off" });
  try {
    // 라이트 답변 모델(AI_ANSWER_MODEL, DEC-026)과 전체 파이프라인·문서 초안의 Haiku를 이 키로 쓸 수 있는지까지 본다
    for (const id of new Set<string>([answerModel(env).id, MODELS.answer])) {
      await client.models.retrieve(id);
    }
    return "ok";
  } catch (e) {
    if (
      e instanceof Anthropic.AuthenticationError ||
      e instanceof Anthropic.PermissionDeniedError
    ) {
      return "invalid";
    }
    return "error";
  }
}
