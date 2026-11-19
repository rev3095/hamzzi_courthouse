import "server-only";

import {
  HELPER_WEIGHT,
  periodBudget,
  usdToMicro,
  weeklyBudgetUnits,
  weightToMicro,
} from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
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

/**
 * 유료(Claude) 분석 전체 상한 (DEC-026·036). 주간 금액 하나만 둔다(기본 $80, DEC-031 임시 — 하루 상한 없음).
 * 단계가 섞여도 금액이 맞도록 건수가 아니라 단위($0.0015)로 센다: Light 1 · Pro 20 · Pro Max 100 · 문서 초안·절차 분류 1 (lib/ai/models.ts).
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

/**
 * 기간 예산 정산 (DEC-040): tryAiQuota가 잡아 둔 상한 금액 중 실제로 쓰지 않은 몫을 돌려준다.
 * actualUsd는 그 호출들이 실제로 쓴 Claude 비용(withCostCap의 spentUsd). 주간 규칙일 때는 아무 일도 하지 않는다.
 * 정산이 실패해도 분석 결과를 막지 않는다 — 돌려주지 못한 몫만큼 예산이 덜 남을 뿐 상한을 넘기지는 않는다.
 */
export async function settleAiQuota(
  weight: number,
  actualUsd: number,
  env: Env = process.env,
  now: Date = new Date(),
): Promise<void> {
  const period = periodBudget(now, env);
  if (!period || period.limitMicro === 0) return;
  const spent = Number.isFinite(actualUsd) && actualUsd > 0 ? usdToMicro(actualUsd) : 0;
  const refund = weightToMicro(weight) - spent;
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
