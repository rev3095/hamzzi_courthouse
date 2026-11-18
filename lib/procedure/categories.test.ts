import { describe, expect, test } from "vitest";
import { demoExamples } from "@/lib/demo/policy";
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  CATEGORY_KEYS,
  CATEGORY_LIST,
  groupOf,
  isCategoryKey,
} from "./categories";
import { LIFE_TRACKS } from "./life-tracks";
import { classifyCase, hasTimeline, procedurePlan } from "./policy";
import { TRACKS } from "./steps";

const bare = (laws: string[]) => ({
  intent: { area: "", goal: "", laws, lawKeywords: [] },
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

describe("DEC-028 홈 카테고리 버튼", () => {
  test("카테고리마다 정해진 타임라인과 판례 검색어가 있다", () => {
    for (const c of CATEGORY_LIST) {
      expect(c.track in TRACKS || c.track in LIFE_TRACKS, c.key).toBe(true);
      expect(c.caseQuery.length, c.key).toBeGreaterThan(1);
      expect(c.starters.length, c.key).toBeGreaterThan(0);
    }
    expect(CATEGORY_LIST.map((c) => c.key)).toEqual([...CATEGORY_KEYS]);
  });

  test("DEC-034 모든 카테고리가 정확히 한 묶음에 들고, 모든 타임라인에 카테고리가 있다", () => {
    const grouped = CATEGORY_GROUPS.flatMap((g) => g.keys);
    expect([...grouped].sort()).toEqual([...CATEGORY_KEYS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(groupOf("insult")).toBe("crime");
    // 추가 타임라인(DEC-033)마다 홈 버튼이 있다
    const tracks = new Set(CATEGORY_LIST.map((c) => c.track));
    for (const key of Object.keys(LIFE_TRACKS)) expect(tracks.has(key as never), key).toBe(true);
  });

  test("카테고리 예시 답변은 실제 예시 질문만 가리킨다", () => {
    const ids = new Set(demoExamples().map((e) => e.id));
    for (const c of CATEGORY_LIST) for (const id of c.examples) expect(ids.has(id), id).toBe(true);
  });

  test("정해진 값만 카테고리로 받는다", () => {
    expect(isCategoryKey("family")).toBe(true);
    for (const v of ["", "FAMILY", "__proto__", "lease ", null, 1])
      expect(isCategoryKey(v)).toBe(false);
  });

  test("새 섹션: 자유 질문도 규칙으로 고른다", () => {
    expect(classifyCase(bare(["민법"]), "이혼하려는데 재산분할은 어떻게 하나요")).toBe("family");
    expect(classifyCase(bare(["민법"]), "전 남편이 양육비를 안 보내요")).toBe("family");
    expect(classifyCase(bare(["민법"]), "아버지가 돌아가셨는데 상속 빚이 걱정돼요")).toBe(
      "inheritance",
    );
    expect(
      classifyCase(bare(["민법"]), "형이 유산을 혼자 다 가져갔어요 유류분 받을 수 있나요"),
    ).toBe("inheritance");
    expect(classifyCase(bare(["형법"]), "커뮤니티에 저를 비방하는 허위사실 글이 올라왔어요")).toBe(
      "defamation",
    );
    expect(classifyCase(bare(["민법"]), "쇼핑몰에서 산 옷 반품했는데 환불을 안 해줘요")).toBe(
      "consumer",
    );
    expect(
      classifyCase(bare(["전자상거래 등에서의 소비자보호에 관한 법률"]), "물건이 설명과 달라요"),
    ).toBe("consumer");
  });

  test("새 섹션도 고소를 당한 쪽·서류를 받은 쪽은 피해자 타임라인을 보이지 않는다", () => {
    expect(classifyCase(bare(["형법"]), "명예훼손으로 고소당했어요")).toBe("respond_criminal");
    expect(classifyCase(bare(["민법"]), "양육비 청구 소장을 받았어요")).toBe("respond_civil");
  });

  test("중고거래 사기는 소비자 섹션이 아니라 사기 타임라인", () => {
    expect(classifyCase(bare(["형법"]), "중고거래로 돈을 보냈는데 환불도 안 하고 잠수탔어요")).toBe(
      "fraud",
    );
  });

  test("카테고리는 규칙이 정하지 못할 때만 쓴다", () => {
    // 규칙으로 정할 수 없는 질문 → 고른 카테고리의 타임라인
    expect(classifyCase(bare(["민법"]), "어떻게 해야 하나요", "family")).toBe("family");
    expect(classifyCase(bare(["형법"]), "처벌할 수 있나요", "defamation")).toBe("defamation");
    // 규칙이 정한 섹션이 있으면 카테고리보다 규칙이 먼저
    expect(classifyCase(bare(["근로기준법"]), "월급을 못 받았어요", "consumer")).toBe("wage");
    // 수사를 받는 쪽·서류를 받은 쪽은 카테고리를 골라도 범위 밖 안내
    expect(classifyCase(bare(["형법"]), "고소당했어요", "defamation")).toBe("respond_criminal");
    expect(classifyCase(bare(["민법"]), "소장을 받았어요", "loan")).toBe("respond_civil");
    // 일반 금전 절차는 생활 분쟁 섹션을 골랐을 때만 바꾼다
    expect(classifyCase(bare(["상가건물임대차보호법"]), "상가 보증금을 못 받았어요", "lease")).toBe(
      "money",
    );
    expect(classifyCase(bare(["민법"]), "돈을 돌려받고 싶어요", "consumer")).toBe("consumer");
  });

  test("생활 분쟁 타임라인 계획: 섹션 이름·먼저 추천할 단계", () => {
    for (const key of ["family", "inheritance", "consumer", "defamation"] as const) {
      const plan = procedurePlan(bare(["민법"]), "어떻게 하나요", key);
      expect(plan.kind, key).toBe("life_timeline");
      if (!hasTimeline(plan)) continue;
      expect(plan.section).toBe(CATEGORIES[key].label);
      expect(plan.recommended.key).toBe(LIFE_TRACKS[key].recommended);
      // 생활 분쟁 섹션은 공식 서식 작성기(게이트 뒤)와 연결하지 않는다
      expect(plan.steps.every((s) => !s.document)).toBe(true);
    }
  });

  test("양육비를 못 받는 질문은 양육비 이행 단계 안내를 덧붙인다", () => {
    const plan = procedurePlan(bare(["민법"]), "양육비를 못 받고 있어요");
    expect(hasTimeline(plan) && plan.note).toMatch(/양육비 이행 확보/);
  });
});
