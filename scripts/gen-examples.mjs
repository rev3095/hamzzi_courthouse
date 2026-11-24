// 예시 답변 만들기 (DEC-027·036). **유료** — 질문 1건마다 Pro Max(Opus 5.5, effort medium) 답변 1회 + 질문 해석(Haiku) 1회.
// 절대 규칙 8: 사용자 허락을 받고 실행한다. 같은 질문을 두 번 부르지 않는다:
//   - 결과 파일(evals/examples-gen/out/<id>.json)이 이미 있으면 건너뛴다 (다시 실행해도 재과금 없음)
//   - 실패해도 재시도하지 않는다. 연속 3건 실패하거나 누적 추정 비용이 한도를 넘으면 멈춘다
//   - 인용 검증(원문 대조·실존 확인)은 법제처 무료 조회라 Claude 비용이 들지 않는다
//
// 사용: 관리자 모드가 켜진 서버(비로그인 하루 한도를 받지 않게)를 대상으로 한다.
//   GEN_ADMIN_PASSCODE=<그 서버의 ADMIN_PASSCODE> node --env-file=.env.local scripts/gen-examples.mjs [서버 주소] [한도 USD]
//   예) node --env-file=.env.local scripts/gen-examples.mjs http://localhost:3100 6
// 질문은 evals/examples-gen/questions.json (직접 작성한 가상 사연, 개인정보 없음). 키·비밀번호는 출력하지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const base = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const budgetUsd = Number.parseFloat(process.argv[3] ?? "6");
const passcode =
  process.env.GEN_ADMIN_PASSCODE ?? process.env.ADMIN_PASSCODE ?? process.env.ADMIN_PASSWORD;
if (!passcode) {
  console.error("GEN_ADMIN_PASSCODE가 없습니다.");
  process.exit(2);
}
// GEN_DIR로 질문·결과 폴더를 바꿀 수 있다 (예: 측정용 evals/labels/measure)
const DIR = process.env.GEN_DIR ?? "evals/examples-gen";
const OUT = `${DIR}/out`;
mkdirSync(OUT, { recursive: true });
// 넷째 인자: 쉼표로 나눈 id 목록 (주면 그 질문만 실행한다)
const only = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
const questions = JSON.parse(readFileSync(`${DIR}/questions.json`, "utf8")).questions.filter(
  (q) => !only || only.has(q.id),
);

// 상한 쪽으로 어림한다: 토큰 전부를 Opus 단가로 친다 (실제로는 일부가 Haiku 질문 해석이라 더 싸다)
const OPUS = { input: 4, output: 20 };
const costOf = (m) => (m ? (m.tokens_in * OPUS.input + m.tokens_out * OPUS.output) / 1e6 : 0.3);

// 쿠키는 실행 줄(worker)마다 따로 둔다. 같이 쓰면 동시에 받은 익명 세션 쿠키가 서로 덮어써 질문 주인과 분석 요청자가 달라진다(403)
const shared = { cookie: "" };
async function call(path, body, state = shared) {
  const { cookie } = state;
  const res = await fetch(`${base}/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", cookie },
    body: JSON.stringify(body ?? {}),
  });
  const jar = new Map(cookie ? cookie.split("; ").map((c) => c.split(/=(.*)/s).slice(0, 2)) : []);
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [k, v] = c.split(";")[0].split(/=(.*)/s);
    jar.set(k, v);
  }
  state.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
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

let spent = 0;
let failures = 0;
const rows = [];
async function runOne(q, state) {
  const file = `${OUT}/${q.id}.json`;
  if (existsSync(file)) {
    rows.push({ id: q.id, skipped: true });
    return;
  }
  if (spent >= budgetUsd) {
    console.error(`누적 추정 비용 $${spent.toFixed(3)}가 한도 $${budgetUsd}에 닿아 멈춥니다.`);
    return;
  }
  if (failures >= 3) {
    console.error("연속 3건 실패 — 멈춥니다.");
    return;
  }
  const started = Date.now();
  try {
    let created;
    try {
      created = await call("/inquiries", { text: q.text }, state);
    } catch (e) {
      // 건강 같은 민감정보 낱말이 든 가상 사연: 직접 쓴 글이라 동의하고 다시 보낸다 (모델 호출 전 단계)
      if (e.code !== "CONSENT_REQUIRED") throw e;
      created = await call("/inquiries", { text: q.text, sensitiveConsent: true }, state);
    }
    if (created.piiConfirmationRequired)
      await call(`/inquiries/${created.id}/pii-confirmation`, { acceptMasked: true }, state);
    // 모델 호출은 여기 한 번뿐이다
    const analyzed = await call(
      `/inquiries/${created.id}/analyze`,
      {
        // 기본은 Pro Max. 질문에 tier가 있으면 그 단계로 (비교 측정용)
        tier: q.tier ?? "max",
        category: q.category,
        // DeepSearch(DEC-041) 예시는 구조화 + 쟁점별 답변으로 분석한다 (상한 2배)
        ...(q.deep && { deep: true }),
      },
      state,
    );
    let meta = null;
    if (db) {
      const { data } = await db
        .from("analysis_results")
        .select("model, prompt_version, tokens_in, tokens_out, latency_ms")
        .eq("id", analyzed.resultId)
        .single();
      meta = data;
    }
    const cost = costOf(meta);
    spent += cost;
    failures = 0;
    const r = analyzed.result;
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          id: q.id,
          category: q.category,
          question: created.maskedText,
          at: new Date().toISOString(),
          elapsedMs: Date.now() - started,
          meta,
          costUsdUpperEstimate: Math.round(cost * 1e5) / 1e5,
          result: r,
        },
        null,
        2,
      )}\n`,
    );
    rows.push({
      id: q.id,
      model: meta?.model,
      in: meta?.tokens_in,
      out: meta?.tokens_out,
      sec: Math.round((Date.now() - started) / 100) / 10,
      cost: Math.round(cost * 1e4) / 1e4,
      points: r.answer?.points?.length ?? 0,
      verified: r.answer?.points?.filter((p) => p.check === "verified").length ?? 0,
      mode: r.mode,
    });
  } catch (e) {
    failures += 1;
    // 분석 단계에서 실패했다면 과금됐을 수 있어 상한만큼 쓴 것으로 친다
    spent += 0.3;
    rows.push({ id: q.id, error: String(e.message) });
  }
  console.log(JSON.stringify(rows.at(-1)));
}
// GEN_CONCURRENCY로 동시에 돌릴 수를 정한다 (기본 1). 같은 질문은 한 번만 부른다
const queue = [...questions];
const workers = Number.parseInt(process.env.GEN_CONCURRENCY ?? "1", 10);
await Promise.all(
  Array.from({ length: workers }, async () => {
    const state = { cookie: shared.cookie };
    for (let q = queue.shift(); q; q = queue.shift()) await runOne(q, state);
  }),
);
console.log(
  JSON.stringify({ done: rows.length, spentUpperEstimateUsd: Math.round(spent * 1e4) / 1e4 }),
);
