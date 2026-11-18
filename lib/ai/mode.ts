// 분석 모드 스위치 (DEC-015, DEC-032). 답변 모델은 서버 환경변수가 아니라 사용자가 질문마다 고른 단계로 정한다 (lib/ai/models.ts).
// 여기에는 "유료 호출을 아예 끄는" 스위치만 남는다.
// - free : Claude를 부르지 않는다. 예시 질문은 미리 만든 분석 재생, 자유 질문은 법제처 검색 전용 (운영자 비용 0원)
// - paid : 사용자가 고른 단계(Light·Pro·Pro Max)로 답변한다
// free가 되는 경우: AI_MODE=free를 넣었거나, ANTHROPIC_API_KEY가 없을 때(CI·키 없는 개발 환경에서 실수로 과금되지 않게).
// 예전 값 AI_MODE=pro·pro-full은 더 읽지 않는다 (DEC-032로 폐기). 유료 버전 보존: 태그 paid-ai-v1

export type AiMode = "free" | "paid";

export function aiMode(env: Record<string, string | undefined> = process.env): AiMode {
  if (env.AI_MODE?.trim().toLowerCase() === "free") return "free";
  return env.ANTHROPIC_API_KEY?.trim() ? "paid" : "free";
}
