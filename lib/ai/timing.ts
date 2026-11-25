// 분석 단계별 시간 재기 (DEC-063). 순수 규칙 — 분석이 이미 내보내는 진행 단계 신호(StepEvent)에 시각만 붙인다.
// 결과의 timing으로 저장돼(analysis_results.response) 속도 보고서·결과 화면이 읽는다. 질문·답변 글은 담지 않는다.

/** 화면·보고서에 쓰는 단계 이름 (고정 문안) */
export const STAGE_LABELS = {
  prepare: "준비 (예산·이어 묻기 맥락)",
  intent: "질문 해석 · 사건 구조화",
  search: "법령·판례 검색",
  agent: "근거 더 찾기",
  answer: "답변 쓰기 (모델 생각 + 출력)",
  verify: "인용 검증 (법제처 재조회)",
  finish: "절차 분류 · 정리",
} as const;
export type TimedStage = keyof typeof STAGE_LABELS;

export type AnalysisTiming = {
  totalMs: number;
  stages: { stage: TimedStage; ms: number }[];
  /** 빠른 답 먼저(DEC-064): 시작부터 요약이 화면으로 나간 때까지. 요약이 없었으면 없다 */
  previewMs?: number;
};

/** 진행 신호의 단계 이름을 보고서 단계로 맞춘다 (같은 일을 하는 다른 이름을 하나로) */
export function timedStage(stage: string): TimedStage | null {
  if (stage === "free_search" || stage === "initial") return "search";
  return Object.hasOwn(STAGE_LABELS, stage) ? (stage as TimedStage) : null;
}

/**
 * 단계 시계. mark(단계)를 부를 때마다 앞 단계가 끝나고 새 단계가 시작한다. 같은 단계가 이어 오면 하나로 본다.
 * done()은 마지막 단계를 닫고, 같은 단계가 여러 번 나왔으면 시간을 더해 처음 나온 순서대로 돌려준다.
 */
export function stageClock(now: () => number = Date.now) {
  const start = now();
  const marks: { stage: TimedStage; at: number }[] = [{ stage: "prepare", at: start }];
  return {
    /** 시작부터 지금까지 ms */
    elapsed: () => Math.max(0, now() - start),
    mark(stage: string) {
      const s = timedStage(stage);
      if (!s || marks[marks.length - 1].stage === s) return;
      marks.push({ stage: s, at: now() });
    },
    done(): AnalysisTiming {
      const end = now();
      const sum = new Map<TimedStage, number>();
      marks.forEach((m, i) => {
        const next = marks[i + 1]?.at ?? end;
        sum.set(m.stage, (sum.get(m.stage) ?? 0) + Math.max(0, next - m.at));
      });
      return {
        totalMs: Math.max(0, end - start),
        stages: [...sum.entries()].map(([stage, ms]) => ({ stage, ms })),
      };
    },
  };
}

/** 저장된 결과를 다시 읽을 때 형식 확인 */
export function parseTiming(v: unknown): AnalysisTiming | null {
  if (!v || typeof v !== "object") return null;
  const t = v as { totalMs?: unknown; stages?: unknown };
  if (typeof t.totalMs !== "number" || !Array.isArray(t.stages)) return null;
  const stages = t.stages.flatMap((s) => {
    const x = s as { stage?: unknown; ms?: unknown };
    const stage = typeof x.stage === "string" ? timedStage(x.stage) : null;
    return stage && typeof x.ms === "number" ? [{ stage, ms: x.ms }] : [];
  });
  return {
    totalMs: t.totalMs,
    stages,
    ...((v as { previewMs?: unknown }).previewMs !== undefined &&
      typeof (v as { previewMs?: unknown }).previewMs === "number" && {
        previewMs: (v as { previewMs: number }).previewMs,
      }),
  };
}
