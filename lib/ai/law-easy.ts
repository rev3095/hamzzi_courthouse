// 법령 쉬운 설명 (DEC-074) — 법령 조문을 처음 읽는 사람의 말로 풀어 쓰는 Haiku 1회 호출.
// 입력은 법제처에서 가져온 공개 법령 원문뿐이다(사용자 입력 없음 — 가릴 것이 없다). 그래도 원문·출력은 로그에 남기지 않는다.
// 1건 비용 상한 $0.004 (LAW_EASY_COST_CAP_USD). 예산에 못 맞추거나 모델이 실패하면 AI 문장 없이 끝낸다 — 재시도하지 않는다.
// 출력은 lib/search/easy/policy.ts screenEasy가 거른다: 이 법에 없는 조문 번호·원문에 없는 숫자·판례처럼 보이는 문장·단정 표현은 빠진다.
import "server-only";
import { ApiError } from "@/lib/api/errors";
import {
  digestArticles,
  easyUsable,
  screenEasy,
  type EasyArticle,
  type EasyDrop,
  type EasyLaw,
} from "@/lib/search/easy/policy";
import {
  CostCapReached,
  callModel,
  createModelClient,
  textOf,
  withCostCap,
  type ModelClient,
} from "./client";
import { LAW_EASY_COST_CAP_USD, LAW_EASY_TOKENS } from "./cost";
import { MODELS } from "./policy";

export const LAW_EASY_PROMPT_VERSION = "law-easy-2026-11-27c";
const TIMEOUT_MS = 25_000;

const SYSTEM = `당신은 무료 법률 서비스 "햄찌법원"의 법령 해설 도우미입니다. 법령을 한 번도 읽어 본 적 없는 사람이 이해하도록 "{law}"을(를) 쉬운 말로 풀어 씁니다.
- 주어진 <목차>와 <조문>에 적힌 내용만 씁니다. 거기에 없는 내용·제도·기관을 덧붙이지 않습니다.
- 문장은 짧게, 일상에서 쓰는 낱말로, "~해요" 말투로 씁니다. 법률 용어는 처음 나올 때 괄호 안에 뜻을 한 번 풀어 줍니다.
- 조문 번호는 <목차>에 있는 번호만 "제○조" 꼴로 씁니다. 다른 법령의 조문 번호는 쓰지 않습니다.
- 숫자(기간·금액·횟수)는 <조문>에 적힌 것만 그대로 씁니다. 계산하거나 바꿔 쓰지 않습니다. 확실하지 않으면 숫자 없이 씁니다.
- "반드시", "무조건", "꼭", "확실히", "100%" 같은 표현과, "처벌받아요"·"이겨요"처럼 결과를 잘라 말하는 표현은 쓰지 않습니다. "~하도록 정하고 있어요", "~할 수 있어요"처럼 씁니다.
- 판례·사건번호·법원 이름·실제 회사 이름·사람 이름은 쓰지 않습니다. 금액·기간·횟수를 한글(오백만 원, 삼 년)로 풀어 쓰지 않습니다.
- keyPoints와 virtualCases에는 근거 조문 번호(articleNo)를 채웁니다. 근거 조문을 댈 수 없는 항목은 쓰지 않습니다.
- 전체를 짧게 씁니다.

출력 항목:
- summary: 이 법이 무엇을 정하는지 2~4문장.
- who: 이 법이 누구에게 해당하는지 1~3줄 (예: "의료기기를 만들거나 파는 사업자").
- keyPoints: 핵심 내용 3~6개. title은 짧은 제목(20자 안팎), body는 쉬운 설명 1~2문장, articleNo는 근거가 되는 조문 번호 하나.
- issues: 사람들이 자주 궁금해하는 점 2~5개를 묻는 말로 (예: "허가 없이 팔면 어떻게 되나요?"). articleNo는 답이 적힌 조문 번호 하나.
- virtualCases: {virtual}`;

const VIRTUAL_ON = `이 법이 실제로 어떻게 쓰이는지 보여 주는 지어낸 일상 상황 2개. title은 짧은 제목, situation은 "이런 상황이라면"에 해당하는 상황 1~2문장(사람은 "판매업자 A"처럼 역할로만 부릅니다), lawSays는 "이 법은 이렇게 정하고 있어요"에 해당하는 설명 1~2문장, articleNo는 근거 조문 번호 하나. 실제 사건·판례처럼 보이게 쓰지 않고, 재판·소송·수사 이야기나 \"벌금을 냈어요\" 같은 결과를 쓰지 않으며, 숫자·날짜·회사 이름·사람 이름을 넣지 않습니다.`;
const VIRTUAL_OFF = `빈 배열 []로 둡니다.`;

const articleNo = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "array", items: { type: "string" } },
    who: { type: "array", items: { type: "string" } },
    keyPoints: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" }, articleNo },
        required: ["title", "body", "articleNo"],
        additionalProperties: false,
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: { question: { type: "string" }, articleNo },
        required: ["question", "articleNo"],
        additionalProperties: false,
      },
    },
    virtualCases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          situation: { type: "string" },
          lawSays: { type: "string" },
          articleNo,
        },
        required: ["title", "situation", "lawSays", "articleNo"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "who", "keyPoints", "issues", "virtualCases"],
  additionalProperties: false,
} as const;

export type ExplainLawOutput =
  | { ok: true; easy: EasyLaw; dropped: EasyDrop[]; costUsd: number }
  | {
      ok: false;
      reason: "cost_cap" | "model_failed" | "empty" | "no_articles";
      costUsd: number;
    };

export async function explainLaw(
  input: { lawName: string; articles: EasyArticle[]; needVirtual: boolean },
  deps: { model?: ModelClient; costCapUsd?: number } = {},
): Promise<ExplainLawOutput> {
  if (input.articles.length === 0) return { ok: false, reason: "no_articles", costUsd: 0 };
  const model = withCostCap(
    deps.model ?? createModelClient(),
    deps.costCapUsd ?? LAW_EASY_COST_CAP_USD,
  );
  const digest = digestArticles(input.articles);
  try {
    const res = await callModel(
      model,
      "law_easy",
      {
        model: MODELS.answer,
        max_tokens: LAW_EASY_TOKENS.max,
        thinking: { type: "disabled" },
        system: [
          {
            type: "text",
            text: SYSTEM.replaceAll("{law}", input.lawName).replace(
              "{virtual}",
              input.needVirtual ? VIRTUAL_ON : VIRTUAL_OFF,
            ),
          },
        ],
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: `법령: ${input.lawName}\n${digest.text}` }],
      },
      TIMEOUT_MS,
      { minOutputTokens: LAW_EASY_TOKENS.min },
    );
    const raw: unknown = JSON.parse(textOf(res));
    // 거르기 기준은 모델에 보낸 일부가 아니라 그 법의 조문 전체다
    const { easy, dropped } = screenEasy(raw, input.articles, {
      allowVirtual: input.needVirtual,
      lawName: input.lawName,
    });
    if (!easyUsable(easy)) return { ok: false, reason: "empty", costUsd: model.spentUsd() };
    return {
      ok: true,
      easy: { lawName: input.lawName, ...easy },
      dropped,
      costUsd: model.spentUsd(),
    };
  } catch (e) {
    if (e instanceof CostCapReached)
      return { ok: false, reason: "cost_cap", costUsd: model.spentUsd() };
    if (
      e instanceof SyntaxError ||
      (e instanceof ApiError && (e.code === "MODEL_FAILED" || e.code === "TIMEOUT"))
    ) {
      return { ok: false, reason: "model_failed", costUsd: model.spentUsd() };
    }
    throw e;
  }
}
