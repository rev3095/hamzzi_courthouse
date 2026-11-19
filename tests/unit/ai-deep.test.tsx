// DEC-041 DeepSearch 심층 분석 — 구조화(Haiku) → 쟁점별 검색 → 쟁점별 답변 → 사건 구조·시각자료.
// 모델·법제처는 가짜 (Claude 실호출 없음).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { buildDeepMap, parseDeepMap, screenStruct } from "@/lib/ai/deep-policy";
import { TIERS, TIER_IDS, BUDGET_UNIT_USD } from "@/lib/ai/models";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import type { LawSource } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail } from "@/lib/search/types";
import { DeepMapView, issueSources, wrapText } from "@/components/result/DeepMapView";

vi.mock("server-only", () => ({}));
const { runDeepAnalysis, DEEP_STRUCT_MODEL } = await import("@/lib/ai/deep");

afterEach(cleanup);

const Q =
  "2년 전세기간이 끝난 뒤 이의 없이 계속 살고 있어요. 보증금 반환을 요구했지만 임대인이 4개월 동안 답이 없다가 갑자기 집을 비우라고 해요.";

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제6조",
  lawName: "주택임대차보호법",
  articleNo: "제6조",
  title: "계약의 갱신",
  text: "임대인이 임대차기간이 끝나기 6개월 전부터 2개월 전까지의 기간에 임차인에게 갱신거절의 통지를 하지 아니한 경우에는 그 기간이 끝난 때에 전 임대차와 동일한 조건으로 다시 임대차한 것으로 본다.",
  effectiveFrom: "2020-12-10",
  sourceUrl: "https://www.law.go.kr/법령/주택임대차보호법/제6조",
};
const CASE: CaseDetail = {
  id: "111",
  caseNo: "2020다12345",
  caseName: "건물인도",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
  holding: "보증금 반환과 인도의 관계",
  summary: "임대인의 보증금 반환 의무와 임차인의 목적물 반환 의무는 동시이행 관계에 있다.",
  refs: null,
  fromBody: false,
  bodyExcerpt: null,
};

function fakeSource() {
  return {
    searchArticles: vi.fn(async () => [ART]),
    findArticles: vi.fn(async () => [ART]),
    getArticle: vi.fn(async () => null),
    searchCases: vi.fn(async () => [CASE]),
    getCase: vi.fn(async () => CASE),
    verifyStatutes: vi.fn(async () => []),
    verifyCases: vi.fn(async () => []),
  } as unknown as LawSource & { findArticles: ReturnType<typeof vi.fn> };
}

const STRUCT = {
  parties: [
    { label: "임차인", role: "질문자" },
    { label: "임대인", role: "상대방" },
  ],
  events: [
    { when: "2년", who: "임차인", what: "전세기간이 끝난 뒤에도 이의 없이 계속 살았다" },
    { when: "", who: "임차인", what: "보증금 반환을 요구했다" },
    { when: "4개월", who: "임대인", what: "아무 답을 하지 않다가 집을 비우라고 했다" },
    { when: "3년 전", who: "임대인", what: "사연에 없는 숫자가 든 사실" },
  ],
  issues: [
    {
      title: "계약이 갱신된 것으로 보는지",
      lawName: "주택임대차보호법",
      lawKeywords: ["계약의 갱신", "갱신거절"],
      caseQuery: "묵시적 갱신 해지",
    },
    {
      title: "보증금을 받기 전에 집을 비워야 하는지",
      lawName: "민법",
      lawKeywords: ["동시이행"],
      caseQuery: "임대차보증금 동시이행",
    },
    { title: "반드시 이기는지", lawName: "민법", lawKeywords: [], caseQuery: "" },
  ],
  unknowns: [
    "계약이 끝나기 전에 갱신하지 않겠다고 알렸는지",
    "홍길동 씨에게 010-1234-5678로 연락했는지",
  ],
  lawQuery: "주택임대차 묵시적 갱신 후 임대인의 인도 청구와 보증금 반환",
};

const ANSWER = {
  points: [
    {
      issue: 1,
      text: "임대인이 정해진 기간에 갱신거절 통지를 하지 않았다면 같은 조건으로 다시 임대차한 것으로 봅니다.",
      source: "law:주택임대차보호법:제6조",
      quote: "전 임대차와 동일한 조건으로 다시 임대차한 것으로 본다",
    },
    {
      issue: 2,
      text: "법원은 보증금 반환과 집을 돌려주는 일이 동시이행 관계에 있다고 보았습니다.",
      source: "case:2020다12345",
      quote: "목적물 반환 의무는 동시이행 관계에 있다",
    },
    { issue: 2, text: "근거에 없는 출처 문단", source: "law:없는법:제1조", quote: "없음" },
  ],
};

function fakeModel(opts: { struct?: unknown; answerTokens?: number } = {}) {
  const calls: CreateParams[] = [];
  const model: ModelClient & { calls: CreateParams[] } = {
    calls,
    countTokens: async (p) =>
      p.model === DEEP_STRUCT_MODEL ? 1_500 : (opts.answerTokens ?? 12_000),
    create: async (params) => {
      calls.push(params);
      const isStruct =
        params.model === DEEP_STRUCT_MODEL &&
        params.max_tokens <= 2_000 &&
        !JSON.stringify(params.messages).includes("<사건_구조>");
      return {
        content: [
          { type: "text", text: JSON.stringify(isStruct ? (opts.struct ?? STRUCT) : ANSWER) },
        ],
        stop_reason: "end_turn",
        usage: isStruct
          ? { input_tokens: 1_500, output_tokens: 600 }
          : { input_tokens: opts.answerTokens ?? 12_000, output_tokens: 1_500 },
      } as unknown as ModelMessage;
    },
  };
  return model;
}

describe("DEC-041 사건 구조 거르기 (절대 규칙 1·2·3·4)", () => {
  const s = screenStruct(STRUCT, Q);

  test("질문에 없는 숫자·단정 표현·개인정보가 든 항목은 버린다", () => {
    expect(s.events.map((e) => e.what)).not.toContain("사연에 없는 숫자가 든 사실");
    expect(s.events).toHaveLength(3);
    expect(s.issues.map((i) => i.title)).toEqual([
      "계약이 갱신된 것으로 보는지",
      "보증금을 받기 전에 집을 비워야 하는지",
    ]);
    expect(s.unknowns).toEqual(["계약이 끝나기 전에 갱신하지 않겠다고 알렸는지"]);
  });

  test("질문에 적힌 숫자(2년·4개월)는 그대로 둔다", () => {
    expect(s.events.map((e) => e.when)).toEqual(["2년", "", "4개월"]);
  });
});

describe("DEC-041 심층 분석 흐름", () => {
  test("모델 호출은 구조화(Haiku) 1회 + 답변 1회뿐이고, 쟁점마다 그 법률에서 조문을 따로 찾는다", async () => {
    const model = fakeModel();
    const source = fakeSource();
    const out = await runDeepAnalysis({ maskedText: Q }, { model, lawSource: source, tier: "max" });
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0].model).toBe("claude-haiku-5-5");
    expect(model.calls[0].thinking).toEqual({ type: "disabled" });
    const answer = model.calls[1];
    expect(answer.model).toBe("claude-opus-5-5");
    expect(answer.max_tokens).toBe(TIERS.max.deep.answerTokens.max);
    expect(JSON.stringify(answer.messages)).toContain("<사건_구조>");
    expect(JSON.stringify(answer.messages)).toContain("1. 계약이 갱신된 것으로 보는지");
    // 쟁점 2개 → 법률별 조문 검색 2번 (세 번째 쟁점은 걸러졌다)
    expect(source.findArticles).toHaveBeenCalledTimes(2);
    expect(source.findArticles).toHaveBeenCalledWith(
      "주택임대차보호법",
      ["계약의 갱신", "갱신거절"],
      2,
    );
    // 근거에 없는 출처 문단은 1차 거르기에서 빠진다
    expect(out.draft.answer.points).toHaveLength(2);
    expect(out.dropped).toEqual(["unknown_source"]);
    expect(out.struct?.issues).toHaveLength(2);
    expect(out.costUsd).toBeLessThanOrEqual(TIERS.max.deep.capUsd);
  });

  test("단계마다 상한은 일반 질문의 2배이고, 예산 가중치와 맞는다", () => {
    for (const id of TIER_IDS) {
      expect(TIERS[id].deep.capUsd).toBeCloseTo(TIERS[id].capUsd * 2, 10);
      // 가중치는 상한 ÷ 단위를 올림 (Light $0.004 → 3단위)
      expect(TIERS[id].deep.weight).toBe(Math.ceil(TIERS[id].deep.capUsd / BUDGET_UNIT_USD - 1e-9));
    }
  });

  test("쟁점을 뽑지 못하면 일반 답변으로 내려간다 (오류로 끝내지 않는다)", async () => {
    const model = fakeModel({ struct: { ...STRUCT, issues: [] } });
    const out = await runDeepAnalysis(
      { maskedText: Q },
      { model, lawSource: fakeSource(), tier: "light" },
    );
    expect(out.struct).toBeNull();
    expect(out.drafted).toEqual([]);
  });

  test("입력이 상한을 넘으면 답변을 부르지 않고 근거만 낸다", async () => {
    const model = fakeModel({ answerTokens: 90_000 });
    const out = await runDeepAnalysis(
      { maskedText: Q },
      { model, lawSource: fakeSource(), tier: "max" },
    );
    expect(model.calls).toHaveLength(1);
    expect(out.costCapped).toBe(true);
    expect(out.draft.answer.points).toHaveLength(0);
  });
});

describe("DEC-041 사건 구조와 시각자료", () => {
  const struct = screenStruct(STRUCT, Q);
  const kept = ANSWER.points.slice(0, 2);
  const map = buildDeepMap(
    struct,
    ANSWER.points.map((p) => ({ issue: p.issue, text: p.text })),
    [kept[1], kept[0]], // 검증 뒤 순서가 바뀌어도 글자로 다시 찾는다
  );
  const result = {
    aiNotice: "AI 생성 · 법률 자문 아님",
    deep: map,
    answer: { points: [kept[1], kept[0]].map((p) => ({ ...p, check: "verified" })) },
    articles: [{ ...ART, used: true }],
    cases: [{ ...CASE, used: true }],
  } as unknown as DemoAnalysisResult;

  test("쟁점에는 검증을 통과해 남은 문단의 순번만 잇는다", () => {
    expect(map.issues).toEqual([
      { title: "계약이 갱신된 것으로 보는지", points: [1] },
      { title: "보증금을 받기 전에 집을 비워야 하는지", points: [0] },
    ]);
    expect(parseDeepMap(map)).not.toBeNull();
    expect(parseDeepMap({ ...map, issues: [] })).toBeNull();
  });

  test("쟁점마다 쓴 근거 이름을 모은다", () => {
    expect(issueSources(map, result)).toEqual([["주택임대차보호법 제6조"], ["대법원 2020다12345"]]);
  });

  test("구조도·사실관계 흐름·쟁점별 근거·확인할 사실을 그리고, AI 고지를 붙인다. 유불리 표현은 없다", () => {
    render(<DeepMapView result={result} />);
    expect(
      screen.getByRole("img", { name: /사건 구조도: 당사자 2, 쟁점 2, 확인할 사실 1/ }),
    ).toBeDefined();
    expect(screen.getByText("사실관계 흐름")).toBeDefined();
    expect(screen.getByText("쟁점별 근거")).toBeDefined();
    expect(screen.getByText(/AI 생성 · 법률 자문 아님/)).toBeDefined();
    expect(screen.getByText("답변 문단 2번 · 근거 1개")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/유리|불리|승소|가능성|확률|점수/);
  });

  test("좁은 화면용 세로 목록에도 당사자·쟁점 개수가 같고, 근거 수만 적는다 (가로 스크롤 없음)", () => {
    const { container } = render(<DeepMapView result={result} />);
    expect(
      screen.getByRole("group", { name: "사건 구조: 당사자 2, 쟁점 2, 확인할 사실 1" }),
    ).toBeDefined();
    expect(container.innerHTML).not.toContain("min-w-[640px]");
  });

  test("긴 글은 줄을 나누고 넘치면 줄임표를 붙인다", () => {
    expect(wrapText("가나다 라마바 사아자", 6, 3)).toEqual(["가나다", "라마바", "사아자"]);
    expect(wrapText("가".repeat(30), 10, 2).at(-1)?.endsWith("…")).toBe(true);
  });

  test("deep이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<DeepMapView result={{ ...result, deep: undefined }} />);
    expect(container.innerHTML).toBe("");
  });
});
