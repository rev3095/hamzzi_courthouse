import { describe, expect, test } from "vitest";
import { highlightParts, highlightTerms } from "./highlight";

describe("F-003 판례 검색 하이라이트", () => {
  test("검색어를 낱말로 나누고 한 글자·중복은 빼며 긴 낱말부터", () => {
    expect(highlightTerms("임대차 보증금 반환 의 보증금")).toEqual(["임대차", "보증금", "반환"]);
    expect(highlightTerms("  ")).toEqual([]);
    expect(highlightTerms(null)).toEqual([]);
    expect(highlightTerms("보증 보증금")).toEqual(["보증금", "보증"]);
  });

  test("이어 붙이면 원래 글과 같고, 검색어 자리만 표시한다", () => {
    const text = "임대차보증금반환 청구에서 보증금의 범위";
    const parts = highlightParts(text, highlightTerms("보증금 범위"));
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["보증금", "보증금", "범위"]);
  });

  test("정규식 기호가 든 검색어도 글자 그대로 찾는다", () => {
    const parts = highlightParts("손해배상(자) 사건", highlightTerms("손해배상(자)"));
    expect(parts).toEqual([
      { text: "손해배상(자)", hit: true },
      { text: " 사건", hit: false },
    ]);
  });

  test("검색어가 없거나 맞는 곳이 없으면 글 하나", () => {
    expect(highlightParts("판결요지", [])).toEqual([{ text: "판결요지", hit: false }]);
    expect(highlightParts("판결요지", ["계약금"])).toEqual([{ text: "판결요지", hit: false }]);
  });
});
