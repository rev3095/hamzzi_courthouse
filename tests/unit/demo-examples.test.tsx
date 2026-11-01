// P9 회귀: 무료 모드 재생 예시 10건 (DEC-015, DEC-012). 법제처·Claude를 부르지 않는다 — 저장된 결과만 검사한다.
// 예시를 바꾸면(새 분석 = 별도 과금, 사용자 허락 필요) 이 테스트가 절대 규칙 위반을 막는다.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { AI_NOTICE } from "@/lib/api/respond";
import { demoExamples, findExample, replayCitations, replayResult } from "@/lib/demo/policy";
import { ResultPanel } from "@/components/result/ResultPanel";
import { resultTitle, sourceRef } from "@/components/result/labels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

const norm = (s: string) => s.replace(/\s+/g, "");

describe.each(demoExamples().map((e) => [e.id, e] as const))("예시 %s", (_id, ex) => {
  const result = replayResult(findExample(ex.question)!);

  test("F-005 모든 답변 문단의 출처가 그 결과의 근거 목록에 있고, 법제처 재조회에서 실존이 확인됐다", () => {
    expect(result.answer.points.length).toBeGreaterThan(0);
    for (const p of result.answer.points) {
      const ref = sourceRef(p.source, result);
      expect(ref.url, p.source).toMatch(/^https:\/\/www\.law\.go\.kr\//);
      const citation = ref.label.replace(/^\S+ (?=\d{4}[가-힣])/, ""); // 판례는 "법원 사건번호" → 사건번호
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
    expect(screen.getByText(/AI 캐릭터 · 근거 판례 \d+건 인용/)).toBeDefined();
    const credit = screen.getByRole("region", { name: "출처" });
    expect(within(credit).getByText(/법제처 국가법령정보센터/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/유사도|관련도|승소 가능성|undefined/);
  });
});
