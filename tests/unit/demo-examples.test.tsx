// P9 회귀: 무료 모드 재생 예시 10건 (DEC-015, DEC-012). 법제처·Claude를 부르지 않는다 — 저장된 결과만 검사한다.
// 예시를 바꾸면(새 분석 = 별도 과금, 사용자 허락 필요) 이 테스트가 절대 규칙 위반을 막는다.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { AI_NOTICE } from "@/lib/api/respond";
import {
  demoExamples,
  exampleBySlug,
  findExample,
  replayCitations,
  replayResult,
} from "@/lib/demo/policy";
import { ResultPanel } from "@/components/result/ResultPanel";
import { resultTitle, sourceRef } from "@/components/result/labels";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
afterEach(cleanup);

const norm = (s: string) => s.replace(/\s+/g, "");

describe.each(demoExamples().map((e) => [e.id, e] as const))("예시 %s", (_id, ex) => {
  const result = replayResult(findExample(ex.question)!);

  test("F-005 모든 답변 문단의 출처가 그 결과의 근거 목록에 있고, 법제처 재조회에서 실존이 확인됐다", () => {
    expect(result.answer.points.length).toBeGreaterThan(0);
    for (const p of result.answer.points) {
      const ref = sourceRef(p.source, result);
      expect(ref.url, p.source).toMatch(/^https:\/\/www\.law\.go\.kr\//);
      const citation = ref.label.replace(/^\S+ (?=\d{2,4}[가-힣])/, ""); // 판례는 "법원 사건번호" → 사건번호 (옛 사건번호는 연도가 두 자리)
      const item = result.recheck.items.find((i) => norm(i.citation) === norm(citation));
      expect(item?.exists, p.source).toBe(true);
    }
  });

  test("F-005 검증 통과 문단만 재생하고, 인용 행은 60자 이내 구절만 남긴다 (DEC-007)", () => {
    expect(result.answer.points.every((p) => p.check === "verified")).toBe(true);
    for (const row of replayCitations(result)) {
      expect(row.status).toBe("verified");
      if (row.quote) expect(row.quote.length).toBeLessThanOrEqual(60);
    }
  });

  test("N1 단정 표현이 없다 (답변·제목)", () => {
    for (const p of result.answer.points) expect(isAssertive(p.text)).toBe(false);
    expect(isAssertive(resultTitle(result))).toBe(false);
  });

  test("절대 규칙 6 화면에 AI 고지·AI 캐릭터·법제처 출처가 보이고, 관련도 점수는 없다", () => {
    render(<ResultPanel result={result} question={ex.question} followUp={null} />);
    expect(screen.getByText(AI_NOTICE)).toBeDefined();
    expect(screen.getByText(/AI 캐릭터 · 근거 법령 \d+건 · 판례 \d+건 인용/)).toBeDefined();
    const credit = screen.getByRole("region", { name: "출처" });
    expect(within(credit).getByText(/법제처 국가법령정보센터/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/유사도|관련도|승소 가능성|undefined/);
  });
});

// 2026-11-25 복잡한 사연 예시: 쪽(원고·피고 / 고소인·피의자 / 신청인)마다 요약 질문 + 자세한 상황 + 답변 + 문서 작성 절차
const SIDES = demoExamples().flatMap((e) =>
  (exampleBySlug(e.href.split("/").pop()!)?.sides ?? []).map(
    (s) => [`${e.id} ${s.key}`, e, s] as const,
  ),
);

describe.each(SIDES)("예시 쪽 %s", (_label, ex, side) => {
  const result = replayResult(findExample(side.question)!);

  test("F-005 그 쪽 요약 질문을 넣으면 그 쪽 답변을 재생하고, 문단은 모두 검증 통과·실존 확인", () => {
    expect(result.answer.points).toEqual(side.result.answer.points);
    expect(result.answer.points.length).toBeGreaterThanOrEqual(2);
    for (const p of result.answer.points) {
      expect(p.check).toBe("verified");
      const ref = sourceRef(p.source, result);
      const citation = ref.label.replace(/^\S+ (?=\d{2,4}[가-힣])/, "");
      expect(result.recheck.items.find((i) => norm(i.citation) === norm(citation))?.exists).toBe(
        true,
      );
    }
  });

  test("화면 질문은 짧은 요약이고, 답변은 300자 넘는 상황으로 만들었다", () => {
    expect(side.question.length).toBeLessThan(side.context.length);
    expect(side.context.length).toBeGreaterThanOrEqual(300);
  });

  test("F-007 상황 글·초안에 연락처·주민번호·계좌·이메일 꼴과 가림 표시가 없다", () => {
    const all = JSON.stringify({ q: side.question, c: side.context, g: side.guide });
    expect(all).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(all).not.toMatch(/\d{6}-?[1-4]\d{6}/);
    expect(all).not.toMatch(/\d{3,6}-\d{2,6}-\d{4,8}/);
    expect(all).not.toMatch(/[\w.]+@[\w-]+\.[\w.]+/);
    expect(all).not.toMatch(/\[이름\d/);
  });

  test("N1·F-005 답변·문서 작성 절차·초안에 단정 표현이 없고, 초안 속 판례·조문 번호는 그 쪽의 검증된 근거뿐이다", () => {
    for (const p of side.result.answer.points) expect(isAssertive(p.text)).toBe(false);
    if (!side.guide) return;
    const texts = [
      side.guide.document.name,
      side.guide.document.basis,
      ...side.guide.document.sections.map((s) => s.heading),
      ...side.guide.procedure.flatMap((s) => [s.title, s.detail]),
      ...side.guide.document.sections.flatMap((s) => s.paragraphs),
      ...side.guide.checklist,
    ];
    for (const t of texts) expect(isAssertive(t), t).toBe(false);
    const sources = side.result.answer.points.map((p) => p.source.replace(/\s/g, ""));
    const cases = new Set(sources.filter((s) => s.startsWith("case:")).map((s) => s.slice(5)));
    const articles = new Set(
      sources.filter((s) => s.startsWith("law:")).map((s) => s.split(":")[2]),
    );
    for (const t of texts) {
      const n = t.normalize("NFKC");
      // 사건번호 꼴 ('2025년 12월' 같은 날짜는 빼고)
      for (const m of n.matchAll(/\d{2,4}\s?(?![년월일])[가-힣]{1,4}\s?\d{2,7}/g))
        expect(cases.has(m[0].replace(/\s/g, "")), m[0]).toBe(true);
      for (const m of n.matchAll(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g))
        expect(articles.has(`제${m[1]}조${m[2] ? `의${m[2]}` : ""}`), m[0]).toBe(true);
    }
  });

  test("예전 짧은 질문은 원래 질문한 쪽(첫 쪽) 답변만 재생한다", () => {
    const full = exampleBySlug(ex.href.split("/").pop()!)!;
    for (const a of full.aliases ?? [])
      expect(findExample(a)?.result.answer.points).toEqual(full.sides![0].result.answer.points);
  });

  test("예시 목록의 질문은 첫 쪽의 요약 질문이다", () => {
    expect(ex.question).toBe(exampleBySlug(ex.href.split("/").pop()!)!.sides![0].question);
  });
});
