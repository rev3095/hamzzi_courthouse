// F-018 분야별 비서 (DEC-057 ⑧): 대화 한마디(Haiku) 거르기와 라이트 답변에 붙는 흐름. 모델·법제처는 가짜 — Claude 실호출 없음.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runLiteAnalysis, UNDERSTAND_MODEL } = await import("@/lib/ai/lite");
const { ApiError } = await import("@/lib/api/errors");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { TIERS } from "@/lib/ai/models";
import { ASSISTANTS } from "@/lib/assistants/agents";
import { screenTalk, talkLineOk, talkSystem, TALK_SCHEMA } from "@/lib/assistants/talk";
import type { LawSource } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail } from "@/lib/search/types";

describe("DEC-057 대화 한마디 거르기 (screenTalk)", () => {
  test("근거 없는 짧은 정리와 사실 묻기는 그대로 둔다", () => {
    expect(
      screenTalk({
        reply: "계약이 끝났는데 보증금을 돌려받지 못해 많이 답답하셨겠어요.",
        asks: ["계약이 끝난 뒤 집을 비우셨나요?", "전입신고를 해 두셨나요?"],
      }),
    ).toEqual({
      reply: "계약이 끝났는데 보증금을 돌려받지 못해 많이 답답하셨겠어요.",
      asks: ["계약이 끝난 뒤 집을 비우셨나요?", "전입신고를 해 두셨나요?"],
    });
  });

  test("숫자·법령·판례·판정·단정·개인정보가 든 문장은 버린다", () => {
    for (const bad of [
      "계약 기간 2년이 지났네요.",
      "주택임대차보호법에 따라 돌려받을 수 있어요.",
      "대법원 판례도 같은 입장이에요.",
      "승소 가능성이 높아 보여요.",
      "반드시 돌려받으실 거예요.",
      "상대방은 처벌받을 거예요.",
      "연락처 010-1234-5678로 연락해 보세요.",
    ])
      expect(talkLineOk(bad), bad).toBe(false);
    // 한글로 쓴 숫자 + 기간 (절대 규칙 3)
    for (const bad of [
      "여섯 달 안에 고소하셔야 해요.",
      "삼 년이 지나기 전에 알아보세요.",
      "보름 안에 답이 올 거예요.",
      "한 달까지 기다려 보세요.",
      "세 달씩 걸려요.",
      "삼 일 안에 알려 주세요.",
      "삼 주쯤 걸려요.",
      "이틀 뒤에 다시 연락해 보세요.",
      "하루 안에 답하세요.",
      "백 퍼센트 돌려받아요.",
      "두 배로 받을 수 있어요.",
      "열흘쯤 기다려 보세요.",
    ])
      expect(talkLineOk(bad), bad).toBe(false);
    // 근거 없는 법적 결론·법령 이름
    for (const bad of [
      "모욕죄로 고소할 수 있어요.",
      "사기에 해당해 보여요.",
      "명예훼손이 성립하는지 볼게요.",
      "상대가 처벌을 받을 수도 있어요.",
      "이건 범죄예요.",
      "정보통신망법을 함께 볼게요.",
      "전세사기특별법 대상인지 볼게요.",
    ])
      expect(talkLineOk(bad), bad).toBe(false);
    // 흔한 말은 걸리지 않는다
    for (const ok of [
      "이 일로 많이 놀라셨겠어요.",
      "이번 일을 차근차근 정리해 볼게요.",
      "법원에 내는 서류가 있는지 알려 주세요.",
      "세 주장 모두 정리해 볼게요.",
      "하루하루 걱정이 많으셨겠어요.",
    ])
      expect(talkLineOk(ok), ok).toBe(true);
    // "방법"처럼 '법'이 든 낱말은 걸리지 않는다
    expect(talkLineOk("어떤 방법이 있는지 함께 찾아볼게요.")).toBe(true);
  });

  test("정리 문장이 걸리면 한마디 전체를 내보내지 않고, 질문은 걸린 것만 빼고 셋까지", () => {
    expect(screenTalk({ reply: "100% 돌려받으실 수 있어요.", asks: [] })).toBeNull();
    expect(
      screenTalk({
        reply: "많이 놀라셨겠어요.",
        asks: ["언제였나요? 3일 전?", "a?", "b?", "c?", "d?"],
      }),
    ).toEqual({ reply: "많이 놀라셨겠어요.", asks: ["a?", "b?", "c?"] });
    expect(screenTalk({ reply: "x".repeat(200), asks: [] })).toBeNull();
    expect(screenTalk("형식이 다름")).toBeNull();
  });

  test("지시문은 비서 이름·분야를 담고 근거·숫자·판정을 금지한다", () => {
    const s = talkSystem(ASSISTANTS.report);
    expect(s).toContain("고소미");
    expect(s).toContain("법령 이름·조문·판례·사건번호·숫자");
    expect(s).toContain("유불리를 말하지 않고");
  });
});

const ART: ArticleHit = {
  id: "law:형법:제311조",
  lawName: "형법",
  articleNo: "제311조",
  title: "모욕",
  text: "공연히 사람을 모욕한 자는 1년 이하의 징역이나 금고 또는 200만원 이하의 벌금에 처한다.",
  effectiveFrom: null,
  sourceUrl: "https://www.law.go.kr/법령/형법/제311조",
};
const PINNED: CaseDetail = {
  id: "608477",
  caseNo: "2025도986",
  caseName: "성폭력범죄의처벌등에관한특례법위반(통신매체이용음란)",
  court: "대법원",
  decidedAt: "2025-08-14",
  sourceUrl: "https://www.law.go.kr/precedent/608477",
  holding: "도달의 의미",
  summary: "상대방이 객관적으로 인식할 수 있는 상태에 두는 것을 의미한다.",
  refs: null,
  fromBody: false,
  bodyExcerpt: null,
};
const source = () =>
  ({
    searchArticles: vi.fn(async () => [ART]),
    findArticles: vi.fn(async () => [ART]),
    getArticle: vi.fn(async () => null),
    searchCases: vi.fn(async () => []),
    getCase: vi.fn(async (id: string) => (id === "608477" ? PINNED : null)),
    verifyStatutes: vi.fn(async () => []),
    verifyCases: vi.fn(async () => []),
  }) as unknown as LawSource;

const text = (t: string, inTok = 1_000, outTok = 100): ModelMessage =>
  ({
    content: [{ type: "text", text: t }],
    stop_reason: "end_turn",
    usage: { input_tokens: inTok, output_tokens: outTok, cache_read_input_tokens: 0 },
  }) as unknown as ModelMessage;

const isTalk = (p: CreateParams) =>
  (p.output_config as { format?: { schema?: unknown } } | undefined)?.format?.schema ===
  TALK_SCHEMA;

function fakeModel(talkOut: string | Error) {
  const talk: CreateParams[] = [];
  const answer: CreateParams[] = [];
  const model: ModelClient = {
    countTokens: async () => 1_000,
    create: vi.fn(async (p: CreateParams) => {
      if (isTalk(p)) {
        talk.push(p);
        if (talkOut instanceof Error) throw talkOut;
        return text(talkOut);
      }
      if (p.model === UNDERSTAND_MODEL)
        return text(JSON.stringify({ section: "defamation", lawQuery: "모욕", caseQueries: [] }));
      answer.push(p);
      return text(
        JSON.stringify({
          points: [
            {
              text: "공연히 모욕한 경우를 정한 조문이 있어요.",
              source: "model",
              quote: "",
            },
          ],
        }),
        3_000,
        400,
      );
    }),
  };
  return { model, talk, answer };
}

const report = ASSISTANTS.report;
const assistantDeps = {
  persona: report.persona,
  pinnedCaseIds: ["608477"],
  promptTag: "assistant-report-v3",
  talkSystem: talkSystem(report),
};

describe("DEC-057 비서 질문의 라이트 답변", () => {
  test("대화 한마디는 Haiku(생각 끔), 답변은 Pro Max(Opus 5.5, 그 단계 effort) + 비서 지시문 두 번째 블록, 사례 판례는 근거에 더한다", async () => {
    const m = fakeModel(
      JSON.stringify({ reply: "많이 불쾌하셨겠어요.", asks: ["여러 사람이 보는 채팅이었나요?"] }),
    );
    const out = await runLiteAnalysis(
      { maskedText: "게임 채팅에서 SNS 멘션으로 욕을 들었어요" },
      { model: m.model, lawSource: source(), tier: "max", assistant: assistantDeps },
    );
    expect(m.talk).toHaveLength(1);
    expect(m.talk[0].model).toBe(UNDERSTAND_MODEL);
    expect(m.talk[0].thinking).toEqual({ type: "disabled" });
    expect(m.answer).toHaveLength(1);
    expect(m.answer[0].model).toBe("claude-opus-5-5");
    expect(m.answer[0].output_config?.effort).toBe(TIERS.max.effort);
    const system = m.answer[0].system as { text: string }[];
    expect(system).toHaveLength(2);
    expect(system[1].text).toContain("고소미");
    expect(out.talk).toEqual({
      reply: "많이 불쾌하셨겠어요.",
      asks: ["여러 사람이 보는 채팅이었나요?"],
    });
    expect(out.evidence.list().some((i) => i.key.includes("2025도986"))).toBe(true);
    expect(out.promptVersion).toMatch(/\+assistant-report-v3$/);
  });

  test("대화 한마디가 실패하거나 규칙에 걸려도 근거 답변은 그대로 나온다", async () => {
    for (const talkOut of [
      new ApiError("MODEL_FAILED", { stage: "talk" }),
      JSON.stringify({ reply: "반드시 처벌받을 거예요.", asks: [] }),
    ]) {
      const m = fakeModel(talkOut);
      const out = await runLiteAnalysis(
        { maskedText: "게임 채팅에서 욕을 들었어요" },
        { model: m.model, lawSource: source(), tier: "max", assistant: assistantDeps },
      );
      expect(out.talk).toBeNull();
      expect(out.draft.answer.points).toHaveLength(1);
    }
  });

  test("비서가 아닌 질문은 대화 한마디를 부르지 않는다", async () => {
    const m = fakeModel(JSON.stringify({ reply: "x", asks: [] }));
    const out = await runLiteAnalysis(
      { maskedText: "게임 채팅에서 욕을 들었어요" },
      { model: m.model, lawSource: source(), tier: "max" },
    );
    expect(m.talk).toHaveLength(0);
    expect("talk" in out).toBe(false);
  });
});
