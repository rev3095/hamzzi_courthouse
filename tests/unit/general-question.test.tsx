// 일반 법률 질문 모드 (2026-11-27 사용자 요청): 참고 자료 거르기와 결과 화면(타임라인 없이 답변·참고 자료).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
const { screenWebRefs } = await import("@/lib/ai/web-refs");
const { UnderstandZ } = await import("@/lib/ai/policy");
const { ResultPanel } = await import("@/components/result/ResultPanel");
const { demoExamples, findExample, replayResult } = await import("@/lib/demo/policy");
afterEach(cleanup);

describe("참고 자료 거르기 (규칙 1·2·3, 지어낸 주소 금지)", () => {
  // 도구가 돌려준 검색 결과: 주소(끝 / 없이) → 도구가 준 제목
  const found = new Map([
    ["https://www.easylaw.go.kr/a", "생활법령정보 상속세"],
    ["https://www.scourt.go.kr/b", "대법원 2019다12345 판결 무조건 이기는 법"],
  ]);
  test("검색으로 실제로 나온 주소만 남기고, 조문·숫자·단정 표현이 든 설명은 비운다", () => {
    const refs = screenWebRefs(
      {
        refs: [
          {
            title: "생활법령 상속세",
            url: "https://www.easylaw.go.kr/a",
            note: "상속세 계산 순서를 설명",
          },
          {
            title: "법원 안내",
            url: "https://www.scourt.go.kr/b",
            note: "상속세및증여세법 제18조 해설",
          },
          { title: "지어낸 주소", url: "https://example.com/x", note: "설명" },
          { title: "단정", url: "https://www.easylaw.go.kr/a", note: "중복" },
        ],
      },
      found,
    );
    expect(refs.map((r) => r.url)).toEqual([
      "https://www.easylaw.go.kr/a",
      "https://www.scourt.go.kr/b",
    ]);
    expect(refs[0].note).toBe("상속세 계산 순서를 설명");
    expect(refs[1].note).toBe("");
    // 제목은 모델이 쓴 글이 아니라 도구가 준 제목, 그 제목에 사건번호·단정이 있으면 사이트 주소로
    expect(refs[0].title).toBe("생활법령정보 상속세");
    expect(refs[1].title).toBe("scourt.go.kr");
    expect(
      screenWebRefs(
        { refs: [{ title: "t", url: "https://www.easylaw.go.kr/a", note: "반드시 이깁니다" }] },
        found,
      )[0].note,
    ).toBe("");
    expect(screenWebRefs(null, found)).toEqual([]);
  });

  test("질문 해석의 kind가 없거나 틀리면 사건(case)으로 본다", () => {
    const base = {
      section: "none",
      others: [],
      channel: "unknown",
      newLabel: null,
      lawQuery: "",
      caseQueries: [],
    };
    expect(UnderstandZ.parse(base).kind).toBe("case");
    expect(UnderstandZ.parse({ ...base, kind: "general" }).kind).toBe("general");
    expect(UnderstandZ.parse({ ...base, kind: "x" }).kind).toBe("case");
  });
});

describe("일반 질문 결과 화면", () => {
  const ex = demoExamples()[0];
  const base = replayResult(findExample(ex.question)!);
  test("타임라인·추천 단계 없이 답변과 참고 자료를 보인다", () => {
    render(
      <ResultPanel
        result={{
          ...base,
          kind: "general",
          references: [
            { title: "생활법령 안내", url: "https://www.easylaw.go.kr/a", note: "제도 설명" },
          ],
        }}
        question="상속세는 어떻게 매겨져요?"
        followUp={null}
      />,
    );
    expect(screen.getByRole("region", { name: "참고 자료" })).toBeDefined();
    expect(screen.getByRole("link", { name: "생활법령 안내" }).getAttribute("href")).toBe(
      "https://www.easylaw.go.kr/a",
    );
    expect(document.body.textContent).not.toContain("추천 첫 단계");
    expect(screen.queryByRole("list", { name: "절차 단계" })).toBeNull();
  });

  test("사건 질문은 지금처럼 타임라인을 보인다", () => {
    render(<ResultPanel result={base} question={ex.question} followUp={null} />);
    expect(screen.queryByRole("region", { name: "참고 자료" })).toBeNull();
  });
});
