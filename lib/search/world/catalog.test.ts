// DEC-074 의료기기 핵심 법령 목록 — 공식 주소·중립 설명·검색 규칙.
import { describe, expect, test } from "vitest";
import { CATALOG, catalogByCountry, catalogSearch, OFFICIAL_HOSTS } from "./catalog";
import { COUNTRIES, COUNTRY_CODES } from "./types";

const ids = (q: string) => catalogSearch(q).map((h) => h.id);

describe("DEC-074 핵심 법령 목록", () => {
  test("모든 줄은 공식 사이트의 https 주소이고 id가 겹치지 않는다", () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    for (const e of CATALOG) {
      const url = new URL(e.sourceUrl);
      expect(url.protocol).toBe("https:");
      expect(OFFICIAL_HOSTS as readonly string[]).toContain(url.host);
      expect(e.id.startsWith(`${e.country}:`)).toBe(true);
      expect(e.curated).toBe(true);
      expect(e.source).toBeTruthy();
    }
  });

  test("설명은 한국어 해요체 한 줄이고 숫자·단정 표현·판단을 담지 않는다 (절대 규칙 2·3)", () => {
    for (const e of CATALOG) {
      expect(e.snippet, e.id).toMatch(/[가-힣]/);
      expect(e.snippet, e.id).toMatch(/요\.$/);
      expect(e.snippet, e.id).not.toMatch(/[0-9０-９%]/);
      expect(e.snippet, e.id).not.toMatch(
        /반드시|무조건|확실|절대|처벌|벌금|징역|이내|까지|유리|불리|승소/,
      );
    }
  });

  test("국내 법령은 사이트 안 법령 화면으로, 해외 법령은 한국어 이름과 함께 공식 원문으로만 간다", () => {
    for (const e of CATALOG) {
      if (e.country === "kr") {
        expect(e.internal).toBe(`/laws/${encodeURIComponent(e.title)}`);
        expect(decodeURIComponent(e.sourceUrl)).toBe(`https://www.law.go.kr/법령/${e.title}`);
      } else {
        expect(e.internal).toBeUndefined();
        expect(e.titleKo, e.id).toMatch(/[가-힣]/);
      }
    }
  });

  test("요청한 핵심 법령이 들어 있다", () => {
    const all = CATALOG.map((e) => e.id);
    for (const id of [
      "kr:의료기기법",
      "kr:의료기기법 시행령",
      "kr:의료기기법 시행규칙",
      "kr:체외진단의료기기법",
      "kr:디지털의료제품법",
      "kr:약사법",
      "us:fdca-ch5",
      "us:21cfr-part-820",
      "us:21cfr-part-807",
      "eu:reg/2017/745",
      "eu:reg/2017/746",
      "eu:reg/2024/1689",
      "jp:335AC0000000145",
      "uk:uksi/2002/618",
      "uk:ukpga/2021/3",
      "ca:SOR-98-282",
      "au:C2004A03952",
      "cn:order-739",
    ]) {
      expect(all).toContain(id);
    }
  });

  test("나라 순서대로 묶고, 실시간 출처가 없는 나라는 목록으로만 보인다", () => {
    const groups = catalogByCountry();
    const order = groups.map((g) => g.country);
    expect(order).toEqual(COUNTRY_CODES.filter((c) => order.includes(c)));
    expect(order.slice(0, 2)).toEqual(["kr", "us"]);
    for (const c of ["eu", "ca", "cn"] as const) {
      expect(COUNTRIES[c].liveSource).toBeNull();
      expect(order).toContain(c);
    }
  });
});

describe("DEC-074 catalogSearch", () => {
  test("의료기기 전반을 묻는 검색어는 목록 전체를 적어 둔 순서대로 준다", () => {
    const all = CATALOG.map((e) => e.id);
    expect(ids("의료기기")).toEqual(all);
    expect(ids("Medical Devices")).toEqual(all);
    expect(ids("医療機器")).toEqual(all);
    expect(ids("의료기기를")).toEqual(all);
  });

  test("낱말이 더 있으면 그 낱말에 맞는 줄만 — 한국어·영어·일본어 어느 쪽으로도 찾는다", () => {
    const recall = ids("의료기기 리콜");
    expect(recall).toContain("us:21cfr-part-806");
    expect(recall).toContain("kr:의료기기법");
    expect(recall).not.toContain("us:21cfr-part-801");
    expect(ids("품질관리")).toContain("us:21cfr-part-820");
    expect(ids("quality")).toContain("us:21cfr-part-820");
    expect(ids("薬機法")).toEqual([
      "jp:335AC0000000145",
      "jp:336CO0000000011",
      "jp:336M50000100001",
    ]);
    expect(ids("체외진단")).toEqual(
      expect.arrayContaining(["kr:체외진단의료기기법", "eu:reg/2017/746"]),
    );
  });

  test("법 이름은 분야 이름으로 보지 않는다 ('의료기기법'은 목록 전체가 아니다)", () => {
    const r = ids("의료기기법");
    expect(r).toContain("kr:의료기기법");
    expect(r).not.toContain("us:21cfr-part-801");
  });

  test("상관없는 검색어·빈 검색어는 빈 목록 (지어내지 않는다)", () => {
    expect(ids("임대차 보증금")).toEqual([]);
    expect(ids("  ")).toEqual([]);
  });

  test("검색 결과에는 내부용 keywords를 싣지 않는다", () => {
    expect(catalogSearch("의료기기")[0]).not.toHaveProperty("keywords");
  });
});
