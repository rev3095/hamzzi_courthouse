// @vitest-environment node
// 무료 모드 (DEC-015): 예시 질문 재생과 법제처 검색 전용. Claude를 부르지 않는다.
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { runFreeAnalysis } = await import("@/lib/demo/free");
const { ApiError } = await import("@/lib/api/errors");
const { AI_NOTICE } = await import("@/lib/api/respond");
const { demoExamples, findExample, replayCitations, searchSentence, caseQueriesFrom } =
  await import("@/lib/demo/policy");
import type { StepEvent } from "@/lib/ai/policy";
import type { LawSource } from "@/lib/search/law-source";
import type { ArticleHit, CaseDetail } from "@/lib/search/types";

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제3조의3",
  lawName: "주택임대차보호법",
  articleNo: "제3조의3",
  title: "임차권등기명령",
  text: "임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차권등기명령을 신청할 수 있다.",
  effectiveFrom: null,
  sourceUrl: "https://www.law.go.kr",
};
const CASE: CaseDetail = {
  id: "111",
  caseNo: "2020다12345",
  caseName: "임대차보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
  holding: "보증금 반환",
  summary: "요지",
  refs: null,
  fromBody: false,
  bodyExcerpt: null,
};

function source(over: Partial<LawSource> = {}): LawSource {
  return {
    searchArticles: vi.fn(async () => [ART]),
    findArticles: vi.fn(async () => []),
    getArticle: vi.fn(async () => null),
    searchCases: vi.fn(async () => [CASE]),
    getCase: vi.fn(async () => CASE),
    verifyStatutes: vi.fn(async () => []),
    verifyCases: vi.fn(async () => []),
    ...over,
  };
}

describe("DEC-015 예시 질문 재생", () => {
  test("예시 질문은 공백·전각 차이를 무시하고 찾고, 오류가 지적된 예시는 목록에 없다", () => {
    const list = demoExamples();
    expect(list.length).toBe(10);
    expect(list.map((e) => e.id)).not.toContain("wage-01");
    expect(list.map((e) => e.id)).not.toContain("trap-assertive");
    const q = list[0].question;
    expect(findExample(`  ${q.replace(/ /g, "  ")} `)?.id).toBe(list[0].id);
    expect(findExample("전혀 다른 질문입니다")).toBeNull();
  });

  test("예시는 법제처를 부르지 않고 저장된 검증 결과를 재생한다", async () => {
    const src = source();
    const steps: StepEvent[] = [];
    const out = await runFreeAnalysis(demoExamples()[0].question, {
      lawSource: src,
      onStep: (e) => steps.push(e),
    });
    expect(out.model).toBe("replay");
    expect(out.result.mode).toBe("replay");
    expect(out.result.aiNotice).toBe(AI_NOTICE);
    expect(out.result.answer.points.length).toBeGreaterThan(0);
    expect(src.searchArticles).not.toHaveBeenCalled();
    expect(steps.map((s) => s.stage)).toEqual(["answer"]);
  });

  test("F-005 재생 결과의 인용 행: 검증 통과 문단만 verified, 구절 60자 이내 (DEC-007)", () => {
    const ex = findExample(demoExamples()[0].question)!;
    const rows = replayCitations({ ...ex.result, mode: "replay" });
    expect(rows.length).toBe(ex.result.answer.points.length);
    for (const r of rows) {
      expect(r.source).toBe("law_open_api_live");
      expect(r.sourceRef).toMatch(/^(law|case):/);
      if (r.quote) expect(r.quote.length).toBeLessThanOrEqual(60);
    }
  });

  test("8.4 모든 재생 예시는 단정 표현이 없고 AI 고지가 고정 문구다", async () => {
    const { isAssertive } = await import("@/lib/ai/policy");
    for (const e of demoExamples()) {
      const r = findExample(e.question)!.result;
      expect(r.answer.points.some((p) => isAssertive(p.text))).toBe(false);
      expect(r.aiNotice).toBe(AI_NOTICE);
    }
  });
});

describe("DEC-015 법제처 검색 전용", () => {
  test("자유 질문은 질문 문장으로 조문을, 조문 제목으로 판례를 찾고 답변 문단 없이 돌려준다", async () => {
    const src = source();
    const out = await runFreeAnalysis("집주인이 [이름1] 보증금을 안 돌려줘요. 어떻게 하나요?", {
      lawSource: src,
    });
    expect(out.model).toBe("search_only");
    expect(out.result).toMatchObject({ mode: "search_only", outcome: "grounded" });
    expect(out.result.answer.points).toEqual([]);
    expect(out.citations).toEqual([]);
    // 마스킹 표시는 빼고 보낸다
    expect(src.searchArticles).toHaveBeenCalledWith(
      "집주인이 보증금을 안 돌려줘요. 어떻게 하나요?",
      5,
    );
    expect(src.searchCases).toHaveBeenCalledWith("임차권등기명령", 6);
    expect(out.result.articles[0]).toMatchObject({ lawName: "주택임대차보호법", used: false });
    expect(out.result.cases[0]).toMatchObject({ caseNo: "2020다12345", used: false });
  });

  test("F-007 개인정보가 남은 문장은 법제처로 보내지 않고 결과 없음", async () => {
    expect(searchSentence("연락처 010-1234-5678로 보증금 문의")).toBeNull();
    const src = source();
    const out = await runFreeAnalysis("연락처 010-1234-5678로 보증금 문의합니다", {
      lawSource: src,
    });
    expect(src.searchArticles).not.toHaveBeenCalled();
    expect(out.result.outcome).toBe("no_result_in_scope");
  });

  test("F-006 AC2 검색이 모두 실패하면 검색 실패", async () => {
    const fail = vi.fn(async () => {
      throw new ApiError("SEARCH_UPSTREAM_FAILED");
    });
    await expect(
      runFreeAnalysis("보증금을 돌려받지 못하고 있습니다", {
        lawSource: source({ searchArticles: fail, searchCases: fail }),
      }),
    ).rejects.toMatchObject({ code: "SEARCH_UPSTREAM_FAILED" });
  });

  test("판례 검색어는 조문 제목에서 중복 없이 최대 2개", () => {
    expect(
      caseQueriesFrom([
        ART,
        { ...ART, id: "x" },
        { ...ART, title: "대항력 등" },
        { ...ART, title: "기타" },
      ]),
    ).toEqual(["임차권등기명령", "대항력 등"]);
  });
});
