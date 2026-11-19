// DEC-042 질문 해석: 예시 뱅크(동적 예시)·복수 라벨·온/오프라인·새 라벨 제안. 모델·DB는 가짜 (Claude 실호출 없음).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LABEL_BANK, examplesBlock, pickExamples, similarity } from "@/lib/ai/label-bank";
import { UNDERSTAND_SCHEMA, UnderstandZ, screenUnderstanding } from "@/lib/ai/policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { CATEGORY_LIST } from "@/lib/procedure/categories";
import { SECTION_LABELS } from "@/lib/procedure/sections";
import { ResultPanel } from "@/components/result/ResultPanel";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
const labelStore = vi.hoisted(() => ({
  activeLabels: vi.fn(),
  bumpLabel: vi.fn(),
  insertLabel: vi.fn(),
}));
vi.mock("@/lib/procedure/labels-store", () => labelStore);
vi.mock("@/lib/ai/classify", () => ({ classifyProcedure: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({ tryAiQuota: vi.fn(async () => true) }));
const { saveLabelProposal } = await import("@/lib/inquiries/procedure-hint");

afterEach(cleanup);

describe("DEC-042 예시 뱅크 (미세조정 대신 관련 예시를 골라 넣는다)", () => {
  test("예시는 직접 쓴 것뿐이고 라벨은 모두 정해진 목록 안이다", () => {
    expect(LABEL_BANK.length).toBeGreaterThanOrEqual(CATEGORY_LIST.length * 2);
    for (const e of LABEL_BANK) {
      expect(SECTION_LABELS as string[], e.q).toContain(e.section);
      // "맞는 섹션 없음" 예시(가정·의견 질문)는 함께 걸린 절차가 없어야 한다
      if (e.section === "none") expect(e.others, e.q).toEqual([]);
      for (const o of e.others) {
        expect(SECTION_LABELS as string[], e.q).toContain(o);
        expect(o).not.toBe(e.section);
      }
      // 예시 문장에 "예:" 머리말이나 개인정보 자리표시가 없다
      expect(e.q).not.toMatch(/^예:|\[[^\]]+\]/);
    }
  });

  test("비슷한 질문의 예시를 고른다 — 라벨이 겹치지 않게, 넷까지", () => {
    const ex = pickExamples("전세 계약이 끝났는데 집주인이 보증금을 안 돌려줘요");
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.length).toBeLessThanOrEqual(4);
    expect(ex[0].section).toBe("lease_deposit");
    // 한 라벨 예시(복합 사례 제외)는 라벨이 서로 다르다
    const single = ex.filter((e) => e.others.length === 0);
    expect(new Set(single.map((e) => e.section)).size).toBe(single.length);
  });

  test("겹치는 글자가 없으면 예시를 붙이지 않는다 (입력 토큰을 쓰지 않는다)", () => {
    expect(pickExamples("zzz qqq")).toEqual([]);
    expect(examplesBlock("zzz qqq")).toBe("");
    expect(similarity("보증금을 못 받았어요", "보증금을 못 받았어요")).toBe(1);
  });

  test("붙이는 글에는 예시 문장과 라벨만 있다", () => {
    const block = examplesBlock("상사가 단체 대화방에서 저를 욕하고 따돌려요");
    expect(block).toContain("<비슷한_질문_라벨_예시>");
    expect(block).toMatch(/section: \w+, others: \[.*\], channel: \w+/);
    expect(block.length).toBeLessThan(700);
  });
});

describe("DEC-042 복수 라벨·온/오프라인·새 라벨 제안", () => {
  const parse = (v: unknown) => screenUnderstanding(UnderstandZ.parse(v), Q);
  const Q = "행정심판을 청구하고 싶어요. 구청에서 과태료를 부과했는데 억울해요.";
  const base = { lawQuery: "과태료 부과 처분 불복 절차", caseQueries: ["과태료 이의"] };

  test("출력 형식은 여섯 항목을 모두 요구하고, others는 정해진 라벨만 고를 수 있다", () => {
    expect(UNDERSTAND_SCHEMA.required).toEqual([
      "section",
      "others",
      "channel",
      "newLabel",
      "lawQuery",
      "caseQueries",
    ]);
    expect(UNDERSTAND_SCHEMA.properties.others.items.enum).toEqual(SECTION_LABELS);
  });

  test("함께 걸린 절차는 주된 섹션·none·중복을 빼고 둘까지", () => {
    const u = parse({
      ...base,
      section: "lease_deposit",
      others: ["fraud", "lease_deposit", "none", "fraud", "money", "privacy", "없는라벨"],
      channel: "offline",
      newLabel: null,
    });
    expect(u.others).toEqual(["fraud", "money"]);
    expect(u.channel).toBe("offline");
  });

  test("예전 형식(항목 없음)·잘못된 값은 없는 것으로 본다", () => {
    const u = parse({ ...base, section: "wage", channel: "어딘가" });
    expect(u).toMatchObject({ section: "wage", others: [], channel: "unknown", newLabel: null });
  });

  test("새 라벨은 맞는 섹션이 없을 때만, 문구 검사를 통과하고 낱말이 질문에 있을 때만 받는다", () => {
    const ok = parse({
      ...base,
      section: "none",
      others: [],
      channel: "unknown",
      newLabel: { title: "과태료 부과에 대한 이의제기", keywords: ["과태료", "없는낱말", "문제"] },
    });
    expect(ok.newLabel).toEqual({ title: "과태료 부과에 대한 이의제기", keywords: ["과태료"] });
    // 기존 섹션을 골랐으면 새 라벨을 만들지 않는다
    expect(
      parse({
        ...base,
        section: "admin_appeal",
        others: [],
        channel: "unknown",
        newLabel: { title: "과태료 이의", keywords: ["과태료"] },
      }).newLabel,
    ).toBeNull();
    // 숫자·단정 표현이 든 이름, 질문에 없는 낱말뿐인 제안은 버린다
    for (const newLabel of [
      { title: "60일 안에 하는 이의제기", keywords: ["과태료"] },
      { title: "반드시 이기는 이의제기", keywords: ["과태료"] },
      { title: "과태료 이의제기", keywords: ["없는낱말"] },
    ]) {
      expect(
        parse({ ...base, section: "none", others: [], channel: "unknown", newLabel }).newLabel,
      ).toBeNull();
    }
  });
});

describe("DEC-042 새 라벨 제안 저장 (승인 대기)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    labelStore.activeLabels.mockResolvedValue([]);
  });

  test("처음 보는 유형이면 이름만 있는 라벨을 pending으로 저장한다 (단계가 없어 화면에는 나가지 않는다)", async () => {
    await saveLabelProposal(
      { title: "과태료 이의제기", keywords: ["과태료"] },
      "과태료가 억울해요",
    );
    expect(labelStore.insertLabel).toHaveBeenCalledWith({
      title: "과태료 이의제기",
      keywords: ["과태료"],
      track: null,
      steps: [],
      status: "pending",
    });
  });

  test("같은 낱말의 라벨이 이미 있으면 새로 만들지 않고 사용 횟수만 올린다", async () => {
    labelStore.activeLabels.mockResolvedValue([
      {
        id: "l-1",
        title: "과태료 이의제기",
        keywords: ["과태료"],
        track: null,
        steps: [],
        status: "pending",
        hits: 3,
        createdAt: "t",
      },
    ]);
    await saveLabelProposal({ title: "과태료 불복", keywords: ["과태료"] }, "과태료가 억울해요");
    expect(labelStore.insertLabel).not.toHaveBeenCalled();
    expect(labelStore.bumpLabel).toHaveBeenCalledWith("l-1");
  });

  test("저장이 실패해도 예외를 올리지 않는다", async () => {
    labelStore.activeLabels.mockRejectedValue(new Error("db"));
    await expect(
      saveLabelProposal({ title: "과태료 이의제기", keywords: ["과태료"] }, "과태료"),
    ).resolves.toBeUndefined();
  });
});

describe("DEC-042 함께 살펴볼 절차 (결과 화면)", () => {
  const result = (over: Partial<DemoAnalysisResult>) =>
    ({
      mode: "ai",
      outcome: "grounded",
      aiNotice: "AI 생성 · 법률 자문 아님",
      intent: { area: "", goal: "", laws: [], lawKeywords: [] },
      answer: { points: [] },
      articles: [],
      cases: [],
      searches: [],
      trace: [],
      searchScopeNote: "",
      recheck: { ok: true, items: [], removed: 0 },
      ...over,
    }) as DemoAnalysisResult;

  test("함께 걸린 절차가 있으면 그 분야를 고른 질문창으로 가는 링크를 보인다", () => {
    render(
      <ResultPanel
        result={result({ section: "lease_deposit", relatedSections: ["fraud"] })}
        question="전세사기를 당한 것 같아요"
        followUp={null}
      />,
    );
    const box = screen.getByRole("region", { name: "함께 살펴볼 절차" });
    expect(box.textContent).toContain("AI 생성 · 법률 자문 아님");
    expect(screen.getByRole("link", { name: "사기 따로 물어보기" }).getAttribute("href")).toBe(
      "/?category=fraud#ask",
    );
    expect(box.textContent).not.toMatch(/유리|불리|승소|가능성/);
  });

  test("없으면 아무것도 보이지 않는다", () => {
    render(<ResultPanel result={result({})} question="질문" followUp={null} />);
    expect(screen.queryByRole("region", { name: "함께 살펴볼 절차" })).toBeNull();
  });
});
