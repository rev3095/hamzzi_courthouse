import { describe, expect, test } from "vitest";
import type { DemoDraft } from "@/lib/ai/policy";
import { AI_NOTICE } from "@/lib/api/respond";
import { EvidenceSet } from "@/lib/search/evidence";
import type { ArticleHit, CaseDetail, CitationCheck } from "@/lib/search/types";
import { assembleResult, claimForKey, claimsInText, quoteMatches, uniqueClaims } from "./policy";

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제3조의2",
  lawName: "주택임대차보호법",
  articleNo: "제3조의2",
  title: "보증금의 회수",
  text: "임차인은 임차주택을 양수인에게 인도하지 아니하면 보증금을 받을 수 없다.",
  effectiveFrom: "2023-07-19",
  sourceUrl: "https://www.law.go.kr/법령/주택임대차보호법/제3조의2",
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
  refs: "민법 제536조",
  fromBody: false,
  bodyExcerpt: null,
};
const CASE_QUOTE = "임대인의 보증금 반환 의무와 임차인의 목적물 반환 의무는";
const ART_QUOTE = "임차주택을 양수인에게 인도하지 아니하면 보증금을 받을 수 없다";

function evidence() {
  const ev = new EvidenceSet();
  ev.addArticle(ART);
  ev.addCase(CASE);
  return ev;
}

function draft(points: DemoDraft["answer"]["points"]): DemoDraft {
  return {
    outcome: "grounded",
    aiNotice: AI_NOTICE,
    intent: { area: "주택임대차", goal: "보증금", laws: [], lawKeywords: [] },
    answer: { points },
    articles: [{ ...ART, used: true }],
    cases: [{ ...CASE, fromBody: false, used: true }],
    searches: [],
    trace: [],
    searchScopeNote: "",
  };
}

const ok = (citation: string): CitationCheck => ({ citation, exists: true });
const checks = (...list: CitationCheck[]) => new Map(list.map((c) => [c.citation, c]));

describe("F-005 AC2 ② 원문 구절 대조", () => {
  test("글자 그대로 있으면 일치, 공백·전각 차이는 무시한다", () => {
    expect(quoteMatches(CASE_QUOTE, CASE.summary!)).toBe(true);
    expect(quoteMatches(CASE_QUOTE.replace(/ /g, "  "), CASE.summary!)).toBe(true);
  });

  test("한 글자라도 다르거나 20~60자를 벗어나면 불일치", () => {
    expect(quoteMatches(CASE_QUOTE.replace("의무와", "의무랑"), CASE.summary!)).toBe(false);
    expect(quoteMatches("보증금 반환", CASE.summary!)).toBe(false);
    expect(quoteMatches(CASE.summary!.repeat(2), CASE.summary!.repeat(2))).toBe(false);
  });
});

describe("F-005 AC2 ③ 재조회 대상", () => {
  test("근거 키를 법령명+조문, 사건번호로 바꾼다", () => {
    const ev = evidence();
    expect(claimForKey(ART.id, ev)).toEqual({
      kind: "statute",
      citation: "주택임대차보호법 제3조의2",
    });
    expect(claimForKey("case:2020다12345", ev)).toEqual({ kind: "case", citation: "2020다12345" });
    expect(claimForKey("case:2099다1", ev)).toBeNull();
  });

  test("본문 조문에는 앞의 법령 이름을 붙이고, 정할 수 없으면 unresolved", () => {
    const ev = evidence();
    expect(claimsInText("주택임대차보호법 제3조의2와 민법 제536조, 2020다12345 판결", ev)).toEqual({
      claims: [
        { kind: "case", citation: "2020다12345" },
        { kind: "statute", citation: "주택임대차보호법 제3조의2" },
        { kind: "statute", citation: "민법 제536조" },
      ],
      unresolved: [],
    });
    // 법령 이름이 없어도 번호가 같은 근거 조문이 하나면 그 법령
    expect(claimsInText("제3조의2에 따르면", ev).claims).toEqual([
      { kind: "statute", citation: "주택임대차보호법 제3조의2" },
    ]);
    expect(claimsInText("이 조항(제9조)에 따르면", ev).unresolved).toEqual(["제9조"]);
  });

  test("중복 없이 종류별로 모은다", () => {
    expect(
      uniqueClaims([
        { kind: "case", citation: "2020다1" },
        { kind: "case", citation: "2020다1" },
        { kind: "statute", citation: "민법 제1조" },
      ]),
    ).toEqual({ statutes: ["민법 제1조"], cases: ["2020다1"] });
  });
});

describe("F-005 AC2 최종 결과 조립", () => {
  test("모두 확인되면 verified, 구절만 다르면 quote_mismatch로 남긴다", () => {
    const ev = evidence();
    const { result, citations, stats } = assembleResult({
      draft: draft([
        {
          text: "대법원은 동시이행 관계로 봤습니다.",
          source: "case:2020다12345",
          quote: CASE_QUOTE,
        },
        {
          text: "집을 넘겨야 보증금을 받습니다.",
          source: ART.id,
          quote: "원문에 없는 구절을 지어낸 것입니다 스무자 넘게",
        },
      ]),
      evidence: ev,
      checks: checks(ok("2020다12345"), ok("주택임대차보호법 제3조의2")),
    });
    expect(result.answer.points.map((p) => p.check)).toEqual(["verified", "quote_mismatch"]);
    // 원문과 다른 구절(모델이 만든 문장)은 화면·DB에 내보내지 않는다
    expect(result.answer.points[1].quote).toBe("");
    expect(citations[1].quote).toBeNull();
    expect(result.outcome).toBe("grounded");
    expect(result.recheck.ok).toBe(true);
    expect(citations.map((c) => [c.kind, c.claimedRef, c.status])).toEqual([
      ["case", "2020다12345", "verified"],
      ["statute", "주택임대차보호법 제3조의2", "unverified"],
    ]);
    expect(citations.every((c) => c.source === "law_open_api_live" && c.sourceRef)).toBe(true);
    expect(stats).toMatchObject({ total: 2, removed: 0, quoteMismatch: 1 });
  });

  test("① 근거에 없는 출처, ③ 부존재·판정 불가 인용이 있는 문단은 뺀다", () => {
    const ev = evidence();
    const { result, citations, stats } = assembleResult({
      draft: draft([
        { text: "설명", source: "case:2099다1", quote: CASE_QUOTE },
        { text: "대법원 판단입니다.", source: "case:2020다12345", quote: CASE_QUOTE },
        { text: "주택임대차보호법 제3조의2에 따릅니다.", source: ART.id, quote: ART_QUOTE },
        { text: "민법 제536조도 봅니다.", source: ART.id, quote: ART_QUOTE },
      ]),
      evidence: ev,
      checks: checks(
        { citation: "2020다12345", exists: false, note: "사건번호 없음" },
        ok("주택임대차보호법 제3조의2"),
        { citation: "민법 제536조", exists: null, note: "확인 필요" },
      ),
      screened: 2,
    });
    expect(result.answer.points.map((p) => p.text)).toEqual([
      "주택임대차보호법 제3조의2에 따릅니다.",
    ]);
    expect(citations.map((c) => c.status)).toEqual(["removed", "removed", "verified", "removed"]);
    expect(stats).toEqual({
      total: 6,
      removed: 5,
      quoteMismatch: 0,
      removedBy: { not_in_evidence: 1, not_confirmed: 2, screened: 2 },
    });
    expect(result.recheck.ok).toBe(false);
    // 검증 탭에는 남은 문단이 쓴(확인된) 인용만. 미확인 조문·사건번호 문자열은 내보내지 않는다
    expect(result.recheck.items).toEqual([{ citation: "주택임대차보호법 제3조의2", exists: true }]);
    expect(result.cases[0].used).toBe(false);
    expect(result.articles[0].used).toBe(true);
  });

  test("F-006 남은 문단이 없으면 no_result_in_scope", () => {
    const { result } = assembleResult({
      draft: draft([{ text: "설명", source: "case:2020다12345", quote: CASE_QUOTE }]),
      evidence: evidence(),
      checks: checks({ citation: "2020다12345", exists: null }),
    });
    expect(result.outcome).toBe("no_result_in_scope");
    expect(result.answer.points).toEqual([]);
  });
});

describe("legal-reviewer 지적 보강 (F-005 ③ 법령명 연결·추출 빈틈)", () => {
  const ev = new EvidenceSet();
  ev.addArticle({ ...ART, id: "law:민법:제3조", lawName: "민법", articleNo: "제3조" });
  ev.addArticle({
    ...ART,
    id: "law:상가건물 임대차보호법:제10조",
    lawName: "상가건물 임대차보호법",
    articleNo: "제10조",
  });
  const cites = (text: string) => claimsInText(text, ev);

  test("근거 법령명이 다른 법령명의 꼬리일 때 붙이지 않는다 (난민법 ≠ 민법)", () => {
    expect(cites("난민법 제3조에 따르면").claims).toEqual([
      { kind: "statute", citation: "난민법 제3조" },
    ]);
  });

  test("「」·괄호를 벗기고, 법령명에 붙은 조문·공백 있는 법령명도 연결한다", () => {
    expect(cites("「민법」 제3조").claims).toEqual([{ kind: "statute", citation: "민법 제3조" }]);
    expect(cites("민법제3조").claims).toEqual([{ kind: "statute", citation: "민법 제3조" }]);
    expect(cites("상가건물 임대차보호법 제10조").claims).toEqual([
      { kind: "statute", citation: "상가건물 임대차보호법 제10조" },
    ]);
  });

  test("시행령은 근거 법령으로 대체하지 않는다", () => {
    expect(cites("민사집행법 시행령 제3조").claims).toEqual([
      { kind: "statute", citation: "민사집행법 시행령 제3조" },
    ]);
    // 다른 법령명이 적혀 있으면 번호가 같은 근거 조문으로 대체하지 않는다
    expect(cites("동법 제3조").claims).toEqual([{ kind: "statute", citation: "동법 제3조" }]);
  });

  test("'제' 없는 조문, 1자리 일련번호·타경·재심·병합 사건번호도 뽑는다", () => {
    expect(cites("민법 3조").claims).toEqual([{ kind: "statute", citation: "민법 제3조" }]);
    expect(cites("2020도1, 2021타경1234, 2019재다12, 2020다12345, 12346").claims).toEqual([
      { kind: "case", citation: "2020도1" },
      { kind: "case", citation: "2021타경1234" },
      { kind: "case", citation: "2019재다12" },
      { kind: "case", citation: "2020다12345" },
      { kind: "case", citation: "2020다12346" },
    ]);
  });

  test("조문이 아닌 낱말·기간 표현은 인용으로 보지 않는다", () => {
    expect(cites("피해액이 1조 원이고 10년 6개월, 100만원 3조각").claims).toEqual([]);
  });
});
