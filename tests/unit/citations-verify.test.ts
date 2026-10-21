// 인용 검증 실행 (F-005 AC2). 법제처 재조회를 가짜로 바꿔 호출 대상과 실패 처리를 확인한다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { verifyDraft } = await import("@/lib/citations/verify");
const { ApiError } = await import("@/lib/api/errors");
const { AI_NOTICE } = await import("@/lib/api/respond");
const { EvidenceSet } = await import("@/lib/search/evidence");
import type { DemoDraft, StepEvent } from "@/lib/ai/policy";
import type { LawSource } from "@/lib/search/law-source";
import type { CitationCheck } from "@/lib/search/types";

function setup() {
  const ev = new EvidenceSet();
  ev.addArticle({
    id: "law:민법:제536조",
    lawName: "민법",
    articleNo: "제536조",
    title: "동시이행의 항변권",
    text: "쌍무계약의 당사자 일방은 상대방이 그 채무이행을 제공할 때까지 자기의 채무이행을 거절할 수 있다.",
    effectiveFrom: null,
    sourceUrl: "https://www.law.go.kr/법령/민법/제536조",
  });
  const draft: DemoDraft = {
    outcome: "grounded",
    aiNotice: AI_NOTICE,
    intent: { area: "계약", goal: "이행 거절", laws: [], lawKeywords: [] },
    answer: {
      points: [
        {
          text: "민법 제536조는 상대방이 이행할 때까지 내 이행을 거절할 수 있다고 정합니다.",
          source: "law:민법:제536조",
          quote: "상대방이 그 채무이행을 제공할 때까지 자기의 채무이행을 거절할 수 있다",
        },
      ],
    },
    articles: [],
    cases: [],
    searches: [],
    trace: [],
    searchScopeNote: "",
  };
  return { ev, draft };
}

function source(verifyStatutes: LawSource["verifyStatutes"]): LawSource {
  return {
    searchArticles: vi.fn(),
    getArticle: vi.fn(),
    searchCases: vi.fn(),
    getCase: vi.fn(),
    verifyStatutes: vi.fn(verifyStatutes),
    verifyCases: vi.fn(async (): Promise<CitationCheck[]> => []),
  };
}

describe("F-005 AC2 인용 재조회", () => {
  test("출처·본문 인용을 중복 없이 한 번씩 재조회하고 verify 단계를 알린다", async () => {
    const { ev, draft } = setup();
    const src = source(async (cs) => cs.map((citation) => ({ citation, exists: true })));
    const steps: StepEvent[] = [];
    const out = await verifyDraft(draft, ev, { lawSource: src, onStep: (e) => steps.push(e) });

    expect(src.verifyStatutes).toHaveBeenCalledWith(["민법 제536조"]);
    expect(src.verifyCases).not.toHaveBeenCalled();
    expect(steps).toEqual([expect.objectContaining({ stage: "verify", added: ["민법 제536조"] })]);
    expect(out.result.answer.points[0].check).toBe("verified");
    expect(out.result.recheck).toEqual({
      ok: true,
      items: [{ citation: "민법 제536조", exists: true }],
    });
  });

  test("F-006 AC2 재조회가 실패하면 결과를 내지 않고 검색 실패를 올린다", async () => {
    const { ev, draft } = setup();
    const src = source(async () => {
      throw new ApiError("SEARCH_UPSTREAM_FAILED", { stage: "verify" });
    });
    await expect(verifyDraft(draft, ev, { lawSource: src })).rejects.toMatchObject({
      code: "SEARCH_UPSTREAM_FAILED",
    });
  });

  test("문단이 없으면 재조회하지 않는다", async () => {
    const { ev, draft } = setup();
    const src = source(async () => []);
    const out = await verifyDraft({ ...draft, answer: { points: [] } }, ev, { lawSource: src });
    expect(src.verifyStatutes).not.toHaveBeenCalled();
    expect(out.result.outcome).toBe("no_result_in_scope");
  });
});
