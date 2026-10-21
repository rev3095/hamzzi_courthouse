// 데모 분석 오케스트레이터 (PRD 8.2, DEC-009·011·013). 모델과 법제처를 가짜로 바꿔 흐름만 확인한다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runDemoAnalysis } = await import("@/lib/ai/orchestrator");
const { ApiError } = await import("@/lib/api/errors");
const { AI_NOTICE } = await import("@/lib/api/respond");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import type { StepEvent } from "@/lib/ai/policy";
import type { LawSource } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail } from "@/lib/search/types";

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제3조의2",
  lawName: "주택임대차보호법",
  articleNo: "제3조의2",
  title: "보증금의 회수",
  text: "임차인은 임차주택을 양수인에게 인도하지 아니하면 보증금을 받을 수 없다.",
  effectiveFrom: "2023-07-19",
  sourceUrl: "https://www.law.go.kr/법령/주택임대차보호법/제3조의2",
};
const ART2: ArticleHit = {
  ...ART,
  id: "law:민법:제536조",
  lawName: "민법",
  articleNo: "제536조",
  title: "동시이행의 항변권",
  text: "쌍무계약의 당사자 일방은 상대방이 그 채무이행을 제공할 때까지 자기의 채무이행을 거절할 수 있다.",
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

function fakeSource(overrides: Partial<LawSource> = {}): LawSource & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    searchArticles: vi.fn(async (q: string) => {
      queries.push(q);
      return q.includes("동시이행") ? [ART2] : [ART];
    }),
    getArticle: vi.fn(async () => null),
    searchCases: vi.fn(async (q: string) => {
      queries.push(q);
      return [CASE];
    }),
    getCase: vi.fn(async () => CASE),
    verifyStatutes: vi.fn(async () => []),
    verifyCases: vi.fn(async () => []),
    ...overrides,
  };
}

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 };
const textMsg = (text: string, stop = "end_turn"): ModelMessage =>
  ({ content: [{ type: "text", text }], stop_reason: stop, usage }) as unknown as ModelMessage;
const toolMsg = (calls: { name: string; input: unknown }[]): ModelMessage =>
  ({
    content: calls.map((c, i) => ({ type: "tool_use", id: `t${i}`, name: c.name, input: c.input })),
    stop_reason: "tool_use",
    usage,
  }) as unknown as ModelMessage;

const INTENT = {
  area: "주택임대차",
  goal: "보증금을 돌려받는 방법",
  laws: ["주택임대차보호법"],
  lawKeywords: ["임대차보증금 반환"],
  articleRefs: [],
};

type Script = {
  intent?: ModelMessage;
  agent?: ModelMessage[];
  answer?: ModelMessage;
};

function fakeModel(script: Script = {}): ModelClient & { calls: CreateParams[] } {
  const calls: CreateParams[] = [];
  const agent = [...(script.agent ?? [textMsg("충분합니다")])];
  return {
    calls,
    create: vi.fn(async (params: CreateParams) => {
      calls.push(params);
      if (params.model === "claude-haiku-5-5")
        return script.intent ?? textMsg(JSON.stringify(INTENT));
      if (params.tools) return agent.shift() ?? textMsg("충분합니다");
      return (
        script.answer ??
        textMsg(
          JSON.stringify({
            points: [
              {
                text: "대법원은 보증금 반환과 집을 비워 주는 것이 동시에 이뤄져야 한다고 봤습니다.",
                source: "case:2020다12345",
                quote: "임대인의 보증금 반환 의무와 임차인의 목적물 반환 의무는",
              },
            ],
          }),
        )
      );
    }),
  };
}

describe("데모 분석 오케스트레이터 (PRD 8.2)", () => {
  test("의도 → 검색 → 재검색 → 답변 순서로 진행 단계를 알리고 초안을 만든다", async () => {
    const model = fakeModel({
      agent: [
        toolMsg([{ name: "search_law", input: { query: "동시이행 항변권" } }]),
        textMsg("충분합니다"),
      ],
    });
    const steps: StepEvent[] = [];
    const out = await runDemoAnalysis(
      { maskedText: "집주인이 [이름] 보증금을 안 돌려줘요" },
      { model, lawSource: fakeSource(), onStep: (e) => steps.push(e) },
    );

    expect([...new Set(steps.map((s) => s.stage))]).toEqual([
      "intent",
      "search",
      "agent",
      "answer",
    ]);
    expect(out.draft.outcome).toBe("grounded");
    expect(out.draft.aiNotice).toBe(AI_NOTICE);
    expect(out.draft.answer.points).toHaveLength(1);
    expect(out.draft.cases[0]).toMatchObject({ caseNo: "2020다12345", used: true });
    expect(out.draft.trace).toEqual([
      { round: 1, tool: "law", query: "동시이행 항변권", added: ["law:민법:제536조"] },
    ]);
    expect(out.draft.searches).toEqual([{ keyword: "임대차보증금 반환", total: 2 }]);
    expect(out.evidence.has("law:민법:제536조")).toBe(true);
    expect(out.usage).toEqual({ inputTokens: 40, outputTokens: 20, cacheReadTokens: 8 });
    // 진행 단계 문구에 입력 원문을 넣지 않는다
    expect(JSON.stringify(steps)).not.toContain("보증금을 안 돌려줘요");
  });

  test("Opus 호출에만 서버 fallback을 켜고 effort를 명시한다", async () => {
    const model = fakeModel();
    await runDemoAnalysis({ maskedText: "질문" }, { model, lawSource: fakeSource() });
    const [intent, agent, answer] = model.calls;
    expect(intent.model).toBe("claude-haiku-5-5");
    expect(intent).not.toHaveProperty("fallbacks");
    expect(intent.output_config?.effort).toBe("low");
    for (const p of [agent, answer]) {
      expect(p.model).toBe("claude-opus-5-5");
      expect(p.fallbacks).toBe("default");
      expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
      expect(p.output_config?.effort).toBeDefined();
    }
    expect(answer.output_config?.format?.type).toBe("json_schema");
    expect(agent.tools?.every((t) => "strict" in t && t.strict)).toBe(true);
  });

  test("F-002 AC3 이어 묻기는 최근 3개 맥락만 모델에 보낸다", async () => {
    const model = fakeModel();
    const context = Array.from({ length: 5 }, (_, i) => ({ question: `앞질문${i}`, answer: "답" }));
    await runDemoAnalysis(
      { maskedText: "이어서 묻습니다", context },
      { model, lawSource: fakeSource() },
    );
    const sent = JSON.stringify(model.calls[0].messages);
    expect(sent).not.toContain("앞질문1");
    expect(sent).toContain("앞질문4");
  });

  test("F-007 개인정보가 섞인 재검색어는 법제처로 보내지 않는다", async () => {
    const source = fakeSource();
    const model = fakeModel({
      agent: [toolMsg([{ name: "search_precedent", input: { query: "010-1234-5678 보증금" } }])],
    });
    const out = await runDemoAnalysis({ maskedText: "질문" }, { model, lawSource: source });
    expect(source.queries.some((q) => q.includes("010"))).toBe(false);
    expect(out.draft.trace).toEqual([]);
  });

  test("F-005 근거 키 밖 출처·단정 표현 문단은 초안에서 빠진다", async () => {
    const model = fakeModel({
      answer: textMsg(
        JSON.stringify({
          points: [
            { text: "설명", source: "case:2099다1", quote: "x" },
            { text: "반드시 돌려받습니다.", source: ART.id, quote: "x" },
          ],
        }),
      ),
    });
    const out = await runDemoAnalysis({ maskedText: "질문" }, { model, lawSource: fakeSource() });
    expect(out.draft.answer.points).toEqual([]);
    expect(out.draft.outcome).toBe("no_result_in_scope");
    expect(out.dropped).toEqual(["unknown_source", "assertive"]);
  });

  test("F-006 근거가 하나도 없으면 답변 모델을 부르지 않고 no_result_in_scope", async () => {
    const model = fakeModel();
    const source = fakeSource({
      searchArticles: vi.fn(async () => []),
      searchCases: vi.fn(async () => []),
    });
    const out = await runDemoAnalysis({ maskedText: "질문" }, { model, lawSource: source });
    expect(out.draft.outcome).toBe("no_result_in_scope");
    expect(
      model.calls.filter((c) => c.output_config?.format && c.model === "claude-opus-5-5"),
    ).toEqual([]);
  });

  test("F-006 AC2 1차 검색이 모두 실패하면 검색 실패로 알린다", async () => {
    const fail = vi.fn(async () => {
      throw new ApiError("SEARCH_UPSTREAM_FAILED");
    });
    const source = fakeSource({ searchArticles: fail, searchCases: fail });
    await expect(
      runDemoAnalysis({ maskedText: "질문" }, { model: fakeModel(), lawSource: source }),
    ).rejects.toMatchObject({ code: "SEARCH_UPSTREAM_FAILED" });
  });

  test("모델 거절은 MODEL_FAILED(refusal)", async () => {
    const model = fakeModel({ answer: textMsg("", "refusal") });
    await expect(
      runDemoAnalysis({ maskedText: "질문" }, { model, lawSource: fakeSource() }),
    ).rejects.toMatchObject({
      code: "MODEL_FAILED",
      details: { stage: "answer", reason: "refusal" },
    });
  });

  test("의도 출력 형식이 틀리면 MODEL_FAILED(format)", async () => {
    const model = fakeModel({ intent: textMsg('{"area": 1}') });
    await expect(
      runDemoAnalysis({ maskedText: "질문" }, { model, lawSource: fakeSource() }),
    ).rejects.toMatchObject({
      code: "MODEL_FAILED",
      details: { stage: "intent", reason: "format" },
    });
  });

  test("DEC-013 시간이 모자라면 재검색을 건너뛰고 답변 몫을 남긴다", async () => {
    let t = 0;
    const model = fakeModel();
    await runDemoAnalysis(
      { maskedText: "질문" },
      { model, lawSource: fakeSource(), budgetMs: 28_000, now: () => (t += 1_000) },
    );
    expect(model.calls.some((c) => c.tools)).toBe(false);
    expect(model.calls.at(-1)?.model).toBe("claude-opus-5-5");
  });
});
