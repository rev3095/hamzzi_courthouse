// GET /api/v1/health — 운영 점검 (OQ-ARC-09 제안). DB·법제처에 닿는지와 지연, Claude 키 유무(무과금 조회)만 알려 준다. 인증 없음.
// 비밀값·오류 문구·본문은 내보내지 않는다. 법제처 확인은 인스턴스마다 5분 캐시해 외부 호출을 늘리지 않는다.
import { checkAiKey, type AiKeyStatus } from "@/lib/ai/key-check";
import { aiMode } from "@/lib/ai/mode";
import { healthOf, probe, type CheckResult } from "@/lib/api/health";
import { withRoute } from "@/lib/api/route";
import { createLawSource } from "@/lib/search/law-source";
import { createServiceClient } from "@/lib/supabase/server";

const LAW_CACHE_MS = 5 * 60_000;
let lawCache: { at: number; result: CheckResult } | null = null;
// 키 점검(무과금 모델 조회)도 인스턴스마다 5분 캐시
let aiKeyCache: { at: number; status: AiKeyStatus } | null = null;

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

async function checkAi(): Promise<AiKeyStatus> {
  if (aiKeyCache && Date.now() - aiKeyCache.at < LAW_CACHE_MS) return aiKeyCache.status;
  const status = await checkAiKey();
  aiKeyCache = { at: Date.now(), status };
  return status;
}

export const GET = withRoute(async () => {
  const [db, lawApi, aiKey] = await Promise.all([checkDb(), checkLawApi(), checkAi()]);
  // ai는 정보용이다 — 무료 모드에서는 키가 없어도 정상이므로 status(200/503)에 넣지 않는다
  const body = { ...healthOf({ db, lawApi }), ai: { mode: aiMode(), key: aiKey } };
  return Response.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
});
