import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { demoExamples, findExample, replayResult } from "@/lib/demo/policy";
import { classifyCase, evidenceSummary, josaEulReul, procedurePlan, recommendText } from "./policy";
import { DOCUMENT_SPECS } from "@/lib/documents/policy";
import { ALL_STEPS, DIFFICULTY_LABEL, OFFICIAL, PROCEDURE_NOTICE } from "./steps";

const example = (id: string) => {
  const e = demoExamples().find((x) => x.id === id)!;
  return { question: e.question, result: replayResult(findExample(e.question)!) };
};

const bare = (laws: string[], area = "") => ({
  intent: { area, goal: "", laws, lawKeywords: [] },
  articles: laws.map((l, i) => ({
    id: `law:${l}:제${i + 1}조`,
    lawName: l,
    articleNo: `제${i + 1}조`,
    title: "",
    effectiveFrom: null,
    sourceUrl: "https://www.law.go.kr/",
    used: false,
  })),
});

/** 아라비아 숫자, 또는 낱말 첫머리의 한글 수사 + 기간·금액 단위 ("삼 년", "십 일", "칠만 원") */
const NUMBER =
  /[0-9０-９]|(?:^|[^가-힣])[일이삼사오육칠팔구십백천만]+\s*(?:일|주|개월|년|원)(?![가-힣])/;

/** 화면에 나갈 수 있는 모든 고정 문구: 단계·유형 안내·추천 이유·문서 안내 */
function allFixedTexts(): string[] {
  const plans = [
    procedurePlan(bare(["민법", "형법"]), "중고거래로 보낸 돈을 못 받았어요"),
    procedurePlan(bare(["주택임대차보호법"]), "전세 보증금을 돌려받지 못했어요"),
    procedurePlan(bare(["근로기준법"]), null),
    procedurePlan(bare(["형법"]), "처벌할 수 있나요"),
    procedurePlan(bare(["민법"]), "소장을 받았어요"),
    procedurePlan(bare(["민법"]), null),
  ];
  return [
    ...ALL_STEPS.flatMap((s) => [s.label, s.question, ...s.prepare, ...s.cautions]),
    ...plans.flatMap((p) =>
      p.kind === "timeline"
        ? [p.reason, p.note ?? "", recommendText(p.recommended)]
        : [p.title, p.body],
    ),
    ...Object.values(DOCUMENT_SPECS).flatMap((d) => [
      d.intro,
      ...d.tips,
      ...d.fields.flatMap((f) => [f.label, f.hint ?? ""]),
    ]),
    PROCEDURE_NOTICE,
  ].filter(Boolean);
}

describe("F-014 절차 단계 상수 (DEC-021)", () => {
  const texts = allFixedTexts();

  test("숫자 검출기가 한글 수사도 잡는다", () => {
    for (const t of ["삼 년 안에", "십 일 이내", "칠만 원", "7일"]) expect(t).toMatch(NUMBER);
    for (const t of ["있었던 일", "답변·이행 기한", "○일 이내"]) expect(t).not.toMatch(NUMBER);
  });

  test("절대 규칙 3 고정 문구(단계·유형 안내·문서 안내)에 기간·비용 숫자가 없다", () => {
    for (const t of texts) expect(t, t).not.toMatch(NUMBER);
  });

  test("N1 단정 표현·승패 판단 표현이 없다", () => {
    for (const t of texts) {
      expect(isAssertive(t), t).toBe(false);
      expect(t).not.toMatch(/승소|패소|이길|가능성|확률|승률|유리|불리/);
    }
  });

  test("DEC-002 모든 단계에 난이도 라벨·준비물·주의점·공식 링크가 있다", () => {
    for (const s of ALL_STEPS) {
      expect(DIFFICULTY_LABEL[s.difficulty]).toBeTruthy();
      expect(s.prepare.length).toBeGreaterThan(0);
      expect(s.cautions.length).toBeGreaterThan(0);
      expect(s.links.length).toBeGreaterThan(0);
    }
  });

  test("공식 안내 링크는 정부·법원·공공기관 https 주소만", () => {
    for (const l of Object.values(OFFICIAL))
      expect(l.url).toMatch(/^https:\/\/[a-z.-]+\.(go|or)\.kr$/);
  });
});

describe("F-014 사건 유형 분류 (규칙)", () => {
  test("보증금 반환 질문은 주택 임대차 타임라인, 첫 추천은 내용증명", () => {
    const { question, result } = example("lease-01");
    const plan = procedurePlan(result, question);
    expect(plan.kind).toBe("timeline");
    if (plan.kind !== "timeline") return;
    expect(plan.caseType).toBe("lease_deposit");
    expect(plan.steps.map((s) => s.key)).toContain("lease_registration");
    expect(plan.recommended.key).toBe("notice");
  });

  test("계약금 반환 질문은 민사 금전 타임라인", () => {
    for (const id of ["deposit-01", "deposit-02"]) {
      const { question, result } = example(id);
      expect(classifyCase(result, question), id).toBe("money");
    }
  });

  test("임금·퇴직금·해고는 타임라인 대신 유형 안내", () => {
    for (const id of ["wage-02", "trap-number"]) {
      const { question, result } = example(id);
      const plan = procedurePlan(result, question);
      expect(plan.kind, id).toBe("notice");
      if (plan.kind === "notice") expect(plan.caseType).toBe("labor");
    }
  });

  test("형사·민사가 겹친 사기 질문은 민사 타임라인 + 형사 고소 별도 안내", () => {
    const { question, result } = example("fraud-01");
    const plan = procedurePlan(result, question);
    expect(plan.kind).toBe("timeline");
    if (plan.kind === "timeline") expect(plan.note).toMatch(/고소/);
  });

  test("형법만 찾은 질문은 형사 안내", () => {
    expect(classifyCase(bare(["형법"]), "돈을 뜯겼어요 처벌할 수 있나요")).toBe("criminal");
  });

  test("소장·지급명령을 받은 쪽(갚아야 하는 쪽)은 범위 밖 안내 — 돈 받는 쪽 타임라인을 보이지 않는다", () => {
    for (const q of [
      "대여금 소장을 받았어요. 돈을 갚아야 하나요?",
      "지급명령이 왔어요 돈을 갚아야 하나요",
      "지급명령 정본을 송달받았어요",
      "소송을 당했어요 대여금 갚으래요",
      "손해배상 청구 소장이 날아왔어요",
      "제가 피고가 됐는데 어떻게 하나요",
      "돈을 갚으라는데 안 갚아도 되나요",
      "보증금 돌려달라는 내용증명을 받았어요",
    ]) {
      expect(classifyCase(bare(["민법", "주택임대차보호법"]), q), q).toBe("defendant");
      expect(procedurePlan(bare(["민법"]), q).kind, q).toBe("notice");
    }
  });

  test("받는 쪽인지 갚는 쪽인지 알 수 없으면 타임라인을 숨긴다", () => {
    expect(
      classifyCase(bare(["민법"]), "빌려준 돈을 달라고 했더니 오히려 저보고 물어내라고 해요"),
    ).toBe("other");
  });

  test("상가 임대차 보증금은 주택용 임차권등기명령 단계 없이 일반 금전 절차", () => {
    expect(
      classifyCase(bare(["상가건물임대차보호법", "민법"]), "상가 월세 보증금을 못 받았어요"),
    ).toBe("money");
  });

  test("질문 문장이 없고 돈 문제인지 알 수 없으면 타임라인을 숨긴다", () => {
    expect(procedurePlan(bare(["민법"]), null).kind).toBe("notice");
  });

  test("무료 모드 검색 결과도 질문 문장이 있으면 분류한다", () => {
    expect(classifyCase(bare(["민법"]), "친구에게 빌려준 돈을 못 받고 있어요")).toBe("money");
  });

  test("모든 예시 질문에서 계획이 만들어지고 안내 문구에 단정 표현이 없다", () => {
    for (const e of demoExamples()) {
      const plan = procedurePlan(replayResult(findExample(e.question)!), e.question);
      const texts =
        plan.kind === "timeline" ? [plan.reason, plan.note ?? ""] : [plan.title, plan.body];
      for (const t of texts) expect(isAssertive(t), t).toBe(false);
    }
  });
});

describe("F-014 결과 머리 요약", () => {
  test("답변이 있으면 인용한 근거 개수, 검색 전용이면 찾은 개수 — 확률은 없다", () => {
    const { result } = example("lease-01");
    expect(evidenceSummary(result)).toMatch(/^근거 판례 \d+건 · 관련 조문 \d+개$/);
    const searchOnly = { ...result, answer: { points: [] } };
    expect(evidenceSummary(searchOnly)).toBe(
      `찾은 판례 ${result.cases.length}건 · 찾은 조문 ${result.articles.length}개`,
    );
  });

  test("추천 문장 조사", () => {
    expect(recommendText({ label: "내용증명" })).toBe(
      "현재 위 내용을 기반으로 먼저 내용증명을 추천드립니다",
    );
    expect(josaEulReul("증거 정리")).toBe("를");
    expect(josaEulReul("소송 (소장·변론)")).toBe("을");
  });
});
