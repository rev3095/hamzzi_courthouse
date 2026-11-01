import "server-only";

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

/**
 * Pro(Claude) 분석 하루 전체 상한 (DEC-019). 질문 1건 상한 $0.015 × 건수 = 하루 최대 비용.
 * 기본 200건(하루 최대 약 $3). AI_DAILY_LIMIT 환경변수로 바꾼다.
 */
export function aiDailyRule(env: Record<string, string | undefined> = process.env): RateRule {
  const n = Number.parseInt(env.AI_DAILY_LIMIT ?? "", 10);
  return {
    bucket: "ai_daily",
    limit: Number.isFinite(n) && n >= 0 ? n : 200,
    windowSeconds: 86_400,
  };
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
