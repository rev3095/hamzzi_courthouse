// @vitest-environment node
// 탐색 확장 (DEC-029 제안): 결정문 통합 검색·바로 가기·시점 조문·신구 대조·3단 비교·자치법규·연계·위임 대조. 법제처는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, SEARCH_NOTICE } from "@/lib/api/respond";
import {
  annexRefs,
  atDateResponse,
  decisionDetail,
  decisionHit,
  delegationChecks,
  diffLines,
  directTarget,
  ordinanceDetail,
  ordinanceHits,
  ordinanceLinks,
  parseLawName,
  parseOldNew,
  parseSearchText,
  threeTier,
} from "@/lib/search/explore";
import type { ArticleHit, LawVersion } from "@/lib/search/types";

vi.mock("server-only", () => ({}));
const source = vi.hoisted(() => ({
  getArticle: vi.fn(),
  getArticleAt: vi.fn(),
  casesCiting: vi.fn(),
  searchDecisions: vi.fn(),
  getDecision: vi.fn(),
  getThreeTier: vi.fn(),
  compareOldNew: vi.fn(),
  listVersions: vi.fn(),
  listAnnexes: vi.fn(),
  getLawArticles: vi.fn(),
  linkedOrdinances: vi.fn(),
  searchOrdinances: vi.fn(),
  getOrdinance: vi.fn(),
  searchAdminRules: vi.fn(),
}));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => source }));
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));

const decisionsRoute = await import("@/app/api/v1/decisions/route");
const decisionRoute = await import("@/app/api/v1/decisions/[domain]/[id]/route");
const statuteRoute = await import("@/app/api/v1/statutes/[id]/route");
const citingRoute = await import("@/app/api/v1/statutes/[id]/cases/route");
const lawRoute = await import("@/app/api/v1/laws/[name]/[view]/route");
const ordinancesRoute = await import("@/app/api/v1/ordinances/route");
const ordinanceRoute = await import("@/app/api/v1/ordinances/[id]/route");

const ART: ArticleHit = {
  id: "law:주택임대차보호법:제3조",
  lawName: "주택임대차보호법",
  articleNo: "제3조",
  title: "대항력 등",
  text: "① 임대차는 그 등기가 없는 경우에도 효력이 생긴다.\n② 새로 들어온 항",
  effectiveFrom: "2023-04-18",
  sourceUrl: "https://www.law.go.kr",
};
const VERSION: LawVersion = {
  mst: "100",
  lawName: "주택임대차보호법",
  effectiveFrom: "2008-03-21",
  promulgatedAt: "2008-03-21",
  promulgationNo: "8923",
  revisionType: "일부개정",
};

const get = (url: string) => new Request(`http://localhost${url}`);
const post = (url: string, body: unknown) =>
  new Request(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body) });
// 응답 모양을 느슨하게 읽는다 (필드별 단언은 각 테스트가 한다)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as { data: any };

beforeEach(() => {
  vi.clearAllMocks();
  source.getArticle.mockResolvedValue(ART);
});

describe("바로 가기", () => {
  test("법령명(약칭 포함) + 조문 번호는 조문으로, 사건번호는 판례로", () => {
    expect(directTarget("민법 750조")).toMatchObject({ kind: "statute", id: "민법:제750조" });
    expect(directTarget("주택임대차법 제3조의2")).toMatchObject({
      kind: "statute",
      lawName: "주택임대차법",
      articleNo: "제3조의2",
    });
    expect(directTarget("2023다12345")).toEqual({ kind: "case", caseNo: "2023다12345" });
  });
  test("일반 검색어는 바로 가지 않는다", () => {
    expect(directTarget("임대차 보증금 반환")).toBeNull();
    expect(directTarget("보증금 3조 문제")).toBeNull();
  });
});

describe("검색어 검사 (F-007)", () => {
  test("개인정보로 보이는 검색어는 법제처로 보내지 않는다", async () => {
    expect(() => parseSearchText("")).toThrow(ApiError);
    const res = await decisionsRoute.POST(
      post("/api/v1/decisions", { domain: "interpretation", q: "010-1234-5678 임대차" }),
      {} as never,
    );
    expect(res.status).toBe(400);
    expect(source.searchDecisions).not.toHaveBeenCalled();
  });
});

describe("결정문", () => {
  test("목록은 법제처가 준 값만, 상세 링크의 인증키 주소는 쓰지 않는다", () => {
    const hit = decisionHit("interpretation", {
      법령해석례일련번호: "339999",
      안건명: "국토교통부 - 공공임대주택 재계약",
      법령해석례번호: "24-0704",
      회신일자: "2024.09.23",
      해석기관명: "법제처",
      법령해석례상세링크: "/DRF/lawService.do?OC=SECRET&target=expc",
    });
    expect(hit).toMatchObject({ id: "339999", refNo: "24-0704", decidedAt: "2024-09-23" });
    expect(JSON.stringify(hit)).not.toContain("SECRET");
    expect(decisionHit("interpretation", { 안건명: "번호 없음" })).toBeNull();
  });

  test("상세는 요지 항목만 싣고 이유 전문은 싣지 않는다 (DEC-007과 같은 원칙)", () => {
    const d = decisionDetail("tax_tribunal", "105794", {
      SpecialDeccService: {
        사건명: "쟁점농지 양도",
        재결청: "조세심판원",
        의결일자: "20200616",
        주문: "심판청구를 기각한다.",
        재결요지: "요지 문장",
        이유: "1. 처분개요 가. 청구인은 …",
      },
    });
    expect(d?.sections.map((s) => s.section)).toEqual(["주문", "재결요지"]);
    expect(JSON.stringify(d)).not.toContain("처분개요");
    expect(decisionDetail("constitutional", "1", {})).toBeNull();
  });

  test("없는 종류·형식이 아닌 번호·법제처에 없는 자료는 404, 응답은 SEARCH_NOTICE", async () => {
    const ctx = (domain: string, id: string) => ({ params: Promise.resolve({ domain, id }) });
    expect((await decisionRoute.GET(get("/x"), ctx("nope", "1"))).status).toBe(404);
    expect((await decisionRoute.GET(get("/x"), ctx("interpretation", "abc"))).status).toBe(404);
    source.getDecision.mockResolvedValue(null);
    expect((await decisionRoute.GET(get("/x"), ctx("interpretation", "1"))).status).toBe(404);
    source.searchDecisions.mockResolvedValue([]);
    const res = await decisionsRoute.POST(
      post("/api/v1/decisions", { domain: "constitutional", q: "임대차" }),
      {} as never,
    );
    const body = await json(res);
    expect(body.data.outcome).toBe("no_result_in_scope");
    expect(body.data.notice).toBe(SEARCH_NOTICE);
    expect(body.data.notice).not.toBe(AI_NOTICE);
  });
});

describe("시점 조문 (F-004 AC1)", () => {
  test("줄 단위 비교: 빠진 줄·들어온 줄을 가른다", () => {
    expect(diffLines("가\n나\n다", "가\n다\n라")).toEqual([
      { type: "same", text: "가" },
      { type: "removed", text: "나" },
      { type: "same", text: "다" },
      { type: "added", text: "라" },
    ]);
  });

  test("과거 날짜면 법제처 연혁의 그날 조문을 현행과 함께 준다", async () => {
    source.getArticleAt.mockResolvedValue({
      status: "found",
      version: VERSION,
      article: {
        ...ART,
        text: "① 임대차는 그 등기가 없는 경우에도 효력이 생긴다.",
        effectiveFrom: "2008-03-21",
      },
    });
    const res = await statuteRoute.GET(get(`/api/v1/statutes/x?asOf=2010-01-01`), {
      params: Promise.resolve({ id: encodeURIComponent("주택임대차보호법:제3조") }),
    });
    const { data } = await json(res);
    expect(source.getArticleAt).toHaveBeenCalledWith("주택임대차보호법", "제3조", "2010-01-01");
    expect(data.atDate.version.promulgationNo).toBe("8923");
    expect(data.atDate.sameAsCurrent).toBe(false);
    expect(data.atDate.diff.at(-1)).toEqual({ type: "added", text: "② 새로 들어온 항" });
    expect(data.asOfNote).toBeUndefined();
  });

  test("그날 시행 버전이 없거나 조회에 실패하면 만들지 않고 안내만", async () => {
    expect(atDateResponse(ART, { status: "not_in_force" })).toMatchObject({ atDate: null });
    expect(atDateResponse(ART, { status: "no_article", version: VERSION }).atDateNote).toContain(
      "같은 번호의 조문이 없어요",
    );
    source.getArticleAt.mockRejectedValue(new ApiError("SEARCH_UPSTREAM_FAILED"));
    const res = await statuteRoute.GET(get(`/api/v1/statutes/x?asOf=2010-01-01`), {
      params: Promise.resolve({ id: encodeURIComponent("주택임대차보호법:제3조") }),
    });
    const { data } = await json(res);
    expect(res.status).toBe(200);
    expect(data.atDate).toBeNull();
    expect(data.asOfNote).toContain("불러오지 못했어요");
  });

  test("현행 시행일 이후 날짜는 연혁을 조회하지 않는다", async () => {
    await statuteRoute.GET(get(`/api/v1/statutes/x?asOf=2024-01-01`), {
      params: Promise.resolve({ id: encodeURIComponent("주택임대차보호법:제3조") }),
    });
    expect(source.getArticleAt).not.toHaveBeenCalled();
  });
});

describe("신구조문 대조", () => {
  const XML = `<OldAndNewService><구조문_기본정보><법령일련번호>252399</법령일련번호><시행일자>20230711</시행일자><공포번호>19520</공포번호><제개정구분명>일부개정</제개정구분명><법령명><![CDATA[주택임대차보호법]]></법령명></구조문_기본정보><신조문_기본정보><법령일련번호>276291</법령일련번호><시행일자>20260102</시행일자><법령명><![CDATA[주택임대차보호법]]></법령명></신조문_기본정보><구조문목록><조문 no="1"><![CDATA[3. <P>기획재정부</P>에서 물가 업무를 담당]]></조문></구조문목록><신조문목록><조문 no="1"><![CDATA[3. <P>재정경제부</P>에서 물가 업무를 담당]]></조문></신조문목록></OldAndNewService>`;
  test("법제처가 표시한 바뀐 부분만 따로 뽑고 본문에는 태그를 남기지 않는다", () => {
    const c = parseOldNew(XML, "x");
    expect(c.old).toMatchObject({ mst: "252399", effectiveFrom: "2023-07-11" });
    expect(c.oldRows[0]).toEqual({
      no: 1,
      text: "3. 기획재정부에서 물가 업무를 담당",
      changed: ["기획재정부"],
    });
    expect(c.newRows[0].changed).toEqual(["재정경제부"]);
  });
  test("대조표가 없으면 빈 목록", () => {
    expect(parseOldNew("<OldAndNewService></OldAndNewService>", "민법")).toMatchObject({
      lawName: "민법",
      oldRows: [],
      newRows: [],
    });
  });
});

describe("3단 비교 · 위임 대조", () => {
  const tier = threeTier(
    {
      meta: { lawName: "주택임대차보호법" },
      articles: [
        {
          joNum: "제3조",
          title: "제3조(대항력 등)",
          content: "① 임대차는 …",
          delegations: [
            {
              type: "시행령",
              lawName: "주택임대차보호법 시행령",
              joNum: "제2조",
              title: "대항력이 인정되는 법인",
              content: "법 제3조제2항 후단에서 …",
            },
          ],
        },
      ],
    },
    "x",
  );
  test("조문과 위임된 하위 조문을 묶는다", () => {
    expect(tier.rows[0]).toMatchObject({ articleNo: "제3조", title: "대항력 등" });
    expect(tier.rows[0].delegations[0]).toMatchObject({ type: "시행령", articleNo: "제2조" });
  });
  test("위임 문구가 있는 조문과 연결 수만 사실로 낸다 (판정·심각도 없음)", () => {
    const art = (articleNo: string, text: string): ArticleHit => ({ ...ART, articleNo, text });
    const checks = delegationChecks(
      [
        art("제3조", "대통령령으로 정하는 법인"),
        art("제8조", "그 범위와 기준은 대통령령으로 정한다."),
        art("제10조", "위임 문구가 없는 조문"),
      ],
      tier,
    );
    expect(checks.map((c) => [c.articleNo, c.linked])).toEqual([
      ["제3조", 1],
      ["제8조", 0],
    ]);
    expect(JSON.stringify(checks)).not.toMatch(/위험|심각|공백/);
  });
  test("법령 도구: 없는 보기·형식이 아닌 이름은 404, 영향 보기는 관계만", async () => {
    const ctx = (name: string, view: string) => ({ params: Promise.resolve({ name, view }) });
    expect(() => parseLawName("<script>")).toThrow(ApiError);
    expect((await lawRoute.GET(get("/x"), ctx("민법", "severity"))).status).toBe(404);
    source.getLawArticles.mockResolvedValue({ lawName: "주택임대차보호법", articles: [ART] });
    source.getThreeTier.mockResolvedValue(tier);
    source.linkedOrdinances.mockResolvedValue([]);
    const res = await lawRoute.GET(
      get("/x"),
      ctx(encodeURIComponent("주택임대차보호법"), "impact"),
    );
    const { data } = await json(res);
    expect(data.lower[0].delegations[0].lawName).toBe("주택임대차보호법 시행령");
    expect(data.notice).toBe(SEARCH_NOTICE);
    expect(JSON.stringify(data)).not.toMatch(/"severity"|위험도|심각도/);
    source.compareOldNew.mockResolvedValue(null);
    expect((await lawRoute.GET(get("/x?mst=1"), ctx("민법", "old-new"))).status).toBe(404);
    expect((await lawRoute.GET(get("/x?mst=abc"), ctx("민법", "old-new"))).status).toBe(400);
  });
});

describe("별표 · 자치법규 · 연계", () => {
  test("별표 링크는 공개 주소만 쓴다 (인증키가 든 주소 제외)", () => {
    const [a] = annexRefs(
      [
        {
          관련법령명: "근로기준법 시행규칙",
          별표명: "근로종사자 적용 제외 승인서",
          별표종류: "서식",
          별표번호: "000800",
          별표서식파일링크: "/LSW/flDownload.do?flSeq=1",
          별표서식PDF파일링크: "/DRF/lawService.do?OC=SECRET",
        },
        { 관련법령명: "다른 법 시행규칙", 별표명: "남의 서식" },
      ],
      "근로기준법 시행규칙",
    );
    expect(a).toMatchObject({
      no: "8",
      fileUrl: "https://www.law.go.kr/LSW/flDownload.do?flSeq=1",
      pdfUrl: null,
    });
  });

  const ORDIN = `<OrdinSearch><law id="1"><자치법규일련번호>2146281</자치법규일련번호><자치법규명><![CDATA[경산시 출산장려 지원에 관한 조례]]></자치법규명><지자체기관명>경상북도 경산시</지자체기관명><자치법규종류>조례</자치법규종류><시행일자>20260708</시행일자><자치법규상세링크>/DRF/lawService.do?OC=SECRET&amp;target=ordin</자치법규상세링크></law></OrdinSearch>`;
  test("자치법규 목록·상세", () => {
    const [o] = ordinanceHits(ORDIN);
    expect(o).toMatchObject({
      id: "2146281",
      name: "경산시 출산장려 지원에 관한 조례",
      region: "경상북도 경산시",
      effectiveFrom: "2026-07-08",
    });
    expect(o.sourceUrl).not.toContain("SECRET");
    const d = ordinanceDetail("2146281", {
      LawService: {
        자치법규기본정보: { 자치법규명: "경산시 출산장려 지원에 관한 조례", 시행일자: "20260708" },
        조문: {
          조: [
            {
              조문번호: ["000100", "000100"],
              조제목: "목적",
              조내용: "제1조(목적) 이 조례는 …",
              조문여부: "Y",
            },
          ],
        },
      },
    });
    expect(d?.articles).toEqual([
      { articleNo: "제1조", title: "목적", text: "제1조(목적) 이 조례는 …" },
    ]);
    expect(ordinanceDetail("1", {})).toBeNull();
  });

  test("법령-자치법규 연계는 겹치는 행을 한 번만", () => {
    const row = `<law id="1"><법령명한글><![CDATA[주택임대차보호법 시행령]]></법령명한글><법령조번호>제24조</법령조번호><자치법규일련번호>1343665</자치법규일련번호><자치법규명><![CDATA[제주특별자치도 조례]]></자치법규명><자치법규조번호>제3조</자치법규조번호></law>`;
    expect(ordinanceLinks(`<x>${row}${row}</x>`)).toEqual([
      {
        lawName: "주택임대차보호법 시행령",
        lawArticleNo: "제24조",
        ordinanceId: "1343665",
        ordinanceName: "제주특별자치도 조례",
        ordinanceArticleNo: "제3조",
      },
    ]);
  });

  test("자치법규 검색·상세 라우트: 결과 없음은 200, 없는 자료는 404, 상한을 센다", async () => {
    source.searchOrdinances.mockResolvedValue([]);
    const res = await ordinancesRoute.POST(
      post("/api/v1/ordinances", { q: "출산장려금" }),
      {} as never,
    );
    expect((await json(res)).data.outcome).toBe("no_result_in_scope");
    source.getOrdinance.mockResolvedValue(null);
    const r2 = await ordinanceRoute.GET(get("/x"), { params: Promise.resolve({ id: "1" }) });
    expect(r2.status).toBe(404);
    source.casesCiting.mockResolvedValue([]);
    await citingRoute.GET(get("/x"), {
      params: Promise.resolve({ id: encodeURIComponent("민법:제750조") }),
    });
    expect(source.casesCiting).toHaveBeenCalledWith("민법", "제750조", 6);
    expect(rate.assertRateLimit).toHaveBeenCalledTimes(3);
  });
});
