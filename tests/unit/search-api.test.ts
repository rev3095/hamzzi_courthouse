// @vitest-environment node
// 판례·조문 직접 검색 (F-003, F-004, API.md GET /cases · /cases/{id} · /statutes/{id}). 법제처는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, SEARCH_NOTICE } from "@/lib/api/respond";
import {
  citedStatutesFrom,
  parseAsOf,
  parseCaseQuery,
  parseStatuteId,
  statuteResponse,
} from "@/lib/search/browse";
import type { ArticleHit, CaseDetail, CaseHit } from "@/lib/search/types";

vi.mock("server-only", () => ({}));
const source = vi.hoisted(() => ({
  searchCases: vi.fn(),
  getCase: vi.fn(),
  getArticle: vi.fn(),
}));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => source }));
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));

const casesRoute = await import("@/app/api/v1/cases/route");
const caseRoute = await import("@/app/api/v1/cases/[id]/route");
const statuteRoute = await import("@/app/api/v1/statutes/[id]/route");

const HIT: CaseHit = {
  id: "622971",
  caseNo: "2026다201978",
  caseName: "보증금반환",
  court: "대법원",
  decidedAt: "2026-06-24",
  sourceUrl: "https://www.law.go.kr/LSW/precInfoP.do?precSeq=622971",
};
const DETAIL: CaseDetail = {
  ...HIT,
  holding: "임대차 종료 후 보증금 반환",
  summary: "임차인은 보증금을 돌려받을 때까지 …",
  refs: "[1] 주택임대차보호법 제4조 제2항, 제3조의3 / [2] 민법 제536조",
  fromBody: false,
  bodyExcerpt: null,
};
const ART: ArticleHit = {
  id: "law:민법:제565조",
  lawName: "민법",
  articleNo: "제565조",
  title: "해약금",
  text: "매매의 당사자 일방이 계약 당시에 금전 기타 물건을 계약금 …",
  effectiveFrom: "2015-02-03",
  sourceUrl: "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EB%AF%BC%EB%B2%95/%EC%A0%9C565%EC%A1%B0",
};

const get = (url: string) => new Request(`http://localhost${url}`);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  rate.assertRateLimit.mockResolvedValue(undefined);
  source.searchCases.mockResolvedValue([HIT]);
  source.getCase.mockResolvedValue(DETAIL);
  source.getArticle.mockResolvedValue(ART);
});

describe("GET /cases", () => {
  test("F-003 법제처 판례 목록을 그대로, 관련도 점수 없이, AI 고지 대신 검색 고지", async () => {
    const res = await casesRoute.GET(get("/api/v1/cases?q=%EB%B3%B4%EC%A6%9D%EA%B8%88"), {});
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items).toEqual([HIT]);
    expect(data.items[0]).not.toHaveProperty("relevance");
    expect(data).toMatchObject({ outcome: "grounded", notice: SEARCH_NOTICE });
    expect(data.notice).not.toBe(AI_NOTICE);
    expect(source.searchCases).toHaveBeenCalledWith("보증금", 10);
    expect(rate.assertRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "search" }),
      expect.any(Headers),
    );
  });

  test("F-003 AC2 결과 없음은 오류가 아니다 (200 no_result_in_scope)", async () => {
    source.searchCases.mockResolvedValue([]);
    const { data } = await (await casesRoute.GET(get("/api/v1/cases?q=x"), {})).json();
    expect(data.outcome).toBe("no_result_in_scope");
  });

  test("빈 검색어 400 EMPTY_INPUT, 개인정보로 보이는 검색어는 법제처로 보내지 않는다 (F-007)", async () => {
    expect((await casesRoute.GET(get("/api/v1/cases?q=%20"), {})).status).toBe(400);
    const res = await casesRoute.GET(get("/api/v1/cases?q=010-1234-5678"), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual({ field: "q", reason: "personal_info" });
    expect(source.searchCases).not.toHaveBeenCalled();
  });

  test("레이트 리밋 초과 429 RATE_LIMITED — 법제처를 부르지 않는다", async () => {
    rate.assertRateLimit.mockRejectedValue(
      new ApiError("RATE_LIMITED", { reason: "search_hourly" }),
    );
    expect((await casesRoute.GET(get("/api/v1/cases?q=x"), {})).status).toBe(429);
    expect(source.searchCases).not.toHaveBeenCalled();
  });

  test("F-006 AC2 법제처 실패는 502 SEARCH_UPSTREAM_FAILED", async () => {
    source.searchCases.mockRejectedValue(new ApiError("SEARCH_UPSTREAM_FAILED"));
    expect((await casesRoute.GET(get("/api/v1/cases?q=x"), {})).status).toBe(502);
  });

  test("limit 범위 밖은 400", () => {
    expect(() => parseCaseQuery(new URLSearchParams("q=a&limit=21"))).toThrow(ApiError);
    expect(parseCaseQuery(new URLSearchParams("q=a&limit=20")).limit).toBe(20);
  });
});

describe("GET /cases/{id}", () => {
  test("F-003 AC3 판시사항·판결요지와 참조조문만, 전문 없음 (DEC-007)", async () => {
    const { data } = await (
      await caseRoute.GET(get("/api/v1/cases/622971"), params("622971"))
    ).json();
    expect(data.sections.map((s: { section: string }) => s.section)).toEqual([
      "판시사항",
      "판결요지",
    ]);
    expect(data).not.toHaveProperty("fullText");
    expect(data.citedStatutes.map((c: { raw: string }) => c.raw)).toEqual([
      "주택임대차보호법 제4조",
      "주택임대차보호법 제3조의3",
      "민법 제536조",
    ]);
    expect(data.notice).toBe(SEARCH_NOTICE);
  });

  test("F-003 AC3 법제처에 없으면 404, 대체 내용을 만들지 않는다", async () => {
    source.getCase.mockResolvedValue(null);
    expect((await caseRoute.GET(get("/api/v1/cases/1"), params("1"))).status).toBe(404);
    expect((await caseRoute.GET(get("/api/v1/cases/abc"), params("abc"))).status).toBe(404);
  });
});

describe("GET /statutes/{id}", () => {
  const id = encodeURIComponent("민법:제565조");

  test("F-004 조문 본문과 시행일, 현행 여부", async () => {
    const { data } = await (
      await statuteRoute.GET(get(`/api/v1/statutes/${id}`), params(id))
    ).json();
    expect(data).toMatchObject({
      id: "민법:제565조",
      lawName: "민법",
      articleNo: "제565조",
      articleTitle: "해약금",
      effectiveFrom: "2015-02-03",
      isCurrent: true,
      notice: SEARCH_NOTICE,
    });
    expect(source.getArticle).toHaveBeenCalledWith("민법", "제565조");
  });

  test("F-004 AC1 asOf가 시행일 이후면 그 시점 조문 = 현행, 이전이면 만들지 않고 안내만", () => {
    const after = statuteResponse(ART, "2020-01-01", "2026-11-01");
    expect(after.versionAtDate).toMatchObject({ effectiveFrom: "2015-02-03" });
    const before = statuteResponse(ART, "2010-01-01", "2026-11-01");
    expect(before.versionAtDate).toBeNull();
    expect(before.asOfNote).toBeTruthy();
    expect(
      statuteResponse({ ...ART, effectiveFrom: "2027-01-01" }, null, "2026-11-01").isCurrent,
    ).toBe(false);
  });

  test("형식이 아닌 ID·없는 조문은 404, 잘못된 asOf는 400", async () => {
    expect(() => parseStatuteId("민법-565")).toThrow(ApiError);
    expect(() => parseAsOf(new URLSearchParams("asOf=2020-13-01"))).toThrow(ApiError);
    source.getArticle.mockResolvedValue(null);
    expect((await statuteRoute.GET(get(`/api/v1/statutes/${id}`), params(id))).status).toBe(404);
  });
});

test("참조조문 읽기: 법령명이 없는 조문은 앞 법령명을 잇고, 법령명이 없으면 만들지 않는다", () => {
  expect(citedStatutesFrom("민법 제565조, 제567조").map((c) => c.id)).toEqual([
    "민법:제565조",
    "민법:제567조",
  ]);
  expect(citedStatutesFrom("제3조 참조")).toEqual([]);
  expect(citedStatutesFrom(null)).toEqual([]);
});

describe("legal-reviewer 지적 반영", () => {
  test("절대 규칙 1 부칙·구법 조문은 현행 조문으로 잇지 않고 링크 없이 원문 그대로", () => {
    expect(citedStatutesFrom("민법 제1조, 민법 부칙(1990. 1. 13.) 제2조")).toEqual([
      { raw: "민법 제1조", id: "민법:제1조" },
      { raw: "민법 부칙(1990. 1. 13.) 제2조", id: null },
    ]);
    const old = citedStatutesFrom(
      "민법 제1조, 구 민법(1990. 1. 13. 법률 제4199호로 개정되기 전의 것) 제1000조, 제1001조",
    );
    expect(old.map((c) => c.id)).toEqual(["민법:제1조", null]);
    expect(old[1].raw).toContain("구 민법");
  });

  test("F-004 AC1 미래 날짜·시행 전 조문은 '시행 중이었다'고 하지 않는다", () => {
    const future = statuteResponse(ART, "2030-01-01", "2026-11-01");
    expect(future.versionAtDate).toBeNull();
    expect(future.asOfNote).toContain("앞으로의 날짜");
    const notYet = statuteResponse(
      { ...ART, effectiveFrom: "2027-01-01" },
      "2026-06-01",
      "2026-11-01",
    );
    expect(notYet.versionAtDate).toBeNull();
    expect(notYet.asOfNote).toContain("시행 전");
  });

  test("F-007 화면은 POST 본문으로 검색한다 (검색어가 주소에 남지 않음)", async () => {
    const res = await casesRoute.POST(
      new Request("http://localhost/api/v1/cases", {
        method: "POST",
        body: JSON.stringify({ q: "계약금", limit: 5 }),
      }),
      {},
    );
    expect(res.status).toBe(200);
    expect(source.searchCases).toHaveBeenCalledWith("계약금", 5);
    const bad = await casesRoute.POST(
      new Request("http://localhost/api/v1/cases", {
        method: "POST",
        body: JSON.stringify({ q: "  " }),
      }),
      {},
    );
    expect(bad.status).toBe(400);
  });
});
