// 복잡한 예시 사연 쓰기 (사용자 요청 2026-11-25). **유료** — 예시 1건마다 Opus 5.5(effort high) 1회.
// 절대 규칙 8: 사용자 허락(2026-11-25 "이대로시작")을 받고 실행한다. 결과 파일이 있으면 건너뛰고, 실패해도 재시도하지 않는다.
//
// 기존 예시 질문(lib/demo/examples.json)마다 같은 분야·쟁점으로
//   - 화면에 보일 짧은 요약 질문(지금 예시처럼 간단한 문장)과
//   - 답변에 쓸 복잡한 상황(300자 이상: 날짜 흐름·받은 서류·증거·상대방 주장·원하는 문서)을
// 쪽(민사 원고/피고, 형사 고소인/피의자, 신청형은 신청인 한쪽)별로 쓴다. 사람 이름·연락처·주소·계좌는 쓰지 않고 역할로만 부른다.
//
// 사용: node --env-file=../hamzzi_courthouse/.env.local scripts/gen-complex-scenarios.mjs [한도 USD] [동시 실행 수]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const budgetUsd = Number.parseFloat(process.argv[2] ?? "12");
const concurrency = Number.parseInt(process.argv[3] ?? "6", 10);
const OUT = "evals/examples-complex/scenarios";
mkdirSync(OUT, { recursive: true });

// 함정 예시(정확한 숫자·막연한 질문을 막는지 보는 용도)는 그대로 둔다
const KEEP = new Set(["trap-number", "trap-vague"]);
// 상대방이 행정청이거나 신청만 하는 절차, 또는 피해자 보호가 중심인 사건은 한쪽만 쓴다
const SINGLE = new Set([
  "admin-appeal-01",
  "fine-objection-01",
  "tax-appeal-01",
  "welfare-appeal-01",
  "business-permit-01",
  "registration-01",
  "military-discharge-01",
  "military-abuse-01",
  "debt-relief-01",
  "inheritance-01",
  "sex-crime-01",
  "domestic-violence-01",
  "stalking-01",
]);

const examples = JSON.parse(readFileSync("lib/demo/examples.json", "utf8")).examples.filter(
  (e) => !KEEP.has(e.id),
);

const SYSTEM = `당신은 한국 법률 상담 서비스의 예시 사연을 쓰는 작가다. 실제 사람이 아니라 직접 지어낸 가상 사연을 쓴다.
규칙:
- 사람 이름·회사 실명·연락처·주소·지번·계좌번호·주민번호·사건번호·차량번호를 쓰지 않는다. 사람은 역할로 부른다(집주인, 친구 A, 상대 운전자, 팀장, 대표 등). 회사는 "회사 A", "쇼핑몰 B"처럼 쓴다. 지역은 "○○시"까지만.
- 날짜는 "2026년 3월 초", "그로부터 2주 뒤"처럼 사건 흐름이 보이게 쓰되, 법정 기한이 며칠인지·비용이 얼마인지는 쓰지 않는다(그건 답변이 법령으로 확인할 일이다). 금액·기간 같은 사실관계 숫자(보증금 2억 원, 6개월 밀린 월급 등)는 써도 된다.
- 승소 가능성·처벌 확률·유불리를 묻지 않는다. 쟁점, 확인할 사실, 관련 법령·판례, 절차 순서, 지금 써야 할 문서와 그 문서를 어떻게 써야 하는지를 묻는다.
- 1인칭(질문하는 사람 시점)으로 쓴다.

출력(JSON):
- kind: civil(민사·가사·노동 등 사인 간 분쟁) | criminal(형사) | admin(행정·신청 절차)
- sides: 쪽마다 하나.
  - key: plaintiff(원고·청구하는 쪽) | defendant(피고·청구받는 쪽) | complainant(고소인·피해자) | suspect(피의자·피고인) | applicant(신청인·청구인)
  - label: 화면 탭 이름 (예: "원고 쪽 · 임차인", "피고 쪽 · 임대인", "고소인 쪽", "피의자 쪽", "신청인 쪽")
  - summary: 화면에 보일 짧은 질문. 60~150자. 원래 예시 질문처럼 간단하고 쉬운 말.
  - context: 답변에 쓸 복잡한 상황. 600~1,400자. 사건 경위(시간 순서), 오간 말·메시지·서류(내용증명, 소장, 지급명령, 출석요구, 처분서 등), 갖고 있는 증거, 상대방 주장, 아직 모르는 사실, 그리고 마지막에 "무엇을 확인해야 하는지, 어떤 절차를 어떤 순서로 밟아야 하는지, 지금 어떤 문서를 어떻게 써야 하는지" 묻는 문장. 쟁점이 3개 이상 얽히게 쓴다.
  - document: 이 쪽이 지금 실제로 써야 할 대표 문서 이름 하나 (예: "소장", "답변서", "고소장", "피의자 의견서", "행정심판 청구서", "임차권등기명령 신청서", "내용증명")`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "sides"],
  properties: {
    kind: { type: "string", enum: ["civil", "criminal", "admin"] },
    sides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "summary", "context", "document"],
        properties: {
          key: {
            type: "string",
            enum: ["plaintiff", "defendant", "complainant", "suspect", "applicant"],
          },
          label: { type: "string" },
          summary: { type: "string" },
          context: { type: "string" },
          document: { type: "string" },
        },
      },
    },
  },
};

const client = new Anthropic({ maxRetries: 0, timeout: 300_000 });
const PRICE = { input: 4, output: 20 }; // Opus 5.5 정가 (USD / 100만 토큰)
let spent = 0;

async function one(e) {
  const file = `${OUT}/${e.id}.json`;
  if (existsSync(file)) return { id: e.id, skipped: true };
  if (spent >= budgetUsd) return { id: e.id, stopped: "budget" };
  const sides = SINGLE.has(e.id)
    ? "이 사건은 한쪽만 쓴다: 질문한 사람 쪽(피해자·신청인·청구인) 1개."
    : "이 사건은 두 쪽을 쓴다: 민사면 plaintiff와 defendant, 형사면 complainant와 suspect. 같은 사건을 양쪽 시점에서 쓰되 각자 아는 사실과 받은 서류가 다르게 한다. 첫 쪽은 원래 예시 질문을 한 사람 쪽이다.";
  const started = Date.now();
  try {
    const res = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16_000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `원래 예시 질문(분야: ${e.tags.join(", ")} / ${e.result.intent.area}):\n${e.question}\n\n${sides}`,
        },
      ],
    });
    const cost =
      (res.usage.input_tokens * PRICE.input + res.usage.output_tokens * PRICE.output) / 1e6;
    spent += cost;
    const text = res.content.find((c) => c.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          id: e.id,
          original: e.question,
          ...parsed,
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
      id: e.id,
      sides: parsed.sides.length,
      ctx: parsed.sides.map((s) => s.context.length),
      cost: Math.round(cost * 1e4) / 1e4,
    };
  } catch (err) {
    spent += 0.3;
    return {
      id: e.id,
      error: String(err?.status ?? "") + " " + String(err?.message ?? err).slice(0, 120),
    };
  }
}

const queue = [...examples];
const rows = [];
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const r = await one(e);
      rows.push(r);
      console.log(JSON.stringify(r));
    }
  }),
);
console.log(JSON.stringify({ done: rows.length, spentUsd: Math.round(spent * 1e4) / 1e4 }));
