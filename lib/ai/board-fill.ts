// 예시 답변의 빈 칸 채우기 (DEC-062). 생성은 tests/live/board-fill.live.test.ts(유료)만 부른다 — 서비스 요청 경로에서 쓰지 않는다.
// 이미 검증된 답변은 다시 만들지 않는다. 쪽(원고·피고 등) 답변마다 Opus 5.5 effort medium 1회(2026-11-27부터, 이전 xhigh)로 빠진 칸만 채운다:
//   ① 사건 정리판(절차 종류·당사자 자리와 대응·준비 자료) — 모든 쪽
//   ② 답변 문단이 하나도 남지 않은 쟁점의 문단 — 그런 쟁점이 있을 때만 (출처 model, DEC-055)
//   ③ 가상 문서 — 문서 초안이 없는 쪽만
// 결과는 서비스와 같은 규칙(screenPlan·screenVirtualDoc·숫자·단정 표현·개인정보)으로 거른다.
import "server-only";
import { z } from "zod";
import {
  VIRTUAL_DOC_SCHEMA,
  VirtualDocRawZ,
  screenVirtualDoc,
  type VirtualDocument,
} from "@/lib/documents/virtual";
import { scanInput } from "@/lib/pii";
import { callModel, createModelClient, textOf, withCostCap, type ModelClient } from "./client";
import { planSchema, screenPlan, type DeepMap, type DeepPlan } from "./deep-policy";
import { isAssertive, numberTokens } from "./policy";
import { DEEP_PLAN_SYSTEM } from "./prompts";

/** 한 쪽의 상한: 출력 16,000토큰 × $20/M = $0.32 + 입력 약 1만 토큰 $0.04 → $0.4 */
export const BOARD_FILL_CAP_USD = 0.4;
const TOKENS = { max: 16_000, min: 3_000 } as const;
export const BOARD_FILL_PROMPT_VERSION = "board-fill-2026-11-25";

const SYSTEM = `당신은 햄찌법원의 사건 정리 담당(AI)입니다. 이미 인용 검증을 마친 답변이 있는 가상 사연(직접 쓴 예시)에서, 화면에 빠진 칸만 채웁니다. 답변 문단은 다시 쓰지 않습니다.
${DEEP_PLAN_SYSTEM}
- issueAnswers(있을 때만): 답변 문단이 없는 쟁점마다 상담하듯 1~2문단(각 220자 이내)을 씁니다. 아는 한국 법령·판례로 답하되 법령은 정식 이름과 조문 번호로, 판례는 법원과 사건번호로 적습니다. 조문·사건번호 밖의 숫자(연도·기간·금액)는 쓰지 않습니다. 결과를 확정하지 않고 "반드시", "무조건", "100%" 같은 표현과 승소 가능성은 쓰지 않습니다. 사연에 없는 사실은 "…였다면"처럼 경우를 나눕니다.
- document(있을 때만): 이 쪽 당사자가 먼저 쓸 만한 서식 하나로 가상 문서 초안을 씁니다. 당사자는 이름 대신 자리로(원고(임차인) 등), 이름·주소·연락처·계좌는 쓰지 않고 "○○○"로 둡니다. 사연에 없는 날짜·금액은 "○○○○. ○○. ○○.", "금 ○○○원"으로 둡니다. 법적 근거는 검증된 답변에 나온 법령·판례로만 씁니다.
- 쉬운 말, 존댓말로 씁니다.`;

export type FillInput = {
  /** 쪽 답변을 만든 글 (요약 질문 + 자세한 상황) */
  question: string;
  deep: DeepMap;
  /** 검증을 통과해 남은 문단 */
  points: { text: string }[];
  /** 문서 초안이 없을 때만 true */
  needDocument: boolean;
};

export type FillOutput = {
  plan: DeepPlan | null;
  issueAnswers: { issue: number; text: string }[];
  document: VirtualDocument | null;
  costUsd: number;
};

/** 모델 문단 거르기: 단정 표현·개인정보 꼴·사연에 없는 숫자(조문·사건번호 밖)가 있으면 버린다 */
export function screenIssueAnswer(text: string, question: string): string | null {
  const t = text.normalize("NFKC").trim();
  if (t.length < 20 || t.length > 320) return null;
  if (isAssertive(t) || scanInput(t).findings.length > 0) return null;
  const q = numberTokens(question);
  const allowed = new Set([...q.digits, ...q.words]);
  const n = numberTokens(t);
  return [...n.digits, ...n.words].every((x) => allowed.has(x)) ? t : null;
}

const RawZ = z.object({
  plan: z.object({
    kinds: z.array(z.string()),
    sides: z.array(z.object({ party: z.string(), side: z.string(), actions: z.array(z.string()) })),
    prep: z.array(z.object({ item: z.string(), why: z.string() })),
  }),
  issueAnswers: z.array(z.object({ issue: z.number().int(), text: z.string() })).optional(),
  document: VirtualDocRawZ.optional(),
});

export async function fillBoard(
  input: FillInput,
  deps: { model?: ModelClient } = {},
): Promise<FillOutput> {
  const question = scanInput(input.question).maskedText;
  const labels = input.deep.parties.map((p) => p.label);
  const empty = input.deep.issues.flatMap((i, n) => (i.points.length === 0 ? [n + 1] : []));
  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "plan",
      ...(empty.length > 0 ? ["issueAnswers"] : []),
      ...(input.needDocument ? ["document"] : []),
    ],
    properties: {
      plan: planSchema(labels),
      ...(empty.length > 0 && {
        issueAnswers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["issue", "text"],
            properties: {
              issue: { type: "integer", enum: empty, description: "답하는 쟁점 번호" },
              text: { type: "string", description: "답변 문단, 220자 이내" },
            },
          },
        },
      }),
      ...(input.needDocument && { document: VIRTUAL_DOC_SCHEMA }),
    },
  };
  const model = withCostCap(deps.model ?? createModelClient(), BOARD_FILL_CAP_USD);
  const d = input.deep;
  const res = await callModel(
    model,
    "board_fill",
    {
      model: "claude-opus-5-5",
      max_tokens: TOKENS.max,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM }],
      // 2026-11-27 사용자 결정: xhigh를 쓰지 않는다 — medium
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content: [
            `<가상_사연>\n${question}\n</가상_사연>`,
            `<사건_구조>\n당사자: ${d.parties.map((p) => (p.role ? `${p.label}(${p.role})` : p.label)).join(", ")}\n쟁점:\n${d.issues.map((i, n) => `${n + 1}. ${i.title}${i.points.length === 0 ? " (답변 문단 없음)" : ""}`).join("\n")}\n</사건_구조>`,
            `<검증된_답변>\n${input.points.map((p) => `- ${p.text}`).join("\n") || "(없음)"}\n</검증된_답변>`,
          ].join("\n\n"),
        },
      ],
    },
    200_000,
    { minOutputTokens: TOKENS.min },
  );
  const raw = RawZ.parse(JSON.parse(textOf(res)));
  const plan = screenPlan(raw.plan as Parameters<typeof screenPlan>[0], labels, question);
  const issueAnswers: FillOutput["issueAnswers"] = [];
  for (const a of raw.issueAnswers ?? []) {
    if (!empty.includes(a.issue)) continue;
    if (issueAnswers.filter((x) => x.issue === a.issue).length >= 2) continue;
    const text = screenIssueAnswer(a.text, question);
    if (text) issueAnswers.push({ issue: a.issue, text });
  }
  const document =
    input.needDocument && raw.document ? screenVirtualDoc(raw.document, question) : null;
  return { plan, issueAnswers, document, costUsd: model.spentUsd() };
}
