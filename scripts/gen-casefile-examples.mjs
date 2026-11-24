// 서류 분석 예시 만들기 (F-015, DEC-052). **유료** — 예시 1건마다 서류 판독(Haiku 비전) 1회 + DeepSearch(Haiku 구조화 + Pro Max 답변) 1회.
// 실제 서류 분석과 **같은 길**로 만든다: POST /casefiles/read → composeCaseText → POST /inquiries → analyze { deep: true }.
// 그래서 예시가 곧 서류 분석 흐름 전체의 실호출 점검이다. 절대 규칙 8: 사용자 허락을 받고 실행한다.
//   - 결과 파일(evals/casefile-examples/out/<id>.json)이 이미 있으면 건너뛴다 (다시 실행해도 재과금 없음)
//   - 실패해도 재시도하지 않는다. 연속 2건 실패하면 멈춘다
// 사용: 관리자 모드가 켜진 개발 서버(scripts/gen-server.mjs)를 대상으로 한다.
//   GEN_ADMIN_PASSCODE=<그 서버의 ADMIN_PASSCODE> node --env-file=<.env.local> scripts/gen-casefile-examples.mjs [서버 주소] [id,id]
// 서류 그림은 public/casefile-examples/<id>.png (scripts/render_casefile_examples.py, 직접 쓴 가상 문서). 키·비밀번호는 출력하지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { composeCaseText } from "../lib/casefile/limits.ts";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const passcode =
  process.env.GEN_ADMIN_PASSCODE ?? process.env.ADMIN_PASSCODE ?? process.env.ADMIN_PASSWORD;
if (!passcode) {
  console.error("GEN_ADMIN_PASSCODE가 없습니다.");
  process.exit(2);
}
const DIR = "evals/casefile-examples";
const OUT = `${DIR}/out`;
mkdirSync(OUT, { recursive: true });
const presets = JSON.parse(readFileSync(`${DIR}/questions.json`, "utf8")).questions.filter(
  (q) => !only || only.has(q.id),
);

let cookie = "";
async function call(path, body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", cookie },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(900_000),
  });
  const jar = new Map(cookie ? cookie.split("; ").map((c) => c.split(/=(.*)/s).slice(0, 2)) : []);
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [k, v] = c.split(";")[0].split(/=(.*)/s);
    jar.set(k, v);
  }
  cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error(`${path} → ${res.status} ${json?.error?.code ?? ""}`);
    e.code = json?.error?.code;
    throw e;
  }
  return json.data;
}

await call("/admin/session", { passcode });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

let failures = 0;
for (const p of presets) {
  const file = `${OUT}/${p.id}.json`;
  if (existsSync(file)) {
    console.log(JSON.stringify({ id: p.id, skipped: true }));
    continue;
  }
  if (failures >= 2) {
    console.error("연속 2건 실패 — 멈춥니다.");
    break;
  }
  const started = Date.now();
  try {
    const data = readFileSync(`public/casefile-examples/${p.id}.png`).toString("base64");
    // 1) 서류 판독 — 화면의 동의 두 항목을 받은 것과 같은 요청
    const read = await call("/casefiles/read", {
      images: [{ mediaType: "image/png", data }],
      question: p.question,
      consent: { images: true, sensitive: true },
    });
    if (!read.ai?.used || !read.reading) throw new Error(`판독 실패: ${read.ai?.reason ?? "?"}`);
    const readMs = Date.now() - started;
    // 2) 확인한 개요를 질문 한 건으로 — 화면(CaseFileFlow)이 하는 것과 같은 합치기
    const text = composeCaseText({
      docTypes: read.reading.docTypes,
      summary: read.reading.summary,
      claims: read.reading.claims,
      mySide: p.mySide,
      question: p.question,
    });
    const created = await call("/inquiries", { text, sensitiveConsent: true });
    if (created.piiConfirmationRequired)
      await call(`/inquiries/${created.id}/pii-confirmation`, { acceptMasked: true });
    // 3) DeepSearch 분석 (서류 분석은 언제나 deep) — 모델 답변 호출은 여기 한 번
    const analyzed = await call(`/inquiries/${created.id}/analyze`, { tier: "max", deep: true });
    let meta = null;
    if (db) {
      const { data: row } = await db
        .from("analysis_results")
        .select("model, prompt_version, tokens_in, tokens_out, latency_ms")
        .eq("id", analyzed.resultId)
        .single();
      meta = row;
    }
    const r = analyzed.result;
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          id: p.id,
          at: new Date().toISOString(),
          readMs,
          elapsedMs: Date.now() - started,
          reading: read.reading,
          readDropped: read.dropped ?? 0,
          readPii: (read.piiFindings ?? []).map((f) => f.type),
          question: created.maskedText,
          meta,
          result: r,
        },
        null,
        2,
      )}\n`,
    );
    failures = 0;
    console.log(
      JSON.stringify({
        id: p.id,
        sec: Math.round((Date.now() - started) / 1000),
        chars: created.maskedText.length,
        mode: r.mode,
        deep: Boolean(r.deep),
        points: r.answer?.points?.length ?? 0,
        verified: r.answer?.points?.filter((x) => x.check === "verified").length ?? 0,
        tokensIn: meta?.tokens_in,
        tokensOut: meta?.tokens_out,
      }),
    );
  } catch (e) {
    failures += 1;
    console.log(JSON.stringify({ id: p.id, error: String(e.message) }));
  }
}
