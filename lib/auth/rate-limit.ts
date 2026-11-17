import "server-only";

import { dailyAiLimit, weeklyAiLimit } from "@/lib/ai/models";
import { ApiError } from "@/lib/api/errors";
import { createServiceClient } from "@/lib/supabase/server";
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
/** 문서 초안 도우미(DEC-023): 같은 네트워크 1시간 10회 (유료 호출이라 따로 센다) */
export const DOC_DRAFT_RATE: RateRule = { bucket: "doc_draft", limit: 10, windowSeconds: 3600 };

/**
 * 유료(Claude) 분석 전체 상한 (DEC-019·020·026). 질문 1건 상한 × 건수 = 그 기간 최대 비용 — lib/ai/models.ts.
 * 하루 $5(라이트 Sonnet 166건)와 주간 $21(700건). 분석과 문서 초안을 함께 센다.
 * 주간 창은 date_bin 기준(2000-01-01 토요일 00:00 UTC) → 매주 토요일 09:00 KST에 새로 시작한다.
 * 주간 카운터 행은 파기 배치가 8일 동안 남긴다 (마이그레이션 20261117160154_ai_weekly_quota_retention.sql).
 */
type Env = Record<string, string | undefined>;

export function aiDailyRule(env: Env = process.env): RateRule {
  return { bucket: "ai_daily", limit: dailyAiLimit(env), windowSeconds: 86_400 };
}

export function aiWeeklyRule(env: Env = process.env): RateRule {
  return { bucket: "ai_weekly", limit: weeklyAiLimit(env), windowSeconds: 604_800 };
}

/**
 * 유료 호출 1건을 쓸 수 있는지. 주간 → 하루 순서로 센다. 하나라도 넘으면 false (호출한 쪽이 무료 모드로 처리).
 * 주간은 통과했는데 하루에 막히면 주간이 1 더 세지지만, 덜 쓰는 쪽으로만 틀린다.
 */
export async function tryAiQuota(env: Env = process.env): Promise<boolean> {
  return (await tryGlobalQuota(aiWeeklyRule(env))) && (await tryGlobalQuota(aiDailyRule(env)));
}

/** 사이트 전체 카운터를 1 올리고, 상한 안이면 true. 넘으면 false (호출한 쪽이 무료 모드로 처리한다) */
export async function tryGlobalQuota(rule: RateRule): Promise<boolean> {
  if (rule.limit === 0) return false;
  const { data, error } = await createServiceClient().rpc("hit_rate_limit", {
    p_bucket: rule.bucket,
    p_key: "global",
    p_limit: rule.limit,
    p_window: `${rule.windowSeconds} seconds`,
  });
  if (error) throw new Error("hit_rate_limit 실패");
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
