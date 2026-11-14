// DEC-020 라이트 Haiku 답변 (AI_MODE=pro, 질문 1건 $0.001). 모델·법제처를 가짜로 바꿔 흐름과 비용 상한만 확인한다.
// Claude 실호출 없음 (절대 규칙: 유료 테스트 반복 금지).
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runLiteAnalysis } = await import("@/lib/ai/lite");
const { ApiError } = await import("@/lib/api/errors");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import type { LawSource } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail } from "@/lib/search/types";

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제3조의3",
  lawName: "주택임대차보호법",
  articleNo: "제3조의3",
  title: "임차권등기명령",
  text: "임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차권등기명령을 신청할 수 있다.",
  effectiveFrom: "2023-07-19",
  sourceUrl: "https://www.law.go.kr/법령/주택임대차보호법/제3조의3",
};
const CASE: CaseDetail = {
  id: "111",
  caseNo: "2020다12345",
  caseName: "임대차보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
  holding: "보증금 반환과 인도의 관계",
  summary: "임대인의 보증금 반환 의무와 임차인의 목적물 반환 의무는 동시이행 관계에 있다.",
  refs: null,
  fromBody: false,
  bodyExcerpt: null,
};

function fakeSource(): LawSource {
  return {
    searchArticles: vi.fn(async () => [ART]),
    findArticles: vi.fn(async () => [ART]),
    getArticle: vi.fn(async () => null),
    searchCases: vi.fn(async () => [CASE]),
    getCase: vi.fn(async () => CASE),
    verifyStatutes: vi.fn(async () => []),
    verifyCases: vi.fn(async () => []),
  } as unknown as LawSource;
}

const ANSWER = JSON.stringify({
  points: [
    {
      text: "보증금을 돌려받지 못했다면 임차권등기명령 신청을 검토해 볼 수 있습니다.",
      source: "law:주택임대차보호법:제3조의3",
      quote: "임대차가 끝난 후 보증금이 반환되지 아니한 경우",
    },
  ],
});
const msg = (text: string): ModelMessage =>
  ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 5_000, output_tokens: 400, cache_read_input_tokens: 0 },
  }) as unknown as ModelMessage;

function fakeModel(opts: { tokens?: (p: CreateParams) => number; fail?: unknown } = {}) {
  const calls: CreateParams[] = [];
  const model: ModelClient & { calls: CreateParams[] } = {
    calls,
    countTokens: async (p) => opts.tokens?.(p) ?? 5_000,
    create: vi.fn(async (p: CreateParams) => {
      calls.push(p);
      if (opts.fail) throw opts.fail;
      return msg(ANSWER);
    }),
  };
  return model;
}

describe("DEC-020 라이트 답변", () => {
  test("의도 분석·재검색 없이 Haiku 답변 1회, thinking 끔, 출력 800토큰 이하", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource() },
    );
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.tools).toBeUndefined();
    expect(p.max_tokens).toBeLessThanOrEqual(800);
    expect(out.draft.answer.points).toHaveLength(1);
    expect(out.costCapped).toBe(false);
  });

  test("질문 1건 비용은 $0.001 이하 (입력 5,000 + 출력 400 토큰 = $0.0007)", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: fakeSource() },
    );
    expect(out.costUsd).toBeCloseTo(0.0007, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.001);
  });

  test("입력이 예산을 넘으면 근거를 빼고 다시 잰다 — 생성 호출은 예산 안에서 1번만", async () => {
    // 근거 2개(조문+판례)일 때 9,000토큰(예산 초과), 1개면 5,000토큰
    const model = fakeModel({
      tokens: (p) => (JSON.stringify(p.messages).includes("2020다12345") ? 9_000 : 5_000),
    });
    const out = await runLiteAnalysis({ maskedText: "보증금을 못 받았어요" }, { model, lawSource: fakeSource() });
    expect(model.calls).toHaveLength(1);
    expect(JSON.stringify(model.calls[0].messages)).not.toContain("2020다12345");
    expect(out.draft.answer.points).toHaveLength(1);
  });

  test("근거 1개도 예산에 못 맞추면 Claude를 부르지 않고 찾은 근거만 낸다 (오류 아님)", async () => {
    const model = fakeModel({ tokens: () => 20_000 });
    const out = await runLiteAnalysis({ maskedText: "보증금을 못 받았어요" }, { model, lawSource: fakeSource() });
    expect(model.calls).toHaveLength(0);
    expect(out.costCapped).toBe(true);
    expect(out.costUsd).toBe(0);
    expect(out.draft.answer.points).toEqual([]);
    expect(out.draft.articles.length + out.draft.cases.length).toBeGreaterThan(0);
  });

  test("출력 한도 초과 등 모델 실패는 오류 대신 근거만 낸다 — 재시도하지 않는다", async () => {
    const model = fakeModel({ fail: new ApiError("MODEL_FAILED", { reason: "max_tokens" }) });
    const out = await runLiteAnalysis({ maskedText: "보증금을 못 받았어요" }, { model, lawSource: fakeSource() });
    expect(model.calls).toHaveLength(1);
    expect(out.costCapped).toBe(true);
  });
});
