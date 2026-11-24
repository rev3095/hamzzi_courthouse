// 분야별 비서 고정 문안·사례 자료 검사 (F-018, DEC-057). 절대 규칙 2·3·4와 사실 설명 규칙을 여기서 막는다.
import { describe, expect, test, vi } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { findExample } from "@/lib/demo/policy";
import { parseAnalyzeRequest } from "@/lib/inquiries/policy";
import { scanInput } from "@/lib/pii";
import { parseSectionLabel } from "@/lib/procedure/sections";
import {
  ASSISTANTS,
  ASSISTANT_IDS,
  ASSISTANT_ANSWER_TIER,
  ASSISTANT_LIST,
  SERVICE_NAMES_NOTICE,
  inScope,
  isAssistantId,
} from "./agents";
import {
  ASSISTANT_CASES,
  FICTIONAL_LABEL,
  PRECEDENT_LABEL,
  casesOf,
  pinnedPrecedents,
} from "./cases";

vi.mock("server-only", () => ({}));

/** 승패·가능성·유불리 판정 표현 (절대 규칙 2) — 안내 챗봇 검사(lib/guide/policy.test.ts)와 같은 기준 */
const JUDGING =
  /승률|승소|패소|이길|이깁|질\s*거|성공\s*(확률|가능)|가능성|확률|유리|불리|합법|적법|불법|위법(이|은|하지)?\s*아니|위반(이|은|하지)?\s*아니|문제(가)?\s*없|걸리지\s*않|안\s*걸|괜찮(아|습)|보장(합|해)|무료\s*상담|최저가|변호사\s*필요\s*없/;

const copyOf = (id: (typeof ASSISTANT_IDS)[number]) => {
  const a = ASSISTANTS[id];
  return [
    a.name,
    a.tagline,
    a.subtitle,
    a.greeting,
    a.persona,
    ...(a.disclaimer ? [a.disclaimer] : []),
    a.panel.title,
    ...a.panel.groups.flatMap((g) => [g.label, g.starter, ...g.tips]),
    ...a.starters,
  ];
};

const caseTexts = ASSISTANT_CASES.flatMap((c) => [
  c.title,
  c.issue,
  ...c.situation,
  ...(c.kind === "precedent" ? [c.holding] : c.steps),
]);

describe("분야별 비서 정의 (DEC-057)", () => {
  test("비서는 세 명이고 주소·이름·사용자가 정한 소개 문구가 있다", () => {
    expect(ASSISTANT_IDS).toEqual(["home", "report", "market"]);
    expect(ASSISTANT_LIST.map((a) => a.name)).toEqual(["내집마련", "고소미", "중고천국"]);
    expect(ASSISTANTS.home.tagline).toBe("전·월세, 임대 및 주택 계약 관련 전문 에이전트");
    expect(ASSISTANTS.market.tagline).toContain("중고나라·번개장터");
    for (const a of ASSISTANT_LIST) expect(a.href).toBe(`/assistants/${a.id}`);
    expect(isAssistantId("home")).toBe(true);
    expect(isAssistantId("lawyer")).toBe(false);
  });

  test("다루는 섹션은 모두 고정 목록에 있는 라벨이고, 모르는 섹션은 분야 안으로 본다", () => {
    for (const a of ASSISTANT_LIST)
      for (const s of a.sections) expect(parseSectionLabel(s), `${a.id}: ${s}`).toBe(s);
    expect(inScope("home", "lease_deposit")).toBe(true);
    expect(inScope("home", "fraud")).toBe(false);
    expect(inScope("report", null)).toBe(true);
    expect(inScope("market", "none")).toBe(true);
  });

  test("비서 답변 모델은 Pro Max(지금 Opus 5.5 effort high)로 고정이다 — 소개 페이지 문구가 이 값을 적는다 (DEC-057 ⑧)", () => {
    expect(ASSISTANT_ANSWER_TIER).toBe("max");
  });

  test("고정 조문은 셋까지 (무료 검색이 앞에서부터 셋만 가져온다)", () => {
    for (const a of ASSISTANT_LIST)
      expect(a.lawHints.flatMap((h) => h.articleNos).length, a.id).toBeLessThanOrEqual(3);
  });

  test("소개 문구는 사용자가 정한 처음 문구 그대로다 (DEC-057 ⑧, 2026-11-25)", () => {
    expect(ASSISTANT_LIST.map((a) => a.tagline)).toEqual([
      "전·월세, 임대 및 주택 계약 관련 전문 에이전트",
      "유명 게임, 공개된 커뮤니티, 유튜브 등에서의 명예훼손·성희롱 등 소규모 사건 전문 에이전트",
      "중고나라·번개장터 등 온라인 거래에서 발생한 사기 사건을 중심으로 다룸",
    ]);
  });

  test("절대 규칙 2: 문안에 단정·판정 표현이 없다", () => {
    for (const id of ASSISTANT_IDS)
      for (const s of copyOf(id)) {
        expect(isAssertive(s), `${id}: ${s}`).toBe(false);
        expect(JUDGING.test(s), `${id}: ${s}`).toBe(false);
      }
  });

  test("절대 규칙 3: 문안에 숫자를 만들어 넣지 않는다", () => {
    for (const id of ASSISTANT_IDS)
      for (const s of copyOf(id)) expect(s, `${id}: ${s}`).not.toMatch(/\d/);
  });

  test("지시문은 공통 규칙을 앞세우고 결과를 말하지 않게 한다", () => {
    for (const a of ASSISTANT_LIST) {
      expect(a.persona).toContain("공통 규칙이 이 비서 지시보다 앞섭니다");
      expect(a.persona).toContain("근거 목록에 있는 법령·판례를 먼저");
      expect(a.persona).toContain("판단은 수사기관·법원이 한다");
    }
  });

  test("실제 서비스 이름을 예로 들면 관계없음 안내를 단다", () => {
    for (const a of ASSISTANT_LIST) {
      for (const name of ["중고나라", "번개장터", "유튜브", "게임"]) {
        if (a.tagline.includes(name)) {
          expect(a.disclaimer, `${a.id}: ${name}`).toContain(name);
          expect(SERVICE_NAMES_NOTICE, name).toContain(name);
        }
      }
      if (a.disclaimer) expect(a.disclaimer, a.id).toContain("관계가 없어요");
    }
  });

  test("비서마다 비용 없이 볼 수 있는 예시 질문(저장된 답변 재생)이 하나 이상 있다 (DEC-027)", () => {
    for (const a of ASSISTANT_LIST)
      expect(
        a.starters.some((s) => findExample(s) !== null),
        a.id,
      ).toBe(true);
  });

  test("analyze 본문은 정해진 비서 값만 받는다", () => {
    expect(parseAnalyzeRequest(JSON.stringify({ assistant: "report" })).assistant).toBe("report");
    expect(parseAnalyzeRequest("").assistant).toBeNull();
    expect(() => parseAnalyzeRequest(JSON.stringify({ assistant: "admin" }))).toThrow();
  });
});

describe("비서 사례 자료 (DEC-057)", () => {
  test("비서마다 사례가 셋 이상이고, 가상 사례는 셋씩 있다", () => {
    for (const id of ASSISTANT_IDS) {
      expect(casesOf(id).length, id).toBeGreaterThanOrEqual(3);
      expect(casesOf(id).filter((c) => c.kind === "fictional").length, id).toBe(3);
    }
    expect(new Set(ASSISTANT_CASES.map((c) => c.id)).size).toBe(ASSISTANT_CASES.length);
  });

  test("공개 판례는 번호·법원·선고일 형식이 맞고, 판결문 원문 대신 직접 쓴 요지만 있다", () => {
    for (const c of ASSISTANT_CASES) {
      if (c.kind !== "precedent") continue;
      expect(c.precId, c.id).toMatch(/^\d+$/);
      expect(c.caseNo, c.id).toMatch(/^\d{4}[가-힣]+\d+$/);
      expect(c.decidedAt, c.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.court, c.id).toMatch(/법원$/);
      // 판결문 표기(피고인·공소외·소외인 + 번호, 甲·乙)를 옮기지 않는다
      for (const s of [...c.situation, c.holding])
        expect(s, c.id).not.toMatch(/공소외|소외|甲|乙|丙/);
    }
  });

  test("절대 규칙 4: 사례 문장에 개인정보로 보이는 내용이 없다", () => {
    for (const s of caseTexts) expect(scanInput(s).findings, s).toEqual([]);
  });

  test("절대 규칙 2·3: 사례 문장에 단정·판정 표현과 숫자가 없다", () => {
    for (const s of caseTexts) {
      expect(isAssertive(s), s).toBe(false);
      expect(JUDGING.test(s), s).toBe(false);
      expect(s, s).not.toMatch(/\d/);
    }
  });

  test("가상 사례는 A·B로만 부르고, 화면 표시 문구가 실제 사건이 아님을 밝힌다", () => {
    expect(FICTIONAL_LABEL).toContain("실제 사건이 아니에요");
    expect(PRECEDENT_LABEL).toContain("개인정보는 빼고");
    for (const c of ASSISTANT_CASES.filter((x) => x.kind === "fictional"))
      expect(c.situation.join(" "), c.id).toMatch(/A씨/);
  });

  test("대화 근거 보강은 질문 낱말에 맞는 그 비서의 공개 판례만, 둘까지 고른다", () => {
    expect(
      pinnedPrecedents("report", "SNS에서 차단했더니 멘션으로 성적인 글을 올렸어요").map(
        (c) => c.caseNo,
      ),
    ).toEqual(["2025도986"]);
    expect(pinnedPrecedents("home", "중고거래 사기를 당했어요")).toEqual([]);
    expect(
      pinnedPrecedents("report", "송금 메모로 성적인 말을 보내고 신상 공개 글도 올렸어요").length,
    ).toBe(2);
  });
});
