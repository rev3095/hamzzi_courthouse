// @vitest-environment node
// korean-law-mcp 어댑터 (DEC-009). 라이브러리는 실제 응답 fixture를 돌려주는 목으로 바꾸고 변환·제외·오류 처리를 본다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import aiLaw from "@/tests/fixtures/korean-law-mcp/ai-law.json";
import findLawsFx from "@/tests/fixtures/korean-law-mcp/find-laws.json";
import lawText from "@/tests/fixtures/korean-law-mcp/law-text-article.json";
import lawTextFull from "@/tests/fixtures/korean-law-mcp/law-text-full.json";
import noHolding from "@/tests/fixtures/korean-law-mcp/precedent-record-no-holding.json";
import record from "@/tests/fixtures/korean-law-mcp/precedent-record.json";
import precSearch from "@/tests/fixtures/korean-law-mcp/precedent-search.json";
import verifyCasesFx from "@/tests/fixtures/korean-law-mcp/verify-cases.json";
import verifyMissing from "@/tests/fixtures/korean-law-mcp/verify-missing.json";
import verifyOk from "@/tests/fixtures/korean-law-mcp/verify-ok.json";
import { ApiError } from "@/lib/api/errors";

const klm = vi.hoisted(() => ({
  getLawText: vi.fn(),
  searchAiLawStructured: vi.fn(),
  searchPrecedentsStructured: vi.fn(),
  getPrecedentRecord: vi.fn(),
  verifyCitations: vi.fn(),
  verifyCaseCitations: vi.fn(),
  findLaws: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("korean-law-mcp/lib/api-client", () => ({
  LawApiClient: class {
    getLawText = klm.getLawText;
  },
}));
vi.mock("korean-law-mcp/tools/life-law", () => ({
  searchAiLawStructured: klm.searchAiLawStructured,
}));
vi.mock("korean-law-mcp/tools/precedent-search-core", () => ({
  searchPrecedentsStructured: klm.searchPrecedentsStructured,
}));
vi.mock("korean-law-mcp/tools/precedents", () => ({
  getPrecedentRecord: klm.getPrecedentRecord,
}));
vi.mock("korean-law-mcp/tools/verify-citations", () => ({ verifyCitations: klm.verifyCitations }));
vi.mock("korean-law-mcp/lib/case-citation", () => ({
  verifyCaseCitations: klm.verifyCaseCitations,
}));
vi.mock("korean-law-mcp/lib/law-search", () => ({
  findLaws: klm.findLaws,
  resolvedLawMatches: (requested: string, official: string) =>
    requested.replace(/\s/g, "") === official.replace(/\s/g, ""),
}));
vi.mock("korean-law-mcp/lib/law-parser", () => ({ buildJO: () => "000302" }));

const { createLawSource } = await import("@/lib/search/law-source");
const source = () => createLawSource({ apiKey: "test-oc-key", timeoutMs: 50 });
const text = (t: string) => ({ content: [{ type: "text", text: t }] });

beforeEach(() => vi.clearAllMocks());

describe("F-004 조문 검색", () => {
  test("지능형 지식베이스 결과를 조문 단위로 바꾼다", async () => {
    klm.searchAiLawStructured.mockResolvedValue({ articleSignals: aiLaw });
    const hits = await source().searchArticles("전세 보증금을 돌려받지 못함", 3);
    expect(hits).toHaveLength(3);
    expect(hits[1]).toMatchObject({
      id: "law:주택임대차보호법:제3조",
      lawName: "주택임대차보호법",
      articleNo: "제3조",
      title: "대항력 등",
      effectiveFrom: "2026-01-02",
    });
    expect(hits[1].text.startsWith("제3조(대항력 등)")).toBe(true);
    expect(klm.searchAiLawStructured.mock.calls[0][1]).toMatchObject({ search: "0", display: 3 });
  });

  test("법령명·조문번호로 조문 1개를 가져온다", async () => {
    klm.findLaws.mockResolvedValue(findLawsFx);
    klm.getLawText.mockResolvedValue(JSON.stringify(lawText));
    const art = await source().getArticle("주택임대차보호법", "제3조의2 제1항");
    expect(art).toMatchObject({ lawName: "주택임대차보호법", articleNo: "제3조의2" });
    expect(art!.text).toContain("① 임차인");
    expect(klm.getLawText.mock.calls[0][0]).toMatchObject({ mst: "276291" });
  });

  test("일치하는 법령이 없거나 조문 형식이 아니면 null (지어내지 않음)", async () => {
    klm.findLaws.mockResolvedValue(findLawsFx);
    expect(await source().getArticle("없는법", "제1조")).toBeNull();
    expect(await source().getArticle("주택임대차보호법", "부칙")).toBeNull();
    expect(klm.getLawText).not.toHaveBeenCalled();
  });
});

describe("F-003 판례 검색·상세", () => {
  test("국세법령정보시스템 출처(법원명 없음)는 빼고 CaseRef 형식으로 낸다 (DEC-008)", async () => {
    klm.searchPrecedentsStructured.mockResolvedValue(precSearch);
    const hits = await source().searchCases("임대차보증금 반환", 5);
    expect(hits.map((h) => h.id)).not.toContain("618893");
    expect(hits[0]).toEqual({
      id: "619451",
      caseNo: "2023다307116",
      caseName: expect.stringContaining("건물인도"),
      court: "대법원",
      decidedAt: "2026-04-09",
      sourceUrl: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=619451",
    });
  });

  test("상세는 판시사항·요지만 쓰고 판례 전문은 담지 않는다 (DEC-007)", async () => {
    klm.getPrecedentRecord.mockResolvedValue(record);
    const c = await source().getCase("619451");
    expect(c).toMatchObject({ caseNo: "2023다307116", court: "대법원", fromBody: false });
    expect(c!.holding).toContain("상가건물 임대차");
    expect(c!.bodyExcerpt).toBeNull();
    expect(JSON.stringify(c)).not.toContain("홍길동");
  });

  test("요지가 없으면 가린 본문 일부를 fromBody로 쓴다 (F-007)", async () => {
    klm.getPrecedentRecord.mockResolvedValue(noHolding);
    const c = await source().getCase("619451");
    expect(c!.fromBody).toBe(true);
    expect(c!.bodyExcerpt).toContain("제9조 제2항");
    expect(c!.bodyExcerpt).not.toContain("홍길동");
    expect(c!.bodyExcerpt).not.toContain("010-1234-5678");
  });

  test("빈 레코드는 null", async () => {
    klm.getPrecedentRecord.mockResolvedValue({});
    expect(await source().getCase("618893")).toBeNull();
  });
});

describe("F-005 AC2 ③ 인용 재조회", () => {
  test("조문 인용을 1건씩 재조회해 입력 순서대로 돌려준다", async () => {
    klm.verifyCitations.mockImplementation(async (_c, { text: t }) =>
      text(t.startsWith("민법") ? verifyMissing.text : verifyOk.text),
    );
    const res = await source().verifyStatutes([
      "주택임대차보호법 제3조의2",
      "민법 제9999조",
      "주택임대차보호법 제3조의2",
    ]);
    expect(res.map((r) => r.exists)).toEqual([true, false, true]);
    expect(klm.verifyCitations).toHaveBeenCalledTimes(2); // 중복은 한 번만
  });

  test("사건번호를 한 번에 재조회한다", async () => {
    klm.verifyCaseCitations.mockResolvedValue(verifyCasesFx);
    const res = await source().verifyCases(["2023다307116", "2099다99999"]);
    expect(res.map((r) => r.exists)).toEqual([true, false]);
    expect(await source().verifyCases([])).toEqual([]);
  });
});

describe("F-006 AC2 검색 오류 구분", () => {
  test("업스트림 오류는 SEARCH_UPSTREAM_FAILED로 바꾸고 원래 문구를 버린다", async () => {
    klm.searchPrecedentsStructured.mockRejectedValue(
      new Error(
        "API 오류 (500) - https://www.law.go.kr/DRF/lawSearch.do?OC=test-oc-key&query=보증금",
      ),
    );
    const err = await source()
      .searchCases("보증금")
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("SEARCH_UPSTREAM_FAILED");
    expect(JSON.stringify({ m: err.message, d: err.details })).not.toMatch(/test-oc-key|보증금/);
  });

  test("시간 한도를 넘으면 timeout으로 끝낸다", async () => {
    klm.searchAiLawStructured.mockReturnValue(new Promise(() => {}));
    const err = await source()
      .searchArticles("보증금")
      .catch((e) => e);
    expect(err.code).toBe("SEARCH_UPSTREAM_FAILED");
    expect(err.details).toMatchObject({ reason: "timeout" });
  });

  test("인증키가 없으면 변수 이름만 알린다", () => {
    const prev = process.env.OPEN_LAW_API_KEY;
    delete process.env.OPEN_LAW_API_KEY;
    expect(() => createLawSource()).toThrow("OPEN_LAW_API_KEY");
    if (prev !== undefined) process.env.OPEN_LAW_API_KEY = prev;
  });
});

describe("DEC-014 프로토타입 방식 법령 검색 (findArticles)", () => {
  test("법령 전문에서 키워드 점수(제목 3·본문 2) 순으로 상위 조문만, 장 제목은 뺀다", async () => {
    klm.findLaws.mockResolvedValue(findLawsFx);
    klm.getLawText.mockResolvedValue(JSON.stringify(lawTextFull));
    const hits = await source().findArticles("주택임대차보호법", ["보증금", "임차권등기명령"], 3);
    // 제3조의3: 제목 임차권등기명령(3)+본문 임차권등기명령(2)+본문 보증금(2)=7, 제4조: 보증금(2), 제7조: 보증금(2)
    expect(hits.map((h) => h.articleNo)).toEqual(["제3조의3", "제4조", "제7조"]);
    expect(hits[0]).toMatchObject({
      id: "law:주택임대차보호법:제3조의3",
      lawName: "주택임대차보호법",
      title: "임차권등기명령",
    });
    expect(hits[0].text).toContain("임차권등기명령을 신청할 수 있다");
    // 조문번호 없이 전문을 받는다
    expect(klm.getLawText).toHaveBeenCalledWith({ mst: "276291" });
  });

  test("법령을 못 찾거나 키워드가 없으면 빈 목록", async () => {
    klm.findLaws.mockResolvedValue([]);
    expect(await source().findArticles("없는법", ["보증금"])).toEqual([]);
    expect(await source().findArticles("주택임대차보호법", [" "])).toEqual([]);
    expect(klm.getLawText).not.toHaveBeenCalled();
  });

  test("F-006 AC2 업스트림 실패는 SEARCH_UPSTREAM_FAILED", async () => {
    klm.findLaws.mockResolvedValue(findLawsFx);
    klm.getLawText.mockRejectedValue(new Error("upstream 500 ?OC=secret"));
    await expect(source().findArticles("주택임대차보호법", ["보증금"])).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  test("판례는 판례명과 본문을 함께 검색한다", async () => {
    klm.searchPrecedentsStructured.mockResolvedValue(precSearch);
    await source().searchCases("임대차보증금 반환", 6);
    expect(klm.searchPrecedentsStructured).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ search: "both", display: 12 }),
    );
  });
});
