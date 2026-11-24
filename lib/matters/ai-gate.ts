// 사건 진행 (F-016, DEC-053)의 AI 호출 앞뒤 절차를 한곳에 둔다 (server-only):
// 로그인 사용자별 하루 횟수 → 무료 모드·전체 예산 확인 → 호출 → 실제 쓴 금액으로 정산.
// Claude를 부르는 사건 진행 경로는 모두 이 함수를 거친다 (tryAiQuota 뒤에 settleAiQuota를 빠뜨리지 않게).
import "server-only";
import { aiMode } from "@/lib/ai/mode";
import { MATTER_AI_RATE, assertUserRate, settleAiQuota, tryAiQuota } from "@/lib/auth/rate-limit";
import type { MatterUser } from "./store";

export type AiSkipped = { used: false; reason: "free_mode" | "budget" };

/**
 * weight: 그 호출의 상한 금액을 예산 단위로 바꾼 값. run은 실제 쓴 금액(costUsd)을 함께 돌려준다.
 * 무료 모드이거나 예산이 없으면 run을 부르지 않고 이유만 돌려준다 (오류가 아니다).
 * 관리자 모드는 하루 횟수만 받지 않는다 — 금액 상한과 전체 예산은 그대로 받는다.
 */
export async function runMatterAi<T extends { costUsd: number }>(
  user: MatterUser,
  weight: number,
  run: (spend: (usd: number) => void) => Promise<T>,
): Promise<{ skipped: AiSkipped } | { skipped: null; out: T }> {
  if (!user.admin) await assertUserRate(MATTER_AI_RATE, user.userId);
  if (aiMode() === "free") return { skipped: { used: false, reason: "free_mode" } };
  if (!(await tryAiQuota(weight))) return { skipped: { used: false, reason: "budget" } };
  let spent = 0;
  try {
    // run이 중간에 실패해도 그때까지 쓴 금액은 장부에 남는다
    const out = await run((usd) => {
      spent = Math.max(spent, usd);
    });
    spent = out.costUsd;
    return { skipped: null, out };
  } finally {
    await settleAiQuota(weight, spent);
  }
}
