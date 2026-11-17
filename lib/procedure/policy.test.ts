import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { demoExamples, findExample, replayResult } from "@/lib/demo/policy";
import {
  classifyCase,
  evidenceSummary,
  josaEulReul,
  NOTICE_TEXTS,
  procedurePlan,
  recommendText,
  shortcutOf,
} from "./policy";
import { DOCUMENT_SPECS } from "@/lib/documents/policy";
import { ALL_STEPS, DIFFICULTY_LABEL, OFFICIAL, PROCEDURE_NOTICE, TRACKS } from "./steps";

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
    procedurePlan(bare(["근로기준법"]), "해고됐어요"),
    procedurePlan(bare(["형법"]), "처벌할 수 있나요"),
    procedurePlan(bare(["민법"]), "소장을 받았어요"),
    procedurePlan(bare(["민법"]), null),
  ];
  return [
    ...ALL_STEPS.flatMap((s) => [s.label, s.question, ...s.prepare, ...s.cautions]),
    ...Object.values(TRACKS).flatMap((t) => [t.section, t.title, t.reason, t.note ?? ""]),
    ...NOTICE_TEXTS,
    ...plans.flatMap((p) =>
      p.kind === "timeline"
        ? [p.reason, p.note ?? "", recommendText(p.recommended)]
        : [p.title, p.body],
    ),
    ...Object.values(DOCUMENT_SPECS).flatMap((d) => [
      d.intro,
      ...d.tips,
      ...d.pages.flatMap((p) => [p.title, p.help ?? ""]),
      ...d.fields.flatMap((f) => [
        f.label,
        f.help ?? "",
        f.example ?? "",
        // 공식 서식 문구를 그대로 인용한 확약(officialNotice)은 고정 안내가 아니라 출처 있는 인용이라 뺀다
        ...(f.options ?? []).map((o) => o.label).filter((l) => l !== d.officialNotice?.text),
      ]),
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
      expect(l.url).toMatch(/^https:\/\/([a-z-]+\.)+(go\.kr|or\.kr|gov\.kr)$/);
  });
});

describe("F-014 섹션별 타임라인 분류 (규칙)", () => {
  // 홈 예시 질문 섹션마다 절차가 다르다 (DEC-021): 예시 10개가 각자 맞는 타임라인으로 간다
  test.each([
    ["lease-01", "lease_deposit", "임대차", "notice"],
    ["lease-02", "lease_residence", "임대차", "facts"],
    ["lease-03", "lease_residence", "임대차", "facts"],
    ["deposit-01", "contract_deposit", "계약금", "notice"],
    ["deposit-02", "contract_deposit", "계약금", "notice"],
    ["wage-02", "wage", "노동", "complaint"],
    ["trap-number", "dismissal", "노동", "remedy"],
    ["fraud-01", "fraud", "사기", "report"],
    ["other-01", "traffic", "교통사고", "records"],
    ["trap-vague", "neighbor", "이웃 분쟁", "talk"],
  ])("예시 %s → %s 타임라인 (섹션 %s, 먼저 %s)", (id, track, section, first) => {
    const { question, result } = example(id);
    const plan = procedurePlan(result, question);
    expect(plan.kind).toBe("timeline");
    if (plan.kind !== "timeline") return;
    expect(plan.caseType).toBe(track);
    expect(plan.section).toBe(section);
    expect(plan.recommended.key).toBe(first);
  });

  test("섹션 예시 분야(홈 피드 칩)와 타임라인 섹션 이름이 같다", () => {
    for (const e of demoExamples()) {
      const plan = procedurePlan(replayResult(findExample(e.question)!), e.question);
      if (plan.kind === "timeline") expect(plan.section, e.id).toBe(e.area);
    }
  });

  test("타임라인마다 단계 구성이 서로 다르다", () => {
    const shapes = Object.values(TRACKS).map((t) => t.steps.map((s) => s.label).join(">"));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  test("임차권등기명령은 주택 보증금 타임라인에만 있다", () => {
    const { question, result } = example("lease-01");
    const plan = procedurePlan(result, question);
    if (plan.kind === "timeline") {
      expect(plan.steps.map((s) => s.key)).toContain("lease_registration");
    }
    for (const t of Object.values(TRACKS).filter((t) => t.key !== "lease_deposit")) {
      expect(t.steps.map((s) => s.key)).not.toContain("lease_registration");
    }
  });

  test("질문 문장이 없어도 결과의 법령 이름으로 섹션을 고른다", () => {
    expect(classifyCase(bare(["근로자퇴직급여 보장법"]), null)).toBe("wage");
    expect(classifyCase(bare(["자동차손해배상 보장법", "민법"]), null)).toBe("traffic");
    expect(classifyCase(bare(["동물보호법", "민법"]), null)).toBe("neighbor");
  });

  test("바로 가기: 내용증명은 게이트 안내 화면, 그 밖에는 그 단계의 공식 창구", () => {
    expect(shortcutOf(TRACKS.lease_deposit.steps.find((s) => s.key === "notice")!)).toEqual({
      kind: "document",
      href: "/documents/demand-letter",
    });
    const wage = shortcutOf(TRACKS.wage.steps.find((s) => s.key === "complaint")!);
    expect(wage).toEqual({
      kind: "official",
      href: "https://www.moel.go.kr",
      label: "고용노동부 (임금체불 진정 안내)",
    });
    // 단계 이름과 어긋나는 곳으로 보내지 않는다: 정해 둔 창구가 없으면 바로 가기 카드 없음
    expect(shortcutOf(TRACKS.neighbor.steps.find((s) => s.key === "talk")!)).toBeNull();
    expect(shortcutOf(TRACKS.traffic.steps.find((s) => s.key === "records")!)).toBeNull();
  });

  test("형사·민사가 겹친 사기는 배상명령·민사 청구 단계와 별도 안내가 있다", () => {
    const { question, result } = example("fraud-01");
    const plan = procedurePlan(result, question);
    expect(plan.kind).toBe("timeline");
    if (plan.kind !== "timeline") return;
    expect(plan.steps.map((s) => s.key)).toEqual(
      expect.arrayContaining(["report", "compensation_order", "civil"]),
    );
    expect(plan.note).toMatch(/배상명령|민사/);
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

  test("갚거나 돌려줘야 하는 쪽(빌린 쪽·임대인·사업주·계약금을 받은 쪽)에게 반대쪽 절차를 보이지 않는다", () => {
    for (const q of [
      "친구한테 빌린 돈을 못 갚았는데 이자도 내야 하나요",
      "세입자에게 보증금을 언제 돌려줘야 하나요",
      "세입자가 안 나가요, 나가라고 했는데",
      "직원이 퇴직금 달라는데 줘야 하나요",
      "직원을 해고하려는데 어떻게 하나요",
      "계약금을 돌려줘야 하나요",
    ]) {
      expect(classifyCase(bare(["민법"]), q), q).toBe("defendant");
    }
  });

  test("상대방이 주어인 '돌려줘야 하나요'는 요구하는 쪽 질문으로 본다", () => {
    expect(
      classifyCase(
        bare(["주택임대차보호법"]),
        "계약이 끝났는데 집주인이 보증금을 언제까지 돌려줘야 하나요",
      ),
    ).toBe("lease_deposit");
  });

  test("고소·신고를 당했거나 사고를 낸 쪽은 피해자 타임라인 대신 수사 대응 안내", () => {
    for (const q of ["교통사고를 냈는데 형사처벌 받나요", "사기로 신고당했어요", "고소당했어요"]) {
      const plan = procedurePlan(bare(["형법", "민법"]), q);
      expect(plan.kind, q).toBe("notice");
      if (plan.kind === "notice") expect(plan.caseType, q).toBe("accused");
    }
  });

  test("전세사기는 중고거래 사기가 아니라 보증금 타임라인 + 고소 별도 안내", () => {
    for (const q of [
      "전세사기를 당한 것 같아요 보증금을 못 받았어요",
      "집주인이 연락이 끊겼어요 보증금은요",
    ]) {
      const plan = procedurePlan(bare(["주택임대차보호법"]), q);
      expect(plan.kind, q).toBe("timeline");
      if (plan.kind !== "timeline") continue;
      expect(plan.caseType, q).toBe("lease_deposit");
      expect(plan.note, q).toMatch(/고소/);
    }
  });

  test("빌려준 돈은 연락이 끊겨도 대여금 절차 + 고소 별도 안내", () => {
    const plan = procedurePlan(
      bare(["민법"]),
      "돈 빌려간 친구가 연락이 끊겼어요 빌려준 돈 받고 싶어요",
    );
    expect(plan.kind === "timeline" && plan.caseType).toBe("money");
    if (plan.kind === "timeline") expect(plan.note).toMatch(/고소/);
  });

  test("해고 낱말만으로 부당해고로 보내지 않는다 (피해구제신청·해고예고수당·퇴직금)", () => {
    expect(classifyCase(bare(["민법"]), "소비자원에 피해구제신청 했는데 환불을 안 해줘요")).toBe(
      "money",
    );
    expect(classifyCase(bare(["근로기준법"]), "해고예고수당을 못 받았어요")).toBe("wage");
    const plan = procedurePlan(bare(["근로기준법"]), "해고됐는데 퇴직금도 못 받았어요");
    expect(plan.kind === "timeline" && plan.caseType).toBe("wage");
    if (plan.kind === "timeline") expect(plan.note).toMatch(/구제신청/);
  });

  test("집이 팔린 뒤 보증금을 안 돌려주면 보증금 타임라인", () => {
    expect(
      classifyCase(
        bare(["주택임대차보호법"]),
        "집주인이 집을 팔았는데 새 집주인이 보증금을 안 돌려줘요",
      ),
    ).toBe("lease_deposit");
  });

  test("'중개가'·반려동물 낱말만으로 이웃 분쟁으로 보내지 않는다", () => {
    expect(
      classifyCase(bare(["주택임대차보호법"]), "중개가 잘못돼서 전세 보증금을 못 받았어요"),
    ).toBe("lease_deposit");
    expect(classifyCase(bare(["주택임대차보호법"]), "고양이 키운다고 집주인이 나가래요")).toBe(
      "lease_residence",
    );
  });

  test("DEC-021 자유 질문에서는 모델이 쓴 분야·목표 문장을 분류에 쓰지 않는다", () => {
    const r = {
      ...bare(["민법"]),
      intent: { area: "근로자 퇴직금", goal: "", laws: ["민법"], lawKeywords: [] },
    };
    expect(classifyCase({ ...r, mode: "ai" }, null)).toBe("other");
    expect(classifyCase({ ...r, mode: "replay" }, null)).toBe("wage");
  });

  test("받는 쪽인지 갚는 쪽인지 알 수 없으면 타임라인을 숨긴다", () => {
    expect(
      classifyCase(bare(["민법"]), "빌려준 돈을 달라고 했더니 오히려 저보고 물어내라고 해요"),
    ).toBe("other");
  });

  test("상가 임대차 보증금은 주택용 단계 없이 일반 금전 절차", () => {
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
