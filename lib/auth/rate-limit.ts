import "server-only";

import {
  HELPER_WEIGHT,
  periodBudget,
  usdToMicro,
  weeklyBudgetUnits,
  weightToMicro,
} from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { hashUserId } from "@/lib/api/log";
import { createServiceClient } from "@/lib/supabase/server";
import { requestIpHash } from "./ip";

// 레이트 리밋 (API.md 1절, DEC-017 제안). 요청 IP의 솔트 해시를 키로 DB 함수 hit_rate_limit가 고정 창으로 센다.
// 비로그인 하루 질문 횟수(DEC-010)와는 별개다. 솔트가 없는 개발 환경에서는 세지 않는다.

export type RateRule = { bucket: string; limit: number; windowSeconds: number };

/** 판례 목록 검색: 같은 네트워크 1시간 60회 */
export const SEARCH_RATE: RateRule = { bucket: "search", limit: 60, windowSeconds: 3600 };
/** 판례·조문 상세: 같은 네트워크 1시간 120회 */
export const LOOKUP_RATE: RateRule = { bucket: "lookup", limit: 120, windowSeconds: 3600 };
/** 피드백·기록 삭제: 같은 네트워크 1시간 30회 */
export const WRITE_RATE: RateRule = { bucket: "write", limit: 30, windowSeconds: 3600 };
/** 예시 질문 재생(DEC-027): 하루 횟수에 들어가지 않는 대신 같은 네트워크 1시간 30회 — 행이 끝없이 쌓이지 않게 */
export const EXAMPLE_RATE: RateRule = { bucket: "example", limit: 30, windowSeconds: 3600 };
/** 문서 초안 도우미(DEC-023): 같은 네트워크 1시간 10회 (유료 호출이라 따로 센다) */
export const DOC_DRAFT_RATE: RateRule = { bucket: "doc_draft", limit: 10, windowSeconds: 3600 };
/** 서류 판독(F-015, DEC-052): 같은 네트워크 1시간 10회 (유료 호출이고 질문 횟수는 분석 때 세므로 따로 막는다) */
export const CASEFILE_RATE: RateRule = { bucket: "casefile", limit: 10, windowSeconds: 3600 };
/** 법인·사업자 공개 정보 조회(F-015): 같은 네트워크 1시간 30회 (외부 공식 API 호출) */
export const BUSINESS_RATE: RateRule = { bucket: "business", limit: 30, windowSeconds: 3600 };

/** 사건 진행(F-016, DEC-053)의 AI 기능: 로그인 사용자 한 사람이 하루(24시간 창) 30회 — 임시값 */
export const MATTER_AI_RATE: RateRule = { bucket: "matter_ai", limit: 30, windowSeconds: 86_400 };
/** 사건 자동 정리(DEC-070, Haiku): 자료가 바뀔 때마다 불러도 된다는 사용자 결정이라 따로 넉넉히 — 로그인 사용자 하루 120회 (임시값) */
/**
 * 로그인 사용자의 서류 판독 하루 횟수 (DEC-070 ③): 홈에서 올린 사건 서류는 판독 뒤 사건 진행으로 가 질문 횟수가 차감되지 않으므로
 * 판독 자체를 사용자별로 센다 — 하루 질문 한도(USER_QUESTION_LIMIT)와 같은 30회 (임시값)
 */
export const CASEFILE_USER_RATE: RateRule = {
  bucket: "casefile_user",
  limit: 30,
  windowSeconds: 86_400,
};
export const MATTER_AUTO_RATE: RateRule = {
  bucket: "matter_auto",
  limit: 120,
  windowSeconds: 86_400,
};

/**
 * 유료(Claude) 분석 전체 상한 (DEC-026·036). 주간 금액 하나만 둔다(기본 $80, DEC-031 임시 — 하루 상한 없음).
 * 단계가 섞여도 금액이 맞도록 건수가 아니라 단위($0.0015)로 센다: Light 2 · Pro 20 · Pro Max 100 · 문서 초안·절차 분류 1 (lib/ai/models.ts, 가중치 = 상한 ÷ 단위 올림).
 * 주간 창은 date_bin 기준(2000-01-01 토요일 00:00 UTC) → 매주 토요일 09:00 KST에 새로 시작한다.
 * 주간 카운터 행은 파기 배치가 8일 동안 남긴다 (마이그레이션 20261117160154_ai_weekly_quota_retention.sql).
 *
 * 기간 예산 (DEC-040): 2026-11-25까지는 주간 창 대신 기간 하나($95)로 세고 실제로 쓴 금액만 차감한다.
 * 호출 전에 그 호출의 상한(가중치 × $0.0015)을 먼저 잡아 두고(`reserve_ai_budget`), 답변 뒤 `settleAiQuota`가
 * 실제 비용과의 차액을 돌려준다(`settle_ai_budget`). 먼저 잡아 두므로 합계가 상한을 넘는 호출은 나가지 않는다.
 */
type Env = Record<string, string | undefined>;

export function aiWeeklyRule(env: Env = process.env): RateRule {
  return { bucket: "ai_units", limit: weeklyBudgetUnits(env), windowSeconds: 604_800 };
}

/**
 * 유료 호출 1건을 쓸 수 있는지. 넘으면 false — 호출한 쪽이 무료 모드로 처리한다.
 * weight는 단계의 가중치(TIERS[tier].weight). 문서 초안·절차 분류는 기본값 1.
 * 기간 예산 중(DEC-040)에는 그 호출의 상한 금액을 먼저 잡아 둔다 — 호출이 끝나면 settleAiQuota로 정산한다.
 * 그 밖에는 주간 카운터를 weight만큼 올린다.
 */
export async function tryAiQuota(
  weight: number = HELPER_WEIGHT,
  env: Env = process.env,
  now: Date = new Date(),
): Promise<boolean> {
  const period = periodBudget(now, env);
  if (!period) return tryGlobalQuota(aiWeeklyRule(env), weight);
  if (period.limitMicro === 0) return false;
  const { data, error } = await createServiceClient().rpc("reserve_ai_budget", {
    p_bucket: period.bucket,
    p_start: period.startsAt,
    p_limit: period.limitMicro,
    p_amount: weightToMicro(weight),
  });
  if (error) throw new Error("reserve_ai_budget 실패");
  return data === true;
}

/** DB 함수 reserve_ai_budget의 한도 인자 최댓값(int). 이미 쓴 초과분을 상한 검사 없이 더할 때 쓴다 */
const PG_INT_MAX = 2_147_483_647;

/**
 * 기간 예산 정산 (DEC-040): tryAiQuota가 잡아 둔 상한 금액 중 실제로 쓰지 않은 몫을 돌려준다.
 * actualUsd는 그 호출들이 실제로 쓴 Claude 비용(withCostCap의 spentUsd, 웹 검색 요금 포함).
 * 실제 비용이 잡아 둔 금액보다 크면(도구가 가져온 글처럼 호출 전에 셀 수 없는 입력 — 기업 조사) 넘은 몫을 더 차감한다.
 * 이미 쓴 돈이라 상한 검사 없이 더한다(reserve_ai_budget에 한도 최댓값) — 그 뒤 호출은 남은 예산이 줄어든 만큼 막힌다.
 * 주간 규칙일 때는 넘은 몫을 단위로 바꿔 주간 카운터에 더한다(상한을 넘으면 더해지지 않을 수 있다 — 그때 주는 이미 다 쓴 것이다).
 * 정산이 실패해도 분석 결과를 막지 않는다.
 */
export async function settleAiQuota(
  weight: number,
  actualUsd: number,
  env: Env = process.env,
  now: Date = new Date(),
): Promise<void> {
  const period = periodBudget(now, env);
  const spent = Number.isFinite(actualUsd) && actualUsd > 0 ? usdToMicro(actualUsd) : 0;
  const refund = weightToMicro(weight) - spent;
  if (!period) {
    const over = Math.ceil(-refund / weightToMicro(1) - 1e-9);
    if (over >= 1) await tryGlobalQuota(aiWeeklyRule(env), over).catch(() => false);
    return;
  }
  if (period.limitMicro === 0) return;
  if (refund < 0) {
    try {
      await createServiceClient().rpc("reserve_ai_budget", {
        p_bucket: period.bucket,
        p_start: period.startsAt,
        p_limit: PG_INT_MAX,
        p_amount: -refund,
      });
    } catch {
      // 더하지 못해도 계속한다
    }
    return;
  }
  if (refund < 1) return;
  try {
    await createServiceClient().rpc("settle_ai_budget", {
      p_bucket: period.bucket,
      p_start: period.startsAt,
      p_refund: refund,
    });
  } catch {
    // 돌려주지 못해도 계속한다
  }
}

/** 사이트 전체 카운터를 weight만큼 올리고, 상한 안이면 true. 넘으면 false (호출한 쪽이 무료 모드로 처리한다) */
export async function tryGlobalQuota(rule: RateRule, weight = 1): Promise<boolean> {
  if (rule.limit === 0) return false;
  const { data, error } = await createServiceClient().rpc("hit_rate_limit_weighted", {
    p_bucket: rule.bucket,
    p_key: "global",
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
    p_weight: weight,
  });
  if (error) throw new Error("hit_rate_limit_weighted 실패");
  return data === true;
}

/** 로그인 사용자별 횟수 제한. 키는 계정 번호를 바꾼 값(해시)이라 카운터에 계정 번호가 남지 않는다 */
export async function assertUserRate(rule: RateRule, userId: string) {
  const { data, error } = await createServiceClient().rpc("hit_rate_limit", {
    p_bucket: rule.bucket,
    p_key: `u:${hashUserId(userId)}`,
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
  });
  if (error) throw new Error("hit_rate_limit 실패");
  if (data !== true) {
    throw new ApiError("RATE_LIMITED", { reason: `${rule.bucket}_daily`, limit: rule.limit });
  }
}

export async function assertRateLimit(rule: RateRule, headers: Headers) {
  const key = requestIpHash(headers);
  if (!key) return;
  const { data, error } = await createServiceClient().rpc("hit_rate_limit", {
    p_bucket: rule.bucket,
    p_key: key,
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
  });
  if (error) throw new Error("hit_rate_limit 실패");
  if (data !== true) {
    throw new ApiError("RATE_LIMITED", { reason: `${rule.bucket}_hourly`, limit: rule.limit });
  }
}
