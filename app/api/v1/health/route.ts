// GET /api/v1/health — 운영 점검 (OQ-ARC-09 제안). DB·법제처에 닿는지와 지연만 알려 준다. 인증 없음.
// 비밀값·오류 문구·본문은 내보내지 않는다. 법제처 확인은 인스턴스마다 5분 캐시해 외부 호출을 늘리지 않는다.
import { healthOf, probe, type CheckResult } from "@/lib/api/health";
import { withRoute } from "@/lib/api/route";
import { createLawSource } from "@/lib/search/law-source";
import { createServiceClient } from "@/lib/supabase/server";

const LAW_CACHE_MS = 5 * 60_000;
let lawCache: { at: number; result: CheckResult } | null = null;

async function checkDb(): Promise<CheckResult> {
  return probe(async () => {
    const { error } = await createServiceClient()
      .from("feature_gates")
      .select("feature_key", { head: true, count: "exact" });
    return !error;
  }, 3_000);
}

async function checkLawApi(): Promise<CheckResult> {
  if (lawCache && Date.now() - lawCache.at < LAW_CACHE_MS)
    return { ...lawCache.result, cached: true };
  const result = await probe(
    async () => (await createLawSource({ timeoutMs: 5_000 }).getArticle("민법", "제1조")) !== null,
    6_000,
  );
  lawCache = { at: Date.now(), result };
  return result;
}

export const GET = withRoute(async () => {
  const [db, lawApi] = await Promise.all([checkDb(), checkLawApi()]);
  const body = healthOf({ db, lawApi });
  return Response.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
});
