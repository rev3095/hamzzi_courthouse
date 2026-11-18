// 배포 사이트 실답변 비교 (DEC-031, 2026-11-19 Sonnet → Opus 비교용). **유료** — 실행 1번 = 배포 사이트 실제 질문 1건(Claude 답변 1회).
// 절대 규칙 8: 사용자 허락을 받고 1회만 실행한다.
//
// 사용: node --env-file=.env.local scripts/live-compare.mjs <라벨> [사이트 주소]
//   예) node --env-file=.env.local scripts/live-compare.mjs sonnet
//       node --env-file=.env.local scripts/live-compare.mjs opus
// 하는 일: evals/live-compare/question.txt의 질문을 비로그인 새 세션으로 보낸다 → 분석 결과(JSON)를 받는다 →
//   DB에서 그 결과의 모델·토큰·걸린 시간만 읽는다(읽기 전용) → evals/live-compare/<날짜>_<라벨>.json에 저장한다.
// 질문은 예시 질문과 다른 문장이어야 한다(예시는 저장된 답변 재생이라 모델을 부르지 않는다, DEC-027).
// 키·DB 주소는 출력하지 않는다. 질문에는 개인정보를 넣지 않는다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const label = process.argv[2];
const base = (process.argv[3] ?? "https://hamzzi-courthouse.vercel.app").replace(/\/$/, "");
if (!label || !/^[a-z0-9-]+$/.test(label)) {
  console.error("라벨(영문 소문자·숫자·-)을 주세요. 예: sonnet / opus");
  process.exit(2);
}
const DIR = "evals/live-compare";
const question = readFileSync(`${DIR}/question.txt`, "utf8").trim();

// 1단가 ($/1M 토큰, lib/ai/cost.ts·Anthropic 가격표). 생각 토큰은 출력에 들어간다
const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

let cookie = "";
async function call(path, body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", cookie },
    body: JSON.stringify(body ?? {}),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  const jar = new Map(cookie ? cookie.split("; ").map((c) => c.split(/=(.*)/s).slice(0, 2)) : []);
  for (const c of set) {
    const [kv] = c.split(";");
    const [k, v] = kv.split(/=(.*)/s);
    jar.set(k, v);
  }
  cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${json?.error?.code ?? ""}`);
  return json.data;
}

const started = Date.now();
const created = await call("/inquiries", { text: question });
if (created.piiConfirmationRequired)
  await call(`/inquiries/${created.id}/pii-confirmation`, { acceptMasked: true });
// 답변 단계(DEC-036): 라벨로 고른다 — haiku = light, sonnet = pro, opus = max. 그 밖의 라벨은 서버 기본값(Pro)
const tier = { haiku: "light", sonnet: "pro", opus: "max" }[label];
const analyzed = await call(`/inquiries/${created.id}/analyze`, tier ? { tier } : {});
const elapsedMs = Date.now() - started;

// 모델·토큰은 응답에 없어서 DB에서 읽는다 (읽기만, 배포 사이트와 같은 DB)
let meta = null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await db
    .from("analysis_results")
    .select(
      "model, prompt_version, tokens_in, tokens_out, latency_ms, citations_total, citations_removed",
    )
    .eq("id", analyzed.resultId)
    .single();
  meta = data;
}
const price = meta && PRICES[meta.model];
const costUsd = price
  ? Math.round(((meta.tokens_in * price.input + meta.tokens_out * price.output) / 1e6) * 1e5) / 1e5
  : null;

const at = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
mkdirSync(DIR, { recursive: true });
const file = `${DIR}/${at}_${label}.json`;
const out = {
  label,
  at: new Date().toISOString(),
  site: base,
  question,
  inquiryId: created.id,
  resultId: analyzed.resultId,
  elapsedMs,
  meta,
  // 입력·출력 토큰 × 단가 추정(캐시 할인 무시) — 실제 청구는 Console 사용량에서 확인
  costUsdEstimate: costUsd,
  result: analyzed.result,
};
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
const r = analyzed.result;
console.log(
  JSON.stringify(
    {
      file,
      outcome: r.outcome,
      model: meta?.model,
      tokensIn: meta?.tokens_in,
      tokensOut: meta?.tokens_out,
      latencyMs: meta?.latency_ms,
      elapsedMs,
      costUsdEstimate: costUsd,
      points: r.answer?.points?.length ?? 0,
    },
    null,
    2,
  ),
);
