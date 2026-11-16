// 분석 모드 스위치 (DEC-015, DEC-019·020). 기본은 무료 모드 — Claude API를 부르지 않는다.
// - free     : 예시 질문은 미리 만든 분석 재생, 자유 질문은 법제처 검색 전용 (운영자 비용 0원)
// - pro      : 라이트 Haiku 답변 (DEC-020) — 무료 검색 + Haiku 답변 1회, 질문 1건 $0.0015 상한
// - pro-full : 전체 Haiku 파이프라인 (의도·재검색·답변, DEC-019) — 질문 1건 $0.015 상한. 명시해야만 켜진다
// 유료 버전 보존·복귀: docs/reports/2026-10-22_유료_AI_버전_보존.md (태그 paid-ai-v1)

export type AiMode = "free" | "pro" | "pro-full";

/** AI_MODE=pro·pro-full을 명시했을 때만 유료. 그 밖의 값·미설정은 모두 free */
export function aiMode(env: Record<string, string | undefined> = process.env): AiMode {
  const v = env.AI_MODE?.trim().toLowerCase();
  return v === "pro" || v === "pro-full" ? v : "free";
}
