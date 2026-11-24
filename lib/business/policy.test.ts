// @vitest-environment node
// F-015 AC4 법인·사업자 공개 정보 조회 순수 규칙 (DEC-052): 요청 검증, 공식 API 응답 줄이기, 바로 가기 링크.
// 아래 응답은 두 기관의 공개 명세 모양을 본떠 직접 쓴 가상의 값이다 (실호출 녹화가 아니다 — 키를 넣은 뒤 tests/live로 확인).
import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import {
  BUSINESS_MAX_ITEMS,
  BUSINESS_NOTICE,
  businessLinks,
  parseCorpOutline,
  parseLookupRequest,
  parseNaverLocal,
  toResult,
} from "./policy";

const detailsOf = (fn: () => unknown): Record<string, unknown> | null => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiError) return { code: e.code, ...e.details };
    throw e;
  }
  return null;
};

describe("F-015 AC4 조회 요청", () => {
  test("이름을 다듬어 받는다", () => {
    expect(parseLookupRequest({ name: "  주식회사   한빛주택 " })).toEqual({
      name: "주식회사 한빛주택",
    });
  });

  test("비었거나 모양이 맞지 않거나 연락처·주소가 섞인 이름은 받지 않는다 (값은 오류에 없다)", () => {
    expect(detailsOf(() => parseLookupRequest({}))?.code).toBe("VALIDATION_ERROR");
    expect(detailsOf(() => parseLookupRequest({ name: "  " }))?.code).toBe("EMPTY_INPUT");
    expect(detailsOf(() => parseLookupRequest({ name: "가" }))?.reason).toBe("format");
    expect(detailsOf(() => parseLookupRequest({ name: "가".repeat(41) }))?.reason).toBe("format");
    expect(detailsOf(() => parseLookupRequest({ name: "<b>한빛</b>" }))?.reason).toBe("format");
    const err = detailsOf(() => parseLookupRequest({ name: "한빛상사 010-1234-5678" }));
    expect(err).toEqual({ code: "VALIDATION_ERROR", fields: ["name"], reason: "contact_info" });
  });
});

describe("F-015 AC4 응답 줄이기", () => {
  test("네이버 지역 검색: 강조 태그를 떼고 상호·분류·주소·링크만 (전화번호는 싣지 않는다)", () => {
    const items = parseNaverLocal({
      items: [
        {
          title: "<b>한빛</b>주택 &amp; 건설",
          link: "https://example.com/hanbit",
          category: "건설업>주택건설",
          telephone: "02-000-0000",
          address: "서울특별시 가상구 가상동 1",
          roadAddress: "서울특별시 가상구 가상로 1",
          mapx: "1",
          mapy: "2",
        },
        { title: "", link: "javascript:alert(1)" },
        { title: "한빛상사", link: "javascript:alert(1)", category: "" },
      ],
    });
    expect(items).toEqual([
      {
        title: "한빛주택 & 건설",
        category: "건설업>주택건설",
        address: "서울특별시 가상구 가상동 1",
        roadAddress: "서울특별시 가상구 가상로 1",
        link: "https://example.com/hanbit",
      },
      { title: "한빛상사", category: null, address: null, roadAddress: null, link: null },
    ]);
    expect(JSON.stringify(items)).not.toContain("02-000-0000");
    expect(parseNaverLocal(null)).toEqual([]);
    expect(parseNaverLocal({ items: "x" })).toEqual([]);
  });

  test("기업기본정보: 대표자·등록번호·전화는 싣지 않고, 같은 법인은 한 번만", () => {
    const row = {
      corpNm: "주식회사 한빛주택",
      enpRprFnm: "홍길동",
      crno: "1101110000000",
      bzno: "1000000000",
      enpTlno: "02-000-0000",
      enpBsadr: "서울특별시 가상구 가상로 1",
      enpEstbDt: "20010315",
      sicNm: "주거용 건물 건설업",
      enpHmpgUrl: "www.example.com",
    };
    const items = parseCorpOutline({
      response: { body: { items: { item: [row, { ...row, fstOpegDt: "20240101" }] } } },
    });
    expect(items).toEqual([
      {
        corpName: "주식회사 한빛주택",
        address: "서울특별시 가상구 가상로 1",
        establishedAt: "2001-03-15",
        industry: "주거용 건물 건설업",
        homepage: "http://www.example.com/",
      },
    ]);
    const dumped = JSON.stringify(items);
    for (const hidden of ["홍길동", "1101110000000", "1000000000", "02-000-0000"]) {
      expect(dumped).not.toContain(hidden);
    }
  });

  test("기업기본정보: 항목이 하나(객체)이거나 없어도 읽는다. 최대 개수를 넘기지 않는다", () => {
    expect(
      parseCorpOutline({ response: { body: { items: { item: { corpNm: "한빛상사" } } } } }),
    ).toHaveLength(1);
    expect(parseCorpOutline({ response: { body: { items: "" } } })).toEqual([]);
    expect(parseCorpOutline(null)).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ corpNm: `한빛${i}` }));
    expect(parseCorpOutline({ response: { body: { items: { item: many } } } })).toHaveLength(
      BUSINESS_MAX_ITEMS,
    );
  });

  test("결과가 없으면 empty", () => {
    expect(toResult([])).toEqual({ status: "empty", items: [] });
    expect(toResult([1])).toEqual({ status: "ok", items: [1] });
  });
});

describe("F-015 AC4 고지·링크", () => {
  test("고지는 AI 생성이 아님과 직접 확인을 말하고, 판정 표현이 없다 (절대 규칙 2)", () => {
    expect(BUSINESS_NOTICE).toContain("AI 생성 아님");
    expect(BUSINESS_NOTICE).toContain("직접 확인");
    expect(isAssertive(BUSINESS_NOTICE)).toBe(false);
  });

  test("바로 가기는 https 공식·공개 사이트뿐이고 이름은 주소에 맞게 바꿔 넣는다", () => {
    const links = businessLinks("한빛 주택&건설");
    expect(links.map((l) => new URL(l.url).hostname)).toEqual([
      "map.naver.com",
      "www.iros.go.kr",
      "dart.fss.or.kr",
    ]);
    expect(links[0].url).toBe(
      `https://map.naver.com/p/search/${encodeURIComponent("한빛 주택&건설")}`,
    );
  });
});
