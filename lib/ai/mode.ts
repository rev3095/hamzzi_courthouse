// 분석 모드 스위치 (DEC-015). 기본은 무료 모드 — Claude API를 부르지 않는다.
// - free: 예시 질문은 미리 만든 분석 재생, 자유 질문은 법제처 검색 전용 (운영자 비용 0원)
// - pro : 실제 Claude 분석 (lib/ai 오케스트레이터). Console API 크레딧이 과금되므로 기본으로 꺼 둔다
// 유료 버전 보존·복귀: docs/reports/2026-10-22_유료_AI_버전_보존.md (태그 paid-ai-v1)

export type AiMode = "free" | "pro";

/** AI_MODE=pro를 명시했을 때만 pro. 그 밖의 값·미설정은 모두 free */
export function aiMode(env: Record<string, string | undefined> = process.env): AiMode {
  return env.AI_MODE?.trim().toLowerCase() === "pro" ? "pro" : "free";
}
