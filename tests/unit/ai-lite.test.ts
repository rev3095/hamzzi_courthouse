// DEC-020·026 라이트 답변 (AI_MODE=pro, Sonnet 5.5 $0.03 / Haiku 5.5 $0.0015). 모델·법제처를 가짜로 바꿔 흐름과 비용 상한만 확인한다.
// Claude 실호출 없음 (절대 규칙: 유료 테스트 반복 금지).
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runLiteAnalysis, liteEvidenceKeys, LITE_MAX_ARTICLES } = await import("@/lib/ai/lite");
const { EvidenceSet } = await import("@/lib/search/evidence");
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

const HAIKU = { tier: "light" as const };

describe("DEC-032 단계별 답변 모델", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("단계를 주지 않으면 Pro = Sonnet 5.5 — 생각은 between_tools로 끄고 effort low, 출력 1,200토큰 이하", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource() },
    );
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.thinking).toEqual({ type: "between_tools" });
    expect(p.output_config?.effort).toBe("low");
    expect(p.max_tokens).toBeLessThanOrEqual(1_200);
    expect(out.model).toBe("claude-sonnet-5-5");
  });

  test("Sonnet 질문 1건 비용은 Sonnet 단가로 계산하고 $0.03 이하 (입력 5,000 + 출력 400 = $0.014)", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: fakeSource(), tier: "pro" },
    );
    expect(out.costUsd).toBeCloseTo(0.014, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.03);
  });

  test("Sonnet 상한을 넘을 입력이면 근거를 빼고, 끝내 못 맞추면 부르지 않는다 (입력 20,000 = $0.04)", async () => {
    const model = fakeModel({ tokens: () => 20_000 });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "pro" },
    );
    expect(model.calls).toHaveLength(0);
    expect(out.costCapped).toBe(true);
    expect(out.costUsd).toBe(0);
  });

  test("Pro Max = Opus 5.5 — 생각 설정을 보내지 않고(끌 수 없음), 생각 + 답변을 4,000토큰으로 묶는다. 비용은 $0.12 이하", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "max" },
    );
    const p = model.calls[0];
    expect(p.model).toBe("claude-opus-5-5");
    expect("thinking" in p).toBe(false);
    expect(p.output_config?.effort).toBe("low");
    expect(p.max_tokens).toBe(4_000);
    // 입력 5,000 × $4 + 출력 400 × $20 = $0.028
    expect(out.costUsd).toBeCloseTo(0.028, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.12);
    expect(out.model).toBe("claude-opus-5-5");
  });

  test("Pro Max 상한을 넘을 입력(40,000토큰 = $0.16)이면 부르지 않는다", async () => {
    const model = fakeModel({ tokens: () => 40_000 });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "max" },
    );
    expect(model.calls).toHaveLength(0);
    expect(out.costCapped).toBe(true);
  });

  test("모델에 넘기는 조문은 6개까지 (이전 4개), 판례는 3건까지", () => {
    const evidence = new EvidenceSet();
    for (let i = 1; i <= 8; i++)
      evidence.addArticle({ ...ART, id: `law:주택임대차보호법:제${i}조`, articleNo: `제${i}조` });
    for (let i = 1; i <= 5; i++)
      evidence.addCase({ ...CASE, id: `${i}`, caseNo: `2020다1234${i}` });
    const keys = liteEvidenceKeys(evidence);
    const statutes = keys.filter((k) => k.startsWith("law:"));
    expect(LITE_MAX_ARTICLES).toBe(6);
    expect(statutes).toHaveLength(6);
    expect(keys.length - statutes.length).toBe(3);
    // DeepSearch(DEC-034): 조문 8·판례 4건까지 넘겨 본다
    const deep = liteEvidenceKeys(evidence, { articles: 8, cases: 4 });
    expect(deep.filter((k) => k.startsWith("law:"))).toHaveLength(8);
    expect(deep).toHaveLength(12);
  });
});

describe("DEC-020 라이트 답변 (Haiku)", () => {
  test("의도 분석·재검색 없이 Haiku 답변 1회, thinking 끔, 출력 1,200토큰 이하", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.tools).toBeUndefined();
    expect(p.max_tokens).toBeLessThanOrEqual(1_200);
    expect(out.draft.answer.points).toHaveLength(1);
    expect(out.costCapped).toBe(false);
  });

  test("질문 1건 비용은 $0.0015 이하 (입력 5,000 + 출력 400 토큰 = $0.0007)", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: fakeSource(), ...HAIKU },
    );
    expect(out.costUsd).toBeCloseTo(0.0007, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.0015);
  });

  test("입력이 예산을 넘으면 근거를 빼고 다시 잰다 — 생성 호출은 예산 안에서 1번만", async () => {
    // 판례가 들어가면 13,000토큰(예산 초과: 입력 $0.0013 + 최소 출력 700토큰 > $0.0015), 빼면 5,000토큰
    const model = fakeModel({
      tokens: (p) => (JSON.stringify(p.messages).includes("2020다12345") ? 13_000 : 5_000),
    });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(model.calls).toHaveLength(1);
    expect(JSON.stringify(model.calls[0].messages)).not.toContain("2020다12345");
    expect(out.draft.answer.points).toHaveLength(1);
  });

  test("근거 1개도 예산에 못 맞추면 Claude를 부르지 않고 찾은 근거만 낸다 (오류 아님)", async () => {
    const model = fakeModel({ tokens: () => 20_000 });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(model.calls).toHaveLength(0);
    expect(out.costCapped).toBe(true);
    expect(out.costUsd).toBe(0);
    expect(out.draft.answer.points).toEqual([]);
    expect(out.draft.articles.length + out.draft.cases.length).toBeGreaterThan(0);
  });

  test("출력 한도 초과 등 모델 실패는 오류 대신 근거만 낸다 — 재시도하지 않는다", async () => {
    const model = fakeModel({ fail: new ApiError("MODEL_FAILED", { reason: "max_tokens" }) });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(model.calls).toHaveLength(1);
    expect(out.costCapped).toBe(true);
  });
});
