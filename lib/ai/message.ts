// 모델에 넘기는 사용자 메시지 조립 (순수 함수). 질문·맥락·첨부 자료는 모두 마스킹본이다.
import type { MaterialReading } from "@/lib/materials/limits";
import { materialsBlock } from "@/lib/materials/policy";
import { recentContext, type FollowupTurn } from "./policy";

/**
 * 이전 대화(최근 3개)는 맥락으로만, 이번 질문은 따로 표시한다 (F-002 AC3).
 * 첨부 자료(F-017, DEC-058)가 있으면 질문 뒤에 "사용자 자료이며 근거가 아님"을 밝힌 묶음으로 붙인다.
 */
export function userMessage(
  maskedText: string,
  context: FollowupTurn[],
  materials: MaterialReading[] = [],
): string {
  const turns = recentContext(context);
  const history = turns.length
    ? `<이전_대화>\n${turns
        .map((t, i) => `[${i + 1}] 질문: ${t.question}\n[${i + 1}] 답변 요약: ${t.answer}`)
        .join("\n")}\n</이전_대화>\n\n`
    : "";
  const attached = materialsBlock(materials);
  return `${history}<질문>\n${maskedText}\n</질문>${attached ? `\n\n${attached}` : ""}`;
}
