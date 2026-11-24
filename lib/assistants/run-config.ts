// 분야별 비서 한 질문의 라이트 답변 설정 (F-018, DEC-057). analyze와 실호출 기능 테스트가 같은 값을 쓰게 한 곳에 둔다.
import { ASSISTANTS, ASSISTANT_ANSWER_TIER, type AssistantId } from "./agents";
import { pinnedPrecedents } from "./cases";
import { talkSystem } from "./talk";

/** 지시문·프롬프트 버전 꼬리표. 지시문·대화 규칙을 바꾸면 올린다 */
export const ASSISTANT_PROMPT_REV = "v3";

export function assistantLiteOptions(id: AssistantId, maskedText: string) {
  const a = ASSISTANTS[id];
  return {
    tier: ASSISTANT_ANSWER_TIER,
    caseHint: a.caseHint,
    lawHints: a.lawHints,
    assistant: {
      persona: a.persona,
      // 질문 낱말에 맞는 사례 판례 — 그 요청에서 법제처로 다시 가져온다
      pinnedCaseIds: pinnedPrecedents(id, maskedText).map((c) => c.precId),
      promptTag: `assistant-${id}-${ASSISTANT_PROMPT_REV}`,
      talkSystem: talkSystem(a),
    },
  };
}
