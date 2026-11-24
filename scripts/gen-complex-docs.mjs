// 복잡한 예시의 문서 작성 절차·초안 (사용자 요청 2026-11-25). **유료** — 쪽(질문) 1건마다 Opus 5.5(effort high) 1회.
// 절대 규칙 8: 사용자 허락(2026-11-25 "이대로시작")을 받고 실행한다. 결과 파일이 있으면 건너뛰고, 실패해도 재시도하지 않는다.
//
// 입력: evals/examples-complex/questions.json(쪽별 복잡한 상황) + out/<id>.json(검증까지 마친 답변)
// 출력: evals/examples-complex/docs/<id>.json — 절차 단계와 문서 초안. 저장 전에 코드가 거른다:
//   - 조문·사건번호: 그 답변에서 검증을 통과한 근거에 없는 것이 든 문장은 뺀다 (절대 규칙 1)
//   - 숫자: 상황 글이나 검증된 인용 구절에 없는 숫자가 든 문장은 뺀다 — 기한·비용을 모델이 만들지 않게 (절대 규칙 3)
//   - 결과 단정 표현이 든 문장은 뺀다 (절대 규칙 2, lib/ai/policy.ts ASSERTIVE와 같은 규칙)
//
// 사용: node --env-file=../hamzzi_courthouse/.env.local scripts/gen-complex-docs.mjs [한도 USD] [동시 실행 수]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const DIR = "evals/examples-complex";
const OUT = `${DIR}/docs`;
mkdirSync(OUT, { recursive: true });
const budgetUsd = Number.parseFloat(process.argv[2] ?? "30");
const concurrency = Number.parseInt(process.argv[3] ?? "6", 10);
const questions = JSON.parse(readFileSync(`${DIR}/questions.json`, "utf8")).questions;

const ASSERTIVE = [
  /반드시/,
  /무조건/,
  /틀림없/,
  /(100|백)\s*(%|퍼센트|프로)/,
  /확실(히|합니다|하게)/,
  /분명히\s*(이길|승소|처벌|받)/,
  /(승소|패소|처벌|무죄|유죄|구속)(합니다|됩니다|할 것입니다|하게 됩니다|받습니다|받게 됩니다)/,
  /판결합니다/,
];
const norm = (s) => s.normalize("NFKC");
const isAssertive = (s) => ASSERTIVE.some((re) => re.test(norm(s)));
// 사건번호 꼴. '2025년 12월' 같은 날짜는 잡지 않는다
const CASE_NO = /\d{2,4}\s?(?![년월일])[가-힣]{1,4}\s?\d{2,7}/g;
const ARTICLE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
const articleKey = (m) => `제${m[1]}조${m[2] ? `의${m[2]}` : ""}`;
const digitsOf = (s) =>
  norm(s)
    .match(/\d[\d,.]*/g)
    ?.map((d) => d.replace(/[,.]/g, "")) ?? [];

function screener(story, points) {
  const verified = points.filter((p) => p.check === "verified");
  const cases = new Set(
    verified
      .filter((p) => p.source.startsWith("case:"))
      .map((p) => p.source.slice(5).replace(/\s/g, "")),
  );
  const articles = new Set(
    verified
      .filter((p) => p.source.startsWith("law:"))
      .map((p) => p.source.split(":")[2]?.replace(/\s/g, "")),
  );
  const okDigits = new Set([...digitsOf(story), ...verified.flatMap((p) => digitsOf(p.quote))]);
  const dropped = { citation: 0, number: 0, assertive: 0 };
  // 문장 하나를 보고, 지킬 수 없으면 null
  const one = (raw) => {
    const s = raw.trim();
    if (!s) return null;
    if (isAssertive(s)) {
      dropped.assertive++;
      return null;
    }
    const caseHits = [...norm(s).matchAll(CASE_NO)].map((m) => m[0].replace(/\s/g, ""));
    const artHits = [...norm(s).matchAll(ARTICLE)].map(articleKey);
    if (caseHits.some((c) => !cases.has(c)) || artHits.some((a) => !articles.has(a))) {
      dropped.citation++;
      return null;
    }
    // 조문 번호·항·호와 사건번호 속 숫자는 숫자 규칙에서 뺀다
    const rest = norm(s)
      .replace(CASE_NO, " ")
      .replace(ARTICLE, " ")
      .replace(/제\s*\d+\s*[항호목]/g, " ");
    if (digitsOf(rest).some((d) => !okDigits.has(d))) {
      dropped.number++;
      return null;
    }
    return s;
  };
  // 문단은 문장 단위로 거른다
  const para = (p) =>
    p
      .split(/(?<=[.?!다요])\s+(?=\S)/)
      .map(one)
      .filter(Boolean)
      .join(" ");
  return { para, one, dropped };
}

const SYSTEM = `당신은 한국 법률사무소에서 서면 초안과 절차 안내를 쓰는 보조자다. 질문자의 상황과, 법제처에서 찾아 원문 대조까지 마친 근거 문단만 보고 쓴다.
규칙:
- 사람 이름·주소·연락처·계좌·주민번호·사건번호(실제 번호)를 쓰지 않는다. 당사자는 [원고]·[피고]·[고소인]·[피고소인]·[신청인]·[피신청인]·[청구인] 같은 자리표시로, 법원·기관은 "○○지방법원", "○○경찰서", "○○구청"으로 쓴다. 채울 값은 [ ]로 비워 둔다.
- 조문·판례는 <근거> 목록에 있는 것만 쓴다. 목록에 없는 조문·판례·사건번호는 쓰지 않는다.
- 기한(며칠 안에)·비용(인지대·송달료 등)·이자율 숫자는 <근거>의 인용 구절에 그 숫자가 있을 때만 쓴다. 아니면 "법원 안내에서 기한을 확인"처럼 숫자 없이 쓴다. 상황에 나온 사실 숫자(금액·날짜)는 그대로 써도 된다.
- 결과를 확정하지 않는다("반드시", "무조건", "승소합니다", "처벌됩니다" 금지). 승소 가능성·유불리를 평가하지 않는다.
- 문서는 실제로 법원·수사기관·행정청에 낼 수 있는 형식(제목, 당사자, 청구·신청 취지, 원인·이유, 증거 방법, 첨부 서류, 작성일, 제출처)으로 쓰고, 문장은 서면체로.
출력(JSON):
- procedure: 지금부터 밟을 절차 4~8단계. 단계마다 title(짧게), detail(할 일·준비물·확인할 것, 2~4문장), owner(self=혼자 가능 | expert=전문가 권장)
- document: name(문서 이름), basis(따른 공식 서식 이름, 모르면 빈 문자열), sections(문서 순서대로 heading과 paragraphs[문단 배열])
- checklist: 제출 전에 질문자가 직접 확인할 것 3~6개`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["procedure", "document", "checklist"],
  properties: {
    procedure: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "owner"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          owner: { type: "string", enum: ["self", "expert"] },
        },
      },
    },
    document: {
      type: "object",
      additionalProperties: false,
      required: ["name", "basis", "sections"],
      properties: {
        name: { type: "string" },
        basis: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["heading", "paragraphs"],
            properties: {
              heading: { type: "string" },
              paragraphs: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    checklist: { type: "array", items: { type: "string" } },
  },
};

const client = new Anthropic({ maxRetries: 0, timeout: 400_000 });
const PRICE = { input: 4, output: 20 };
let spent = 0;

async function one(q) {
  const file = `${OUT}/${q.id}.json`;
  const ans = `${DIR}/out/${q.id}.json`;
  if (existsSync(file)) return { id: q.id, skipped: true };
  if (!existsSync(ans)) return { id: q.id, skipped: "no-answer" };
  if (spent >= budgetUsd) return { id: q.id, stopped: "budget" };
  const g = JSON.parse(readFileSync(ans, "utf8"));
  const points = g.result?.answer?.points ?? [];
  const verified = points.filter((p) => p.check === "verified");
  if (g.result?.mode !== "ai" || verified.length < 2) return { id: q.id, skipped: "few-points" };
  const story = g.question; // 서버가 가린 상황 글
  const evidence = verified
    .map((p, i) => `${i + 1}. [${p.source}] ${p.text}\n   인용 구절: "${p.quote}"`)
    .join("\n");
  const started = Date.now();
  try {
    const res = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 20_000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<쪽>${q.label}</쪽>\n<쓸_문서>${q.document}</쓸_문서>\n<상황>\n${story}\n</상황>\n<근거>\n${evidence}\n</근거>`,
        },
      ],
    });
    const cost =
      (res.usage.input_tokens * PRICE.input + res.usage.output_tokens * PRICE.output) / 1e6;
    spent += cost;
    const raw = JSON.parse(res.content.find((c) => c.type === "text")?.text ?? "{}");
    const s = screener(story, points);
    const screened = {
      procedure: raw.procedure
        .map((st) => ({ title: s.one(st.title), detail: s.para(st.detail), owner: st.owner }))
        .filter((st) => st.title && st.detail),
      document: {
        name: raw.document.name,
        basis: raw.document.basis,
        sections: raw.document.sections
          .map((sec) => ({
            heading: sec.heading,
            paragraphs: sec.paragraphs.map(s.para).filter(Boolean),
          }))
          .filter((sec) => sec.paragraphs.length),
      },
      checklist: raw.checklist.map(s.one).filter(Boolean),
    };
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          id: q.id,
          ...screened,
          dropped: s.dropped,
          meta: {
            model: res.model,
            in: res.usage.input_tokens,
            out: res.usage.output_tokens,
            costUsd: Math.round(cost * 1e5) / 1e5,
            sec: Math.round((Date.now() - started) / 100) / 10,
          },
        },
        null,
        2,
      )}\n`,
    );
    return {
      id: q.id,
      steps: screened.procedure.length,
      sections: screened.document.sections.length,
      dropped: s.dropped,
      cost: Math.round(cost * 1e4) / 1e4,
    };
  } catch (err) {
    spent += 0.4;
    return {
      id: q.id,
      error: String(err?.status ?? "") + " " + String(err?.message ?? err).slice(0, 120),
    };
  }
}

const queue = [...questions];
const rows = [];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let q = queue.shift(); q; q = queue.shift()) {
      const r = await one(q);
      rows.push(r);
      console.log(JSON.stringify(r));
    }
  }),
);
console.log(JSON.stringify({ done: rows.length, spentUsd: Math.round(spent * 1e4) / 1e4 }));
