// DEC-072 ⓑ 판례 상세 보강: 참조판례 읽기 · 인용 표기 형식 · 보관함 담기 · 같은 조문 판례. 법제처 응답은 목.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const api = vi.hoisted(() => ({ searchCases: vi.fn(), getStatuteCases: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  searchCases: api.searchCases,
  getStatuteCases: api.getStatuteCases,
}));

const { caseCitation, citedCasesFrom } = await import("@/lib/search/case-refs");
const { caseDetailResponse } = await import("@/lib/search/browse");
const { CaseActions, CitedCases, SameStatuteCases } =
  await import("@/components/search/CaseExtras");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe("참조판례 읽기 (순수)", () => {
  test("사건번호가 든 토막만, 공보 표기·자기 자신·중복은 뺀다", () => {
    const raw =
      "[1] 대법원 2010. 1. 28. 선고 2009다12345 판결(공2010상, 401), 대법원 2012. 3. 15. 선고 2011다6789 판결 / [2] 대법원 2010. 1. 28. 선고 2009다12345 판결, 대법원 2020. 5. 1. 선고 2020다1 판결";
    expect(citedCasesFrom(raw, "2020다1")).toEqual([
      { label: "대법원 2010. 1. 28. 선고 2009다12345 판결", caseNo: "2009다12345" },
      { label: "대법원 2012. 3. 15. 선고 2011다6789 판결", caseNo: "2011다6789" },
    ]);
    expect(citedCasesFrom(null)).toEqual([]);
    expect(citedCasesFrom("민법 제750조")).toEqual([]);
  });

  test("인용 표기는 법제처 값을 정해진 순서로 잇기만 한다", () => {
    const c = {
      court: "대법원",
      decidedAt: "2021-03-11",
      caseNo: "2020다12345",
      caseName: "임대차보증금반환",
      decisionType: "판결",
    };
    expect(caseCitation(c, "standard")).toBe("대법원 2021. 3. 11. 선고 2020다12345 판결");
    expect(caseCitation(c, "short")).toBe("대법원 2020다12345");
    expect(caseCitation(c, "withName")).toBe(
      "대법원 2021. 3. 11. 선고 2020다12345 판결 (임대차보증금반환)",
    );
    expect(caseCitation({ ...c, decisionType: null, decidedAt: null }, "standard")).toBe(
      "대법원 2020다12345",
    );
  });

  test("상세 응답에 참조판례·판결유형을 싣는다 (판례 전문은 없음)", () => {
    const r = caseDetailResponse({
      id: "1",
      caseNo: "2020다1",
      caseName: "보증금",
      court: "대법원",
      decidedAt: "2020-05-01",
      sourceUrl: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=1",
      holding: "판시",
      summary: "요지",
      refs: null,
      fromBody: false,
      bodyExcerpt: null,
      citedCasesRaw: "대법원 2010. 1. 28. 선고 2009다12345 판결",
      decisionType: "판결",
    });
    expect(r.citedCases).toEqual([
      { label: "대법원 2010. 1. 28. 선고 2009다12345 판결", caseNo: "2009다12345" },
    ]);
    expect(r.decisionType).toBe("판결");
    expect(JSON.stringify(r)).not.toContain("판례내용");
  });
});

const DETAIL = {
  id: "1",
  caseNo: "2020다1",
  caseName: "보증금",
  court: "대법원",
  decidedAt: "2020-05-01",
  sourceUrl: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=1",
  holdingSummary: null,
  sections: [],
  fromBody: false,
  citedStatutes: [
    { raw: "민법 제536조", id: "민법:제536조" },
    { raw: "구 민법 부칙", id: null },
  ],
  citedCases: [],
  decisionType: "판결",
  notice: "법제처 검색 결과 · AI 생성 아님",
};

describe("판례 상세 화면 보강", () => {
  test("인용 표기 형식을 바꿔 보이고, 보관함에는 이 기기에만 담는다", () => {
    render(<CaseActions c={DETAIL} />);
    expect(screen.getByTestId("citation-preview").textContent).toBe(
      "대법원 2020. 5. 1. 선고 2020다1 판결",
    );
    fireEvent.change(screen.getByLabelText("인용 표기 형식"), { target: { value: "short" } });
    expect(screen.getByTestId("citation-preview").textContent).toBe("대법원 2020다1");
    fireEvent.click(screen.getByRole("button", { name: "보관함에 담기" }));
    expect(JSON.parse(localStorage.getItem("hz:pins") ?? "[]")[0].href).toBe("/cases/1");
  });

  test("참조판례를 누르면 그 사건번호로 법제처에서 찾아 상세로 간다", async () => {
    api.searchCases.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "77",
            caseNo: "2009다12345",
            caseName: "x",
            court: "대법원",
            decidedAt: null,
            sourceUrl: "",
          },
        ],
        outcome: "grounded",
        searchScopeNote: "",
        notice: "",
      },
    });
    render(
      <CitedCases
        items={[{ label: "대법원 2010. 1. 28. 선고 2009다12345 판결", caseNo: "2009다12345" }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /2009다12345/ }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/cases/77"));
    expect(api.searchCases).toHaveBeenCalledWith("2009다12345");
  });

  test("같은 조문 판례는 누를 때만 찾고, 지금 판례는 목록에서 뺀다", async () => {
    api.getStatuteCases.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "1",
            caseNo: "2020다1",
            caseName: "보증금",
            court: "대법원",
            decidedAt: null,
            sourceUrl: "",
          },
          {
            id: "9",
            caseNo: "2019다9",
            caseName: "다른 판례",
            court: "대법원",
            decidedAt: null,
            sourceUrl: "",
          },
        ],
        searchScopeNote: "범위 안내",
      },
    });
    render(<SameStatuteCases selfId="1" statutes={DETAIL.citedStatutes} />);
    expect(api.getStatuteCases).not.toHaveBeenCalled();
    // 링크가 없는 참조조문은 고를 수 없다
    expect(screen.queryByRole("button", { name: "구 민법 부칙" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "민법 제536조" }));
    expect(await screen.findByText("다른 판례")).toBeDefined();
    expect(screen.queryByText("보증금")).toBeNull();
    expect(screen.queryByText(/유사도|관련도 \d|승소|확률/)).toBeNull();
  });
});
