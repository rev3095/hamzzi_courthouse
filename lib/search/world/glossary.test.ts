// DEC-074 의료기기 용어 대응표 — 모델 없이 아는 낱말만 바꾼다.
import { describe, expect, test } from "vitest";
import { GENERAL_TERM, queryTerms, TERMS, translateQuery } from "./glossary";

describe("DEC-074 용어 대응표", () => {
  test("한국어 낱말이 겹치지 않고, 영어·일본어 대응이 모두 채워져 있다", () => {
    const ko = TERMS.map((t) => t.ko);
    expect(new Set(ko).size).toBe(ko.length);
    expect(TERMS.length).toBeGreaterThanOrEqual(40);
    for (const t of TERMS) {
      expect(t.en).toMatch(/^[a-z][a-z -]+$/);
      expect(t.ja).toMatch(/[぀-ヿ一-鿿]/);
    }
    expect(TERMS[0]).toBe(GENERAL_TERM);
  });

  test("아는 낱말만 나온 순서대로 바꾸고 조사·모르는 낱말은 버린다", () => {
    expect(translateQuery("의료기기 허가")).toEqual({
      en: "medical device approval",
      ja: "医療機器 承認",
    });
    expect(translateQuery("의료기기의 리콜을 알고 싶어요")).toEqual({
      en: "medical device recall",
      ja: "医療機器 回収",
    });
    expect(translateQuery("회수와 의료기기")).toEqual({
      en: "recall medical device",
      ja: "回収 医療機器",
    });
  });

  test("긴 낱말을 먼저 맞춘다 (체외진단의료기기 ≠ 체외진단 + 의료기기)", () => {
    expect(queryTerms("체외진단의료기기 허가").ko).toEqual(["체외진단의료기기", "허가"]);
    expect(translateQuery("품질관리").en).toBe("quality management system");
    expect(translateQuery("시판 후 조사").en).toBe("postmarket surveillance");
  });

  test("같은 뜻의 낱말은 한 번만 보낸다", () => {
    expect(translateQuery("리콜 회수").en).toBe("recall");
  });

  test("바꾸지 못하면 그 언어는 undefined — 모르는 말을 지어내지 않는다", () => {
    expect(translateQuery("임대차 보증금")).toEqual({});
    expect(translateQuery("")).toEqual({});
  });

  test("영문 검색어는 그대로 영어 검색어로, 일본어 검색어는 일본어 검색어로", () => {
    expect(translateQuery("medical device recall")).toEqual({ en: "medical device recall" });
    expect(translateQuery("医療機器")).toEqual({ ja: "医療機器" });
  });

  test("한국어에 섞인 영문 약어는 그대로 넘긴다", () => {
    expect(translateQuery("의료기기 UDI 표시")).toEqual({
      en: "medical device UDI labeling",
      ja: "医療機器 UDI 表示",
    });
    // 영문 약어만 남으면 일본어 검색은 하지 않는다
    expect(translateQuery("MDR 알려줘")).toEqual({ en: "MDR" });
  });
});
