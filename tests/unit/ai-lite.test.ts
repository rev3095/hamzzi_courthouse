// DEC-020·026 라이트 답변 (AI_MODE=pro, Sonnet 5.5 $0.03 / Haiku 5.5 $0.0015). 모델·법제처를 가짜로 바꿔 흐름과 비용 상한만 확인한다.
// Claude 실호출 없음 (절대 규칙: 유료 테스트 반복 금지).
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runLiteAnalysis, liteEvidenceKeys, LITE_MAX_ARTICLES, UNDERSTAND_MODEL } =
  await import("@/lib/ai/lite");
const { UNDERSTAND_TOKENS } = await import("@/lib/ai/cost");
const { EvidenceSet } = await import("@/lib/search/evidence");
const { ApiError } = await import("@/lib/api/errors");
import type { CallOptions, CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { TIER_IDS, TIERS } from "@/lib/ai/models";
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

const UNDERSTOOD = JSON.stringify({
  section: "lease_deposit",
  lawQuery: "임대차 종료 후 보증금 미반환 임차권등기명령",
  caseQueries: ["임대차보증금 반환 동시이행"],
});
/** 질문 해석 호출(DEC-033)인지 — 출력 한도로 구분한다 */
const isUnderstand = (p: CreateParams) => p.max_tokens <= UNDERSTAND_TOKENS.max;

/**
 * calls = 답변 호출만, understand = 질문 해석 호출만.
 * 질문 해석은 입력 1,500 + 출력 100토큰(Haiku $0.0002)으로 고정한다 — opts.tokens·fail은 답변 호출에만 건다
 */
function fakeModel(
  opts: {
    tokens?: (p: CreateParams) => number;
    fail?: unknown;
    understood?: string;
    understandFail?: unknown;
  } = {},
) {
  const calls: CreateParams[] = [];
  const understand: CreateParams[] = [];
  const model: ModelClient & { calls: CreateParams[]; understand: CreateParams[] } = {
    calls,
    understand,
    countTokens: async (p) => (isUnderstand(p) ? 1_500 : (opts.tokens?.(p) ?? 5_000)),
    create: vi.fn(async (p: CreateParams) => {
      if (isUnderstand(p)) {
        understand.push(p);
        if (opts.understandFail) throw opts.understandFail;
        return {
          content: [{ type: "text", text: opts.understood ?? UNDERSTOOD }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1_500, output_tokens: 100, cache_read_input_tokens: 0 },
        } as unknown as ModelMessage;
      }
      calls.push(p);
      if (opts.fail) throw opts.fail;
      return msg(ANSWER);
    }),
  };
  return model;
}
/** 질문 해석 1회 비용 (Haiku 입력 1,500 + 출력 100) */
const UNDERSTAND_COST = 0.0002;

const HAIKU = { tier: "light" as const };

describe("DEC-036 단계별 답변 모델", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("Pro = Sonnet 5.5 — 생각은 between_tools로 끄고 effort low, 출력 1,200토큰 이하", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "pro" },
    );
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-sonnet-5-5");
    expect(p.thinking).toEqual({ type: "between_tools" });
    expect(p.output_config?.effort).toBe("low");
    expect(p.max_tokens).toBeLessThanOrEqual(1_200);
    expect(out.model).toBe("claude-sonnet-5-5");
  });

  test("Sonnet 질문 1건 비용은 Sonnet 단가로 계산하고 $0.03 이하 (답변 입력 5,000 + 출력 400 = $0.014, 질문 해석 $0.0002)", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: fakeSource(), tier: "pro" },
    );
    expect(out.costUsd).toBeCloseTo(0.014 + UNDERSTAND_COST, 6);
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
    // 답변은 부르지 않았고 질문 해석 비용만 남는다
    expect(out.costUsd).toBeCloseTo(UNDERSTAND_COST, 6);
  });

  test("Pro Max = Opus 5.5 — adaptive + effort xhigh, 생각 + 답변을 20,000토큰으로 묶는다. 비용은 $0.6 이하", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "max" },
    );
    const p = model.calls.find((c) => c.model === "claude-opus-5-5");
    if (!p) throw new Error("Opus 답변 호출 없음");
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.output_config?.effort).toBe("xhigh");
    expect(p.max_tokens).toBe(20_000);
    // 답변: 입력 5,000 × $4 + 출력 400 × $20 = $0.028 (+ 질문 해석 Haiku 몫)
    expect(out.costUsd).toBeGreaterThanOrEqual(0.028);
    expect(out.costUsd).toBeLessThanOrEqual(0.6);
    expect(out.model).toBe("claude-opus-5-5");
  });

  test("Pro Max 상한을 넘을 입력(140,000토큰 = $0.56 + 최소 출력 $0.06)이면 부르지 않는다", async () => {
    const model = fakeModel({ tokens: () => 140_000 });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "max" },
    );
    expect(model.calls).toHaveLength(0);
    expect(out.costCapped).toBe(true);
  });

  test("답변 호출이 시간 초과면 오류 대신 AI 문단 없이 근거만", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      {
        model: fakeModel({ fail: new ApiError("TIMEOUT", { stage: "answer" }) }),
        lawSource: fakeSource(),
        tier: "pro",
      },
    );
    expect(out.costCapped).toBe(true);
    expect(out.draft.answer.points).toHaveLength(0);
    expect(out.evidence.list().length).toBeGreaterThan(0);
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
    // DeepSearch(DEC-038): 조문 8·판례 4건까지 넘겨 본다
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

  test("질문 1건 비용은 $0.0015 이하 (답변 입력 5,000 + 출력 400 토큰 = $0.0007, 질문 해석 $0.0002)", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: fakeSource(), ...HAIKU },
    );
    expect(out.costUsd).toBeCloseTo(0.0007 + UNDERSTAND_COST, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.0015);
  });

  test("입력이 예산을 넘으면 근거를 빼고 다시 잰다 — 생성 호출은 예산 안에서 1번만", async () => {
    // 판례가 들어가면 18,000토큰(예산 초과: 해석 $0.0002 + 입력 $0.0018 + 최소 출력 700토큰 > $0.002), 빼면 5,000토큰
    const model = fakeModel({
      tokens: (p) => (JSON.stringify(p.messages).includes("2020다12345") ? 18_000 : 5_000),
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
    expect(out.costUsd).toBeCloseTo(UNDERSTAND_COST, 6);
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

describe("DEC-033 질문 해석 (검색 전 Haiku 1회: 섹션 라벨 + 검색어)", () => {
  test("답변 모델과 상관없이 Haiku로 1회, 생각 끔, 출력 450토큰 이하 — 라벨은 결과에 싣는다", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), tier: "pro" },
    );
    expect(model.understand).toHaveLength(1);
    const p = model.understand[0];
    expect(p.model).toBe(UNDERSTAND_MODEL);
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.tools).toBeUndefined();
    expect(p.max_tokens).toBeLessThanOrEqual(450);
    expect(out.draft.section).toBe("lease_deposit");
    // 질문 해석 + 답변 1회, 그 밖의 호출 없음
    expect(model.calls).toHaveLength(1);
  });

  test("해석한 검색어로 법령·판례를 찾는다 (질문 문장 대신)", async () => {
    const source = fakeSource();
    await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: source, ...HAIKU },
    );
    expect(source.searchArticles).toHaveBeenCalledWith(
      "임대차 종료 후 보증금 미반환 임차권등기명령",
      expect.any(Number),
    );
    const caseQueries = vi.mocked(source.searchCases).mock.calls.map((c) => c[0]);
    expect(caseQueries[0]).toBe("임대차보증금 반환 동시이행");
  });

  test("F-007 검색어에 개인정보 모양이 있으면 버리고 질문 문장으로 찾는다", async () => {
    const source = fakeSource();
    const model = fakeModel({
      understood: JSON.stringify({
        section: "money",
        lawQuery: "010-1234-5678 번호로 연락해 대여금 반환 청구",
        caseQueries: ["대여금 010-1234-5678", "대여금 반환"],
      }),
    });
    const out = await runLiteAnalysis(
      { maskedText: "빌려준 돈을 못 받았어요" },
      { model, lawSource: source, ...HAIKU },
    );
    expect(source.searchArticles).toHaveBeenCalledWith(
      "빌려준 돈을 못 받았어요",
      expect.any(Number),
    );
    const caseQueries = vi.mocked(source.searchCases).mock.calls.map((c) => c[0]);
    expect(caseQueries.join(" ")).not.toContain("010");
    expect(caseQueries).toContain("대여금 반환");
    expect(out.draft.section).toBe("money");
  });

  test("목록 밖 라벨은 버린다 (결과에 싣지 않는다)", async () => {
    const model = fakeModel({
      understood: JSON.stringify({
        section: "승소 가능",
        lawQuery: "보증금 반환",
        caseQueries: [],
      }),
    });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(out.draft.section).toBeUndefined();
    expect(out.draft.answer.points).toHaveLength(1);
  });

  test("질문 해석이 실패해도 오류로 끝내지 않고 질문 문장으로 찾아 답변한다 — 재시도 없음", async () => {
    for (const understandFail of [
      new ApiError("MODEL_FAILED", { reason: "refusal" }),
      new ApiError("TIMEOUT", { stage: "understand" }),
    ]) {
      const source = fakeSource();
      const model = fakeModel({ understandFail });
      const out = await runLiteAnalysis(
        { maskedText: "보증금을 못 받았어요" },
        { model, lawSource: source, ...HAIKU },
      );
      expect(model.understand).toHaveLength(1);
      expect(source.searchArticles).toHaveBeenCalledWith(
        "보증금을 못 받았어요",
        expect.any(Number),
      );
      expect(out.draft.section).toBeUndefined();
      expect(out.draft.answer.points).toHaveLength(1);
    }
    // JSON이 아닌 출력도 마찬가지
    const model = fakeModel({ understood: "죄송하지만" });
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(out.draft.section).toBeUndefined();
    expect(out.draft.answer.points).toHaveLength(1);
  });

  test("질문 해석과 답변을 합쳐도 질문 1건 상한을 넘지 않는다", async () => {
    for (const tier of TIER_IDS) {
      const out = await runLiteAnalysis(
        { maskedText: "보증금을 못 받았어요" },
        { model: fakeModel(), lawSource: fakeSource(), tier },
      );
      expect(out.costUsd).toBeLessThanOrEqual(TIERS[tier].capUsd);
    }
  });

  test("규칙 1·3·N1 조문·사건번호·숫자·단정 표현이 든 검색어는 버리고, 바꿔 쓴 문장은 결과에 싣지 않는다", async () => {
    const { screenUnderstanding } = await import("@/lib/ai/policy");
    const bad = screenUnderstanding({
      section: "insult",
      others: [],
      channel: "unknown",
      newLabel: null,
      lawQuery: "형법 제311조 모욕죄 고소 절차",
      caseQueries: [
        "대법원 2015도1234 공연성",
        "고소기간 6개월 모욕죄",
        "100% 승소",
        "모욕죄 공연성",
      ],
    });
    expect(bad.lawQuery).toBeNull();
    expect(bad.caseQueries).toEqual(["모욕죄 공연성"]);

    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model: fakeModel(), lawSource: fakeSource(), ...HAIKU },
    );
    const keywords = out.draft.searches.map((x) => x.keyword);
    expect(keywords).toContain("질문을 법률 용어로 바꾼 문장 (지능형 법령검색)");
    expect(keywords.join(" ")).not.toContain("임대차 종료 후 보증금 미반환");
  });

  test("응답 없이 실패한 질문 해석도 쓴 비용으로 쳐서 답변과 합쳐 상한을 넘지 않는다", async () => {
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      {
        model: fakeModel({ understandFail: new ApiError("TIMEOUT", { stage: "understand" }) }),
        lawSource: fakeSource(),
        ...HAIKU,
      },
    );
    // 해석 계획 최대치(입력 1,500 + 출력 450 = $0.000375, DEC-042로 출력 한도 300 → 450) + 답변 $0.0007
    expect(out.costUsd).toBeCloseTo(0.001075, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.0015);
  });
});

describe("F-017 첨부 자료 (DEC-058)", () => {
  const MATERIALS = [
    {
      kind: "메신저 대화" as const,
      summary: "임대인이 보증금을 다음 달에 돌려주겠다고 한 대화입니다.",
      details: ["다음 달에 돌려주겠다"],
      gaps: [],
    },
  ];

  test("자료는 근거가 아닌 사용자 자료로 해석·답변에 넘기고, 문단별 자료 번호를 받는다", async () => {
    const base = fakeModel();
    const answered = JSON.parse(ANSWER) as { points: Record<string, unknown>[] };
    const model = {
      ...base,
      create: vi.fn(async (p: CreateParams, o: CallOptions) => {
        if (isUnderstand(p)) return base.create(p, o);
        base.calls.push(p);
        return msg(
          JSON.stringify({ points: answered.points.map((x) => ({ ...x, materials: [1, 5] })) }),
        );
      }),
    };
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요", materials: MATERIALS },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    const text = (p: CreateParams) => JSON.stringify(p.messages);
    expect(text(base.understand[0])).toContain("<첨부_자료>");
    expect(text(base.calls[0])).toContain("법령·판례 근거가 아니며");
    const schema = base.calls[0].output_config?.format as unknown as {
      schema: { properties: { points: { items: { required: string[] } } } };
    };
    expect(schema.schema.properties.points.items.required).toContain("materials");
    // 출처는 여전히 근거 키 (자료는 출처가 될 수 없다)
    expect(out.draft.answer.points[0].source).toBe("law:주택임대차보호법:제3조의3");
    expect(out.materialRefs).toEqual([{ text: out.draft.answer.points[0].text, materials: [1] }]);
    expect(out.promptVersion).toContain("materials-");
  });

  test("자료가 없으면 답변 형식·메시지가 그대로다", async () => {
    const model = fakeModel();
    const out = await runLiteAnalysis(
      { maskedText: "보증금을 못 받았어요" },
      { model, lawSource: fakeSource(), ...HAIKU },
    );
    expect(JSON.stringify(model.calls[0].messages)).not.toContain("<첨부_자료>");
    expect(JSON.stringify(model.calls[0].output_config)).not.toContain("materials");
    expect(out.materialRefs).toEqual([]);
  });
});
