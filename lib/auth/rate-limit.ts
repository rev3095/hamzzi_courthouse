import "server-only";

import { HELPER_WEIGHT, weeklyBudgetUnits } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";
import { requestIpHash } from "./ip";

// 레이트 리밋 (API.md 1절, DEC-017 제안). 요청 IP의 솔트 해시를 키로 DB 함수 hit_rate_limit가 고정 창으로 센다.
// 비로그인 질문 3회(DEC-010)와는 별개다. 솔트가 없는 개발 환경에서는 세지 않는다.

export type RateRule = { bucket: string; limit: number; windowSeconds: number };

/** 판례 목록 검색: 같은 네트워크 1시간 60회 */
export const SEARCH_RATE: RateRule = { bucket: "search", limit: 60, windowSeconds: 3600 };
/** 판례·조문 상세: 같은 네트워크 1시간 120회 */
export const LOOKUP_RATE: RateRule = { bucket: "lookup", limit: 120, windowSeconds: 3600 };
/** 피드백·기록 삭제: 같은 네트워크 1시간 30회 */
export const WRITE_RATE: RateRule = { bucket: "write", limit: 30, windowSeconds: 3600 };
/** 예시 질문 재생(DEC-027): 하루 3회에 들어가지 않는 대신 같은 네트워크 1시간 30회 — 행이 끝없이 쌓이지 않게 */
export const EXAMPLE_RATE: RateRule = { bucket: "example", limit: 30, windowSeconds: 3600 };
/** 문서 초안 도우미(DEC-023): 같은 네트워크 1시간 10회 (유료 호출이라 따로 센다) */
export const DOC_DRAFT_RATE: RateRule = { bucket: "doc_draft", limit: 10, windowSeconds: 3600 };

/** 로그인 사용자 질문(DEC-035): 계정 하나가 하루(24시간 창) 20회 — 비로그인 하루 한도 대신 받는다 */
export const USER_DAILY_RATE: RateRule = { bucket: "user_daily", limit: 20, windowSeconds: 86_400 };

/**
 * 유료(Claude) 분석 전체 상한 (DEC-026·032). 주간 금액 하나만 둔다(기본 $80, DEC-031 임시 — 하루 상한 없음).
 * 단계가 섞여도 금액이 맞도록 건수가 아니라 단위($0.0015)로 센다: Light 1 · Pro 20 · Pro Max 80 · 문서 초안·절차 분류 1 (lib/ai/models.ts).
 * 주간 창은 date_bin 기준(2000-01-01 토요일 00:00 UTC) → 매주 토요일 09:00 KST에 새로 시작한다.
 * 주간 카운터 행은 파기 배치가 8일 동안 남긴다 (마이그레이션 20261117160154_ai_weekly_quota_retention.sql).
 */
type Env = Record<string, string | undefined>;

export function aiWeeklyRule(env: Env = process.env): RateRule {
  return { bucket: "ai_units", limit: weeklyBudgetUnits(env), windowSeconds: 604_800 };
}

/**
 * 유료 호출 1건을 쓸 수 있는지 (주간 카운터를 weight만큼 올린다). 넘으면 false — 호출한 쪽이 무료 모드로 처리한다.
 * weight는 단계의 가중치(TIERS[tier].weight). 문서 초안·절차 분류는 기본값 1
 */
export async function tryAiQuota(
  weight: number = HELPER_WEIGHT,
  env: Env = process.env,
): Promise<boolean> {
  return tryGlobalQuota(aiWeeklyRule(env), weight);
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

/** 로그인 사용자의 하루 질문 상한 (DEC-035). 카운터 키는 사용자 ID의 해시다 — ID 자체를 남기지 않는다 */
export async function assertUserDaily(userId: string) {
  const key = createHash("sha256").update(`user:${userId}`).digest("hex");
  const { data, error } = await createServiceClient().rpc("hit_rate_limit", {
    p_bucket: USER_DAILY_RATE.bucket,
    p_key: key,
    p_limit: USER_DAILY_RATE.limit,
    p_window: `${USER_DAILY_RATE.windowSeconds} seconds`,
  });
  if (error) throw new Error("hit_rate_limit 실패");
  if (data !== true) {
    throw new ApiError("RATE_LIMITED", { reason: "user_daily", limit: USER_DAILY_RATE.limit });
  }
}
