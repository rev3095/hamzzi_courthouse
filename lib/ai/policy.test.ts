import { describe, expect, test } from "vitest";
import { AI_NOTICE } from "@/lib/api/respond";
import { EvidenceSet } from "@/lib/search/evidence";
import type { ArticleHit, CaseDetail, CaseHit } from "@/lib/search/types";
import { userMessage } from "./message";
import {
  answerSchema,
  assembleDraft,
  citableKeys,
  isAssertive,
  recentContext,
  safeQuery,
  screenIntent,
  screenPoints,
  uniqueQueries,
  type Intent,
} from "./policy";

const article: ArticleHit = {
  id: "law:주택임대차보호법:제3조의2",
  lawName: "주택임대차보호법",
  articleNo: "제3조의2",
  title: "보증금의 회수",
  text: "임차인은 임차주택을 양수인에게 인도하지 아니하면 보증금을 받을 수 없다. 임대차가 끝난 후 2년 이내에 청구한다.",
  effectiveFrom: "2023-07-19",
  sourceUrl: "https://www.law.go.kr/법령/주택임대차보호법/제3조의2",
};

const caseDetail: CaseDetail = {
  id: "111",
  caseNo: "2020다12345",
  caseName: "임대차보증금반환",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: "https://www.law.go.kr/precedent/111",
  holding: "임대차 종료 후 보증금 반환 의무와 목적물 인도 의무의 관계",
  summary: "임대인의 보증금 반환 의무와 임차인의 목적물 반환 의무는 동시이행 관계에 있다.",
  refs: null,
  fromBody: false,
  bodyExcerpt: null,
};

const caseHit: CaseHit = {
  id: "222",
  caseNo: "2019나999",
  caseName: "손해배상",
  court: "서울고등법원",
  decidedAt: null,
  sourceUrl: "https://www.law.go.kr/precedent/222",
};

function evidence() {
  const ev = new EvidenceSet();
  ev.addArticle(article);
  ev.addCase(caseDetail);
  ev.addCase(caseHit);
  return ev;
}

const intent: Intent = {
  area: "주택임대차",
  goal: "보증금을 돌려받는 방법",
  laws: ["주택임대차보호법"],
  lawKeywords: ["임대차보증금 반환"],
  articleRefs: [],
};

describe("F-002 AC3 이어 묻기 맥락", () => {
  test("최근 3개만, 길면 자른다", () => {
    const turns = Array.from({ length: 5 }, (_, i) => ({
      question: `질문${i}`,
      answer: "가".repeat(700),
    }));
    const ctx = recentContext(turns);
    expect(ctx.map((t) => t.question)).toEqual(["질문2", "질문3", "질문4"]);
    expect(ctx[0].answer.length).toBe(601);
  });

  test("메시지에 이전 대화와 이번 질문을 나눠 넣는다", () => {
    const msg = userMessage("이번 질문", [{ question: "앞 질문", answer: "앞 답변" }]);
    expect(msg).toContain("<이전_대화>");
    expect(msg.indexOf("앞 질문")).toBeLessThan(msg.indexOf("<질문>"));
    expect(userMessage("이번 질문", [])).not.toContain("<이전_대화>");
  });
});

describe("F-007 검색어 PII 재검사", () => {
  test("개인정보가 섞인 검색어는 버린다", () => {
    expect(safeQuery("010-1234-5678 보증금")).toBeNull();
    expect(safeQuery("임대차보증금   반환")).toBe("임대차보증금 반환");
    expect(safeQuery(" ")).toBeNull();
    expect(safeQuery(42)).toBeNull();
  });

  test("중복을 빼고 개수를 제한한다", () => {
    expect(uniqueQueries(["a b", "a  b", "c d", "e f"], 2)).toEqual(["a b", "c d"]);
  });
});

describe("F-005 답변 문단 1차 거르기", () => {
  const ev = evidence();
  const quote = "임대인의 보증금 반환 의무와 임차인의 목적물 반환 의무는";

  test("근거 키 밖 출처는 뺀다", () => {
    const r = screenPoints([{ text: "설명", source: "case:2099다99999", quote }], ev);
    expect(r.kept).toEqual([]);
    expect(r.dropped).toEqual(["unknown_source"]);
  });

  test("N1 단정 표현은 뺀다", () => {
    const r = screenPoints(
      [
        { text: "반드시 돌려받습니다.", source: "case:2020다12345", quote },
        { text: "100% 승소합니다.", source: "case:2020다12345", quote },
      ],
      ev,
    );
    expect(r.dropped).toEqual(["assertive", "assertive"]);
  });

  test("원문에 없는 숫자는 빼고, 원문에 있는 숫자·조문번호·사건번호는 둔다", () => {
    const r = screenPoints(
      [
        { text: "보통 37일 안에 돌려받습니다.", source: article.id, quote: "x" },
        {
          text: "주택임대차보호법 제3조의2는 임대차가 끝난 후 2년 이내 청구를 정합니다. 2020다12345 판례도 같은 취지입니다.",
          source: article.id,
          quote: "x",
        },
      ],
      ev,
    );
    expect(r.dropped).toEqual(["number_not_in_source"]);
    expect(r.kept).toHaveLength(1);
  });

  test("출처로 쓸 수 있는 키는 조문과 요지를 가져온 판례뿐이다", () => {
    expect(citableKeys(ev)).toEqual([article.id, "case:2020다12345"]);
  });

  test("답변 스키마의 출처는 근거 키 enum이다", () => {
    const schema = answerSchema(["law:a:제1조"]);
    expect(schema.properties.points.items.properties.source.enum).toEqual(["law:a:제1조"]);
  });
});

describe("검증 전 초안 조립", () => {
  test("쓰인 근거에 used 표시, AI 고지는 상수", () => {
    const draft = assembleDraft({
      maskedText: "보증금 질문",
      intent,
      points: [{ text: "설명", source: article.id, quote: "q" }],
      evidence: evidence(),
      searches: [{ keyword: "임대차보증금 반환", total: 3 }],
      trace: [],
    });
    expect(draft.outcome).toBe("grounded");
    expect(draft.aiNotice).toBe(AI_NOTICE);
    expect(draft.articles[0].used).toBe(true);
    expect(draft.cases.map((c) => [c.caseNo, c.used, c.fromBody])).toEqual([
      ["2020다12345", false, false],
      ["2019나999", false, false],
    ]);
    expect(draft.intent).not.toHaveProperty("articleRefs");
  });

  test("F-006 남은 문단이 없으면 no_result_in_scope", () => {
    const draft = assembleDraft({
      maskedText: "보증금 질문",
      intent,
      points: [],
      evidence: new EvidenceSet(),
      searches: [],
      trace: [],
    });
    expect(draft.outcome).toBe("no_result_in_scope");
  });
});

describe("legal-reviewer 지적 보강 (절대 규칙 1·2·3, F-007)", () => {
  const ev = evidence();
  const pt = (text: string, source = article.id) => ({ text, source, quote: "x" });

  test("규칙 1 본문에 근거에 없는 사건번호·조문번호를 쓰면 뺀다", () => {
    const r = screenPoints(
      [
        pt("대법원 2019다54321 판결도 같은 취지입니다."),
        pt("민법 제750조에 따라 손해배상을 청구할 수 있습니다."),
        pt("대법원 2020다12345 판결은 동시이행 관계로 봤습니다."),
      ],
      ev,
    );
    expect(r.dropped).toEqual(["unknown_citation", "unknown_citation"]);
    expect(r.kept).toHaveLength(1);
  });

  test("규칙 1 상세(요지)를 못 가져온 판례는 출처로 쓸 수 없다", () => {
    expect(screenPoints([pt("설명", "case:2019나999")], ev).dropped).toEqual(["unknown_source"]);
  });

  test("규칙 3 숫자는 단위까지 토큰으로 비교한다 (원문의 제3조로 3년을 통과시키지 않음)", () => {
    // 원문: "제3조의2 … 2년 이내에 청구한다"
    expect(screenPoints([pt("3년 안에 청구해야 합니다.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
    expect(screenPoints([pt("2개월 안에 청구해야 합니다.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
    expect(screenPoints([pt("2년 이내에 청구합니다.")], ev).kept).toHaveLength(1);
  });

  test("규칙 3 기간·금액 표현이 사건번호로 오인돼 검사를 건너뛰지 않는다", () => {
    expect(screenPoints([pt("10년 6개월이 지나면 소멸합니다.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
    expect(screenPoints([pt("100만원 200만원을 돌려받습니다.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
  });

  test("규칙 3 한글 수사·전각 숫자도 검사한다, '이해' 같은 낱말은 건드리지 않는다", () => {
    expect(screenPoints([pt("삼 년 안에 청구하세요.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
    expect(screenPoints([pt("열흘 안에 답이 옵니다.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
    expect(screenPoints([pt("３년 안에 청구하세요.")], ev).dropped).toEqual([
      "number_not_in_source",
    ]);
    expect(screenPoints([pt("임차인이 이해하기 쉽게 정리하면 이렇습니다.")], ev).kept).toHaveLength(
      1,
    );
  });

  test("규칙 2 단정 표현 어간·전각 기호까지 잡는다", () => {
    for (const t of [
      "틀림없습니다.",
      "100％ 돌려받아요.",
      "백 퍼센트입니다.",
      "승소합니다.",
      "확실합니다.",
    ]) {
      expect(isAssertive(t)).toBe(true);
    }
    expect(isAssertive("돌려받을 수 있는지는 사정에 따라 다릅니다.")).toBe(false);
  });

  test("의도 요약도 단정 표현·지어낸 숫자를 비우고, 관련 법률은 근거로 가져온 법령만 남긴다", () => {
    const out = screenIntent(
      {
        ...intent,
        goal: "3년 안에 반드시 돌려받는 방법",
        laws: ["주택임대차보호법", "상가건물 임대차보호법"],
      },
      "보증금을 안 돌려줘요",
      ev,
    );
    expect(out.goal).toBe("");
    expect(out.area).toBe("주택임대차");
    expect(out.laws).toEqual(["주택임대차보호법"]);
  });

  test("F-007 마스킹 표시가 섞인 검색어는 버리고, 민감 범주 법률 용어는 막지 않는다", () => {
    expect(safeQuery("[이름1] 임대차")).toBeNull();
    expect(safeQuery("집행유예 실효")).toBe("집행유예 실효");
  });
});
