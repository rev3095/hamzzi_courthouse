// @vitest-environment node
// DEC-074 법령 쉬운 설명 — Haiku 1회 호출(가짜 모델)과 저장 자료 다시 거르기. Claude 실호출 없음 (절대 규칙 8).
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { explainLaw, LAW_EASY_PROMPT_VERSION } = await import("@/lib/ai/law-easy");
const { ApiError } = await import("@/lib/api/errors");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { LAW_EASY_COST_CAP_USD, LAW_EASY_TOKENS } from "@/lib/ai/cost";
import { findEasyLaw, type EasyStored } from "@/lib/search/easy/data";
import type { EasyArticle } from "@/lib/search/easy/types";

const LAW = "의료기기법";
const ARTICLES: EasyArticle[] = [
  {
    articleNo: "제1조",
    title: "목적",
    text: "제1조(목적) 이 법은 의료기기의 제조ㆍ수입 및 판매 등에 관한 사항을 규정함으로써 국민보건 향상에 이바지함을 목적으로 한다.",
  },
  {
    articleNo: "제6조",
    title: "제조업의 허가 등",
    text: "제6조(제조업의 허가 등) ① 의료기기의 제조를 업으로 하려는 자는 식품의약품안전처장의 제조업허가를 받아야 한다.",
  },
  {
    articleNo: "제51조",
    title: "벌칙",
    text: "제51조(벌칙) ① 제6조제1항을 위반한 자는 5년 이하의 징역 또는 5천만원 이하의 벌금에 처한다.",
  },
];

const RAW = {
  summary: ["의료기기를 만들고 파는 일의 규칙을 정한 법이에요."],
  who: ["의료기기를 만들거나 파는 사업자"],
  keyPoints: [
    {
      title: "만들려면 허가가 필요해요",
      body: "의료기기를 만드는 일을 하려면 허가를 받도록 정하고 있어요.",
      articleNo: "제6조",
    },
    {
      title: "지어낸 조문",
      body: "제77조에 따라 등록하도록 정하고 있어요.",
      articleNo: "제77조",
    },
  ],
  issues: [{ question: "허가 없이 만들면 어떻게 되나요?", articleNo: "제51조" }],
  virtualCases: [
    {
      title: "허가 없이 만든 경우",
      situation: "제조업자 A가 허가 없이 의료기기를 만들려고 해요.",
      lawSays: "이 법은 먼저 허가를 받도록 정하고 있어요.",
      articleNo: "제6조",
    },
    {
      title: "판례처럼 쓴 사례",
      situation: "대법원 2020도12345 사건에서 제조업자가 처벌됐어요.",
      lawSays: "이 법은 허가를 받도록 정하고 있어요.",
      articleNo: "제6조",
    },
  ],
  requirements: [
    { text: "의료기기를 업으로 만들려는 경우에 해당해요.", articleNo: "제6조" },
    { text: "근거 없는 요건이에요.", articleNo: null },
  ],
  alternatives: [
    {
      title: "만들기 전에 허가를 신청해요",
      body: "제조를 시작하기 전에 허가를 신청해 볼 수 있어요.",
      articleNo: "제6조",
    },
    {
      title: "단속을 피하는 방법",
      body: "허가 없이 팔되 들키지 않게 할 수 있어요.",
      articleNo: null,
    },
  ],
};

const msg = (text: string): ModelMessage =>
  ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 9_000, output_tokens: 1_000, cache_read_input_tokens: 0 },
  }) as unknown as ModelMessage;

function fakeModel(opts: { tokens?: number; fail?: unknown; text?: string } = {}) {
  const calls: CreateParams[] = [];
  const model: ModelClient & { calls: CreateParams[] } = {
    calls,
    countTokens: async () => opts.tokens ?? 9_000,
    create: vi.fn(async (p: CreateParams) => {
      calls.push(p);
      if (opts.fail) throw opts.fail;
      return msg(opts.text ?? JSON.stringify(RAW));
    }),
  };
  return model;
}

describe("DEC-074 법령 쉬운 설명 Haiku 호출", () => {
  test("Haiku 1회, thinking 끔, effort low, 출력 2,400토큰 이하, 1건 $0.004 이하", async () => {
    const model = fakeModel();
    const out = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: true },
      { model },
    );
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.output_config?.effort).toBe("low");
    expect(p.max_tokens).toBeLessThanOrEqual(LAW_EASY_TOKENS.max);
    expect(LAW_EASY_TOKENS.max).toBe(2_400);
    // 조문 목차와 본문이 들어간다
    expect(JSON.stringify(p.messages)).toContain("제6조 제조업의 허가 등");
    expect(JSON.stringify(p.system)).toContain(LAW);
    expect(LAW_EASY_PROMPT_VERSION).toMatch(/^law-easy-/);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 이 법에 없는 조문을 적은 항목, 판례처럼 쓴 가상 사례는 빠진다
    expect(out.easy.lawName).toBe(LAW);
    expect(out.easy.keyPoints.map((k) => k.title)).toEqual(["만들려면 허가가 필요해요"]);
    expect(out.easy.virtualCases.map((v) => v.title)).toEqual(["허가 없이 만든 경우"]);
    // DEC-076: 근거 없는 요건·법을 피하는 요령으로 읽히는 대안은 빠진다
    expect(out.easy.requirements.map((r) => r.articleNo)).toEqual(["제6조"]);
    expect(out.easy.alternatives.map((a) => a.title)).toEqual(["만들기 전에 허가를 신청해요"]);
    expect(out.dropped).toEqual(["unknown_article", "case_like", "no_article", "evasion"]);
    expect(JSON.stringify(p.system)).toContain("alternatives");
    // 입력 9,000토큰 $0.0009 + 출력 1,000토큰 $0.0005
    expect(out.costUsd).toBeCloseTo(0.0014, 6);
    expect(out.costUsd).toBeLessThanOrEqual(LAW_EASY_COST_CAP_USD);
    expect(LAW_EASY_COST_CAP_USD).toBe(0.004);
  });

  test("DEC-076 extra: 성립 요건·대안만 쓰게 하고, 그 두 칸이 남으면 쓸 수 있다", async () => {
    const model = fakeModel({
      text: JSON.stringify({
        summary: [],
        who: [],
        keyPoints: [],
        issues: [],
        virtualCases: [],
        requirements: RAW.requirements,
        alternatives: RAW.alternatives,
      }),
    });
    const out = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: true, want: "extra" },
      { model },
    );
    expect(JSON.stringify(model.calls[0].system)).toContain("requirements와 alternatives만");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.easy.summary).toEqual([]);
    expect(out.easy.alternatives).toHaveLength(1);
  });

  test("실제 판례가 충분하면 가상 사례를 시키지 않고, 모델이 내도 버린다", async () => {
    const model = fakeModel();
    const out = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: false },
      { model },
    );
    expect(JSON.stringify(model.calls[0].system)).toContain("빈 배열");
    expect(JSON.stringify(model.calls[0].system)).not.toContain("지어낸 일상 상황");
    expect(out.ok && out.easy.virtualCases).toEqual([]);
  });

  test("입력이 예산을 넘으면 부르지 않는다 (오류 아님)", async () => {
    const model = fakeModel({ tokens: 60_000 });
    const out = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: true },
      { model },
    );
    expect(model.calls).toHaveLength(0);
    expect(out).toEqual({ ok: false, reason: "cost_cap", costUsd: 0 });
  });

  test("모델 실패·형식 오류는 AI 문장 없이 끝낸다 — 재시도하지 않는다", async () => {
    const failed = fakeModel({ fail: new ApiError("MODEL_FAILED", { reason: "max_tokens" }) });
    const a = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: true },
      { model: failed },
    );
    expect(a).toMatchObject({ ok: false, reason: "model_failed" });
    expect(failed.calls).toHaveLength(1);
    const broken = fakeModel({ text: "not json" });
    const b = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: true },
      { model: broken },
    );
    expect(b).toMatchObject({ ok: false, reason: "model_failed" });
    expect(broken.calls).toHaveLength(1);
  });

  test("거른 뒤 남는 설명이 없으면 empty, 조문이 없으면 모델을 부르지 않는다", async () => {
    const model = fakeModel({
      text: JSON.stringify({ ...RAW, summary: ["반드시 처벌받습니다."] }),
    });
    const out = await explainLaw(
      { lawName: LAW, articles: ARTICLES, needVirtual: true },
      { model },
    );
    expect(out).toMatchObject({ ok: false, reason: "empty" });
    const none = fakeModel();
    expect(
      await explainLaw({ lawName: LAW, articles: [], needVirtual: true }, { model: none }),
    ).toEqual({
      ok: false,
      reason: "no_articles",
      costUsd: 0,
    });
    expect(none.calls).toHaveLength(0);
  });
});

describe("DEC-074 미리 만든 쉬운 설명", () => {
  const stored: EasyStored = {
    promptVersion: "law-easy-test",
    generatedAt: "2026-11-27",
    easy: RAW,
  };
  const data = new Map([[LAW, stored]]);

  test("저장된 설명도 지금 조문으로 다시 거른다", () => {
    const easy = findEasyLaw("의료기기법", ARTICLES, { data });
    expect(easy?.keyPoints.map((k) => k.title)).toEqual(["만들려면 허가가 필요해요"]);
    expect(easy?.virtualCases).toHaveLength(1);
    expect(findEasyLaw(LAW, ARTICLES, { data, allowVirtual: false })?.virtualCases).toEqual([]);
  });

  test("법이 바뀌어 없어진 조문은 근거로 달지 않는다. 저장되지 않은 법령은 null", () => {
    // 근거 조문이 없어진 핵심 내용은 빠지고, 남는 것이 없으면 저장본을 쓰지 않는다
    expect(findEasyLaw(LAW, [], { data })).toBeNull();
    expect(findEasyLaw("약사법", ARTICLES, { data })).toBeNull();
    // 저장소의 기본 자료에 없는 법령
    expect(findEasyLaw("민법", ARTICLES)).toBeNull();
  });
});
