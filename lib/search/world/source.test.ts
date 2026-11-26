// @vitest-environment node
// DEC-074 국내·해외 법령 통합 검색 — 출처 어댑터와 합치기. 네트워크는 쓰지 않고 녹화한 공식 API 응답(tests/fixtures/world)으로 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { LawHit } from "@/lib/search/types";
import auTitles from "@/tests/fixtures/world/au-titles.json";
import ecfrSearch from "@/tests/fixtures/world/ecfr-search.json";
import egovKeyword from "@/tests/fixtures/world/egov-keyword.json";
import egovLaws from "@/tests/fixtures/world/egov-laws.json";
import fdaEnforcement from "@/tests/fixtures/world/openfda-enforcement.json";
import { CATALOG } from "./catalog";
import { COUNTRY_CODES, type CountryCode } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search/law-source", () => ({
  createLawSource: () => {
    throw new Error("테스트는 법제처를 부르지 않는다");
  },
}));

const {
  auHits,
  ecfrHits,
  egovHits,
  fdaCases,
  fdaWords,
  PER_COUNTRY_LIMIT,
  searchWorldCases,
  searchWorldLaws,
  ukHits,
  WORLD_USER_AGENT,
} = await import("./source");

const ukFeed = readFileSync(join(process.cwd(), "tests/fixtures/world/uk-feed.xml"), "utf8");

const KR_HIT: LawHit = {
  id: "270001",
  name: "의료기기법",
  kind: "법률",
  agency: "식품의약품안전처",
  promulgatedAt: "2026-01-01",
  effectiveFrom: "2026-07-01",
  sourceUrl:
    "https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9D%98%EB%A3%8C%EA%B8%B0%EA%B8%B0%EB%B2%95",
};
const KR_OTHER: LawHit = {
  ...KR_HIT,
  id: "270002",
  name: "의료기기 허가·신고·심사 등에 관한 규정",
};

type Reply = "ok" | "fail" | "http500" | "hang";
function fakeFetch(over: Partial<Record<"us" | "jp" | "uk" | "au" | "fda", Reply>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    const host = new URL(url).host;
    const key =
      host === "www.ecfr.gov"
        ? "us"
        : host === "laws.e-gov.go.jp"
          ? "jp"
          : host === "www.legislation.gov.uk"
            ? "uk"
            : host === "api.prod.legislation.gov.au"
              ? "au"
              : host === "api.fda.gov"
                ? "fda"
                : null;
    if (!key) throw new Error(`허용하지 않은 주소: ${host}`);
    const mode = over[key] ?? "ok";
    if (mode === "fail") throw new Error("network");
    if (mode === "http500") return new Response("x", { status: 500 });
    if (mode === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    if (key === "us") return json(ecfrSearch);
    if (key === "jp") return json(url.includes("/keyword") ? egovKeyword : egovLaws);
    if (key === "uk") return new Response(ukFeed, { status: 200 });
    if (key === "au") return json(auTitles);
    return json(fdaEnforcement);
  };
  return { fetch: fn as typeof fetch, calls };
}

const countryOrder = (list: { country: CountryCode }[]) =>
  list.map((h) => COUNTRY_CODES.indexOf(h.country));
const sorted = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);

describe("DEC-074 searchWorldLaws", () => {
  test("목록(핵심 법령) 먼저, 그다음 나라 순서대로 각 출처 순서 그대로 잇는다 — 관련도 점수 없음", async () => {
    const f = fakeFetch();
    const koreanSearch = vi.fn(async () => [KR_OTHER]);
    const r = await searchWorldLaws("의료기기 리콜", { fetch: f.fetch, koreanSearch });

    expect(r.failed).toEqual([]);
    expect(r.translated).toEqual({ en: "medical device recall", ja: "医療機器 回収" });
    const curated = r.items.filter((h) => h.curated);
    const live = r.items.filter((h) => !h.curated);
    expect(curated.length).toBeGreaterThan(0);
    expect(live.length).toBeGreaterThan(0);
    expect(r.items.slice(0, curated.length)).toEqual(curated);
    expect(sorted(countryOrder(curated))).toBe(true);
    expect(sorted(countryOrder(live))).toBe(true);
    // 일본 결과는 목록에 있는 법령이라 목록 줄 하나로 합쳐진다
    expect(new Set(live.map((h) => h.country))).toEqual(new Set(["kr", "us", "uk", "au"]));
    expect(curated.filter((h) => h.id === "jp:335AC0000000145")).toHaveLength(1);
    // 출처가 준 순서 그대로
    expect(live.filter((h) => h.country === "us").map((h) => h.citation)).toEqual([
      "21 CFR 810.13",
      "21 CFR 810.14",
      "21 CFR 810.17",
    ]);
    for (const h of r.items) {
      expect(h).not.toHaveProperty("score");
      expect(h).not.toHaveProperty("relevance");
      expect(h.sourceUrl.startsWith("https://")).toBe(true);
    }
    expect(new Set(r.items.map((h) => h.id)).size).toBe(r.items.length);
  });

  test("요청에는 일반 클라이언트 이름만 싣고, 한국어 검색어는 해외로 보내지 않는다", async () => {
    const f = fakeFetch();
    await searchWorldLaws("의료기기 리콜", { fetch: f.fetch, koreanSearch: async () => [] });
    expect(f.calls.length).toBeGreaterThanOrEqual(4);
    for (const c of f.calls) {
      expect((c.init?.headers as Record<string, string>)["User-Agent"]).toBe(WORLD_USER_AGENT);
      expect(decodeURIComponent(c.url)).not.toMatch(/[가-힣]/);
      expect(c.init?.signal).toBeInstanceOf(AbortSignal);
    }
    const us = new URL(f.calls.find((c) => c.url.includes("ecfr.gov"))!.url);
    expect(us.searchParams.get("query")).toBe("medical device recall");
    expect(us.searchParams.get("hierarchy[title]")).toBe("21");
    // 낱말이 여러 개면 일본은 본문 검색으로 찾는다
    expect(f.calls.some((c) => c.url.includes("/api/2/keyword?"))).toBe(true);
    const au = new URL(f.calls.find((c) => c.url.includes("legislation.gov.au"))!.url);
    expect(au.searchParams.get("$filter")).toBe(
      "contains(name,'medical device recall') and isInForce eq true",
    );
  });

  test("목록과 실시간 결과에 같은 법령이 있으면 한 줄만 — 목록의 한국어 이름·설명을 살리고 날짜만 더한다", async () => {
    const f = fakeFetch();
    const r = await searchWorldLaws("의료기기", {
      fetch: f.fetch,
      koreanSearch: async () => [KR_HIT, KR_OTHER],
    });
    const one = (id: string) => r.items.filter((h) => h.id === id);

    const kr = one("kr:의료기기법");
    expect(kr).toHaveLength(1);
    expect(kr[0]).toMatchObject({ curated: true, date: "2026-07-01" });
    expect(kr[0].snippet).toBe(CATALOG.find((e) => e.id === "kr:의료기기법")!.snippet);

    const uk = one("uk:ukpga/2021/3");
    expect(uk).toHaveLength(1);
    expect(uk[0]).toMatchObject({
      curated: true,
      titleKo: "영국 의약품·의료기기법",
      date: "2021-02-11",
      sourceUrl: "https://www.legislation.gov.uk/ukpga/2021/3/contents",
    });
    expect(one("jp:335AC0000000145")[0].titleKo).toMatch(/약기법/);
    // 낱말이 하나면 일본은 법령 이름으로 찾는다
    expect(f.calls.some((c) => c.url.includes("/api/2/laws?"))).toBe(true);
    expect(r.items.some((h) => h.id === "kr:의료기기 허가·신고·심사 등에 관한 규정")).toBe(true);
  });

  test("나라마다 정해 둔 줄 수까지만 보인다", async () => {
    const many: LawHit[] = Array.from({ length: 30 }, (_, i) => ({
      ...KR_HIT,
      id: String(i),
      name: `의료기기 가상 규정 ${i}`,
    }));
    const r = await searchWorldLaws("의료기기", {
      fetch: fakeFetch().fetch,
      koreanSearch: async () => many,
    });
    for (const c of COUNTRY_CODES) {
      expect(r.items.filter((h) => h.country === c).length).toBeLessThanOrEqual(PER_COUNTRY_LIMIT);
    }
    expect(r.items.filter((h) => h.country === "kr")).toHaveLength(PER_COUNTRY_LIMIT);
  });

  test("출처 하나가 실패해도 나머지는 그대로 주고, 실패한 나라만 failed로 알린다", async () => {
    const f = fakeFetch({ jp: "fail", au: "http500" });
    const r = await searchWorldLaws("의료기기 리콜", {
      fetch: f.fetch,
      koreanSearch: async () => {
        throw new Error("법제처 연결 실패");
      },
    });
    expect(r.failed).toEqual(["kr", "jp", "au"]);
    expect(r.items.some((h) => h.country === "us" && !h.curated)).toBe(true);
    expect(r.items.some((h) => h.country === "uk" && !h.curated)).toBe(true);
    // 실패한 나라도 목록의 핵심 법령은 그대로 보인다
    expect(r.items.some((h) => h.country === "kr" && h.curated)).toBe(true);
  });

  test("시간 한도를 넘긴 출처는 끊고 failed로 알린다", async () => {
    const f = fakeFetch({ uk: "hang" });
    const r = await searchWorldLaws("의료기기 리콜", {
      fetch: f.fetch,
      koreanSearch: async () => [],
      timeoutMs: 30,
    });
    expect(r.failed).toEqual(["uk"]);
    expect(f.calls.find((c) => c.url.includes("legislation.gov.uk"))!.init!.signal!.aborted).toBe(
      true,
    );
  });

  test("이름으로 찾는 출처는 결과가 없으면 첫 낱말만으로 한 번 더 찾는다", async () => {
    const koreanSearch = vi.fn(async (q: string) => (q === "의료기기" ? [KR_OTHER] : []));
    const r = await searchWorldLaws("의료기기 허가", { fetch: fakeFetch().fetch, koreanSearch });
    expect(koreanSearch.mock.calls.map((c) => c[0])).toEqual(["의료기기 허가", "의료기기"]);
    expect(r.items.some((h) => h.id === `kr:${KR_OTHER.name}`)).toBe(true);
  });

  test("영문 검색어는 법제처·일본으로 보내지 않고, 바꿀 말이 없는 한국어는 해외로 보내지 않는다", async () => {
    const f = fakeFetch();
    const koreanSearch = vi.fn(async () => []);
    const en = await searchWorldLaws("quality system", { fetch: f.fetch, koreanSearch });
    expect(koreanSearch).not.toHaveBeenCalled();
    expect(f.calls.some((c) => c.url.includes("e-gov.go.jp"))).toBe(false);
    expect(en.translated).toEqual({ en: "quality system" });

    const g = fakeFetch();
    const ko = await searchWorldLaws("임대차 보증금", { fetch: g.fetch, koreanSearch });
    expect(g.calls).toHaveLength(0);
    expect(ko).toEqual({ items: [], failed: [], translated: {} });
    expect(koreanSearch).toHaveBeenCalledWith("임대차 보증금");
  });

  test("빈 검색어는 아무 곳도 부르지 않는다", async () => {
    const f = fakeFetch();
    const koreanSearch = vi.fn(async () => []);
    expect(await searchWorldLaws("   ", { fetch: f.fetch, koreanSearch })).toEqual({
      items: [],
      failed: [],
      translated: {},
    });
    expect(f.calls).toHaveLength(0);
    expect(koreanSearch).not.toHaveBeenCalled();
  });
});

describe("DEC-074 출처별 정리", () => {
  test("eCFR: 조문 인용·주소를 만들고 강조 태그를 지운다. 지난 판·삭제·예약 조문은 뺀다", () => {
    const hits = ecfrHits(ecfrSearch);
    expect(hits[0]).toMatchObject({
      id: "us:21cfr-810.13",
      country: "us",
      title: "Mandatory recall order.",
      kind: "연방규정 조문",
      citation: "21 CFR 810.13",
      date: "2016-12-30",
      sourceUrl: "https://www.ecfr.gov/current/title-21/section-810.13",
    });
    expect(hits[0].snippet).toMatch(/^Part 810 Medical Device Recall Authority — /);
    expect(JSON.stringify(hits)).not.toMatch(/<strong>|<span/);

    const rows = structuredClone(ecfrSearch.results) as Record<string, unknown>[];
    rows[0].ends_on = "2020-01-01";
    rows[1].removed = true;
    expect(ecfrHits({ results: rows }).map((h) => h.citation)).toEqual(["21 CFR 810.17"]);
    expect(() => ecfrHits({ error: "x" })).toThrow();
  });

  test("e-Gov: 법령 번호·종류·주소. 본문 검색은 출처가 준 문장 조각을 태그 없이 싣는다", () => {
    const laws = egovHits(egovLaws);
    expect(laws[0]).toMatchObject({
      id: "jp:335AC0000000145",
      kind: "법률",
      citation: "昭和三十五年法律第百四十五号",
      sourceUrl: "https://laws.e-gov.go.jp/law/335AC0000000145",
    });
    expect(laws[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const byKeyword = egovHits(egovKeyword);
    expect(byKeyword[0].snippet).toContain("医療機器");
    expect(byKeyword[0].snippet).not.toMatch(/<span>/);
  });

  test("영국: Atom 피드에서 제목·종류·인용·주소를 읽는다", () => {
    const hits = ukHits(ukFeed);
    expect(hits.map((h) => h.id)).toEqual([
      "uk:ukpga/2021/3",
      "uk:uksi/2026/197",
      "uk:uksi/2025/749",
    ]);
    expect(hits[0]).toMatchObject({
      title: "Medicines and Medical Devices Act 2021",
      kind: "법률",
      citation: "2021 c. 3",
      date: "2021-02-11",
      sourceUrl: "https://www.legislation.gov.uk/ukpga/2021/3",
    });
    expect(hits[1]).toMatchObject({
      kind: "행정입법(Statutory Instrument)",
      citation: "S.I. 2026/197",
    });
    expect(hits[1].snippet).toMatch(/^These Regulations make amendments/);
    expect(() => ukHits("<html>차단</html>")).toThrow();
  });

  test("호주: 관보 공고는 빼고 현행 법률·하위법령만", () => {
    const hits = auHits(auTitles);
    expect(hits.map((h) => h.id)).toEqual(["au:F2017L01114", "au:F2018L01280"]);
    expect(hits[0]).toMatchObject({
      kind: "하위법령(Legislative Instrument)",
      date: "2017-08-29",
      sourceUrl: "https://www.legislation.gov.au/F2017L01114/latest/text",
    });
  });
});

describe("DEC-074 searchWorldCases (공개 사례)", () => {
  test("미국: openFDA 리콜 기록을 원문 그대로 — 업체 이름·주소 칸은 싣지 않는다", async () => {
    const f = fakeFetch();
    const cases = await searchWorldCases("us", "의료기기 리콜", { fetch: f.fetch });
    expect(cases).toHaveLength(2);
    expect(cases[0]).toMatchObject({
      id: "us:recall-Z-0216-2027",
      country: "us",
      kind: "리콜",
      date: "2026-09-24",
      source: "openFDA (미국 식품의약국 공개 자료)",
    });
    expect(cases[0].summary).toBe(fdaEnforcement.results[0].reason_for_recall);
    expect(cases[0].sourceUrl).toMatch(
      /^https:\/\/www\.accessdata\.fda\.gov\/scripts\/cdrh\/cfdocs\/cfRES\/res\.cfm\?start_search=1&recallnumber=Z-0216-2027$/,
    );
    for (const c of cases) expect(Object.keys(c)).not.toContain("recalling_firm");
    expect(f.calls[0].url).toBe(
      "https://api.fda.gov/device/enforcement.json?search=recall&sort=recall_initiation_date:desc&limit=5",
    );
  });

  test("검색을 좁히지 못하는 낱말은 빼고, 글자·숫자만 보낸다", () => {
    expect(fdaWords("의료기기")).toEqual([]);
    expect(fdaWords("infusion pump (recall) OR x=1")).toEqual(["infusion", "pump", "recall"]);
    expect(fdaWords("의료기기 품질관리 리콜")).toEqual([
      "quality",
      "management",
      "system",
      "recall",
    ]);
  });

  test("다른 나라는 빈 목록이고 아무 곳도 부르지 않는다. 기록 없음(404)·실패도 빈 목록", async () => {
    const f = fakeFetch();
    for (const c of COUNTRY_CODES.filter((x) => x !== "us")) {
      expect(await searchWorldCases(c, "리콜", { fetch: f.fetch })).toEqual([]);
    }
    expect(f.calls).toHaveLength(0);
    expect(
      await searchWorldCases("us", "리콜", { fetch: fakeFetch({ fda: "http500" }).fetch }),
    ).toEqual([]);
    expect(
      await searchWorldCases("us", "리콜", { fetch: fakeFetch({ fda: "fail" }).fetch }),
    ).toEqual([]);
    expect(fdaCases({ error: { code: "NOT_FOUND" } })).toEqual([]);
  });
});
