// 헬스 체크 규칙 (운영 점검, OQ-ARC-09 제안). DB·법제처 도달 여부와 지연만 — 비밀값·오류 문구·본문은 담지 않는다.

export type CheckResult = { ok: boolean; latencyMs: number; cached?: boolean };
export type Health = {
  status: "ok" | "degraded";
  checks: { db: CheckResult; lawApi: CheckResult };
  version: string;
  time: string;
};

/** 시간 한도 안에 끝나면 true. 예외·시간 초과는 false (오류 내용은 버린다) */
export async function probe(fn: () => Promise<unknown>, timeoutMs: number): Promise<CheckResult> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ok = await Promise.race([
      fn().then(
        (v) => v !== false,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    return { ok, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

export function healthOf(
  checks: Health["checks"],
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): Health {
  return {
    status: checks.db.ok && checks.lawApi.ok ? "ok" : "degraded",
    checks,
    // 커밋 SHA 앞 7자리는 공개 저장소에 있는 값이다 (비밀 아님)
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    time: now.toISOString(),
  };
}
