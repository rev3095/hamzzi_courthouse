import { describe, expect, test } from "vitest";
import { PRIMARY_AREAS, primaryAreas } from "@/components/ask/ExampleFeed";

describe("DEC-028 예시 답변 피드 · 좁은 화면 분야 칩", () => {
  test("예시가 많은 분야부터, 같으면 처음 나온 순으로 고른다", () => {
    const ex = [
      { area: "노동" },
      { area: "임대차" },
      { area: "임대차" },
      { area: "사기" },
      { area: "사기" },
      { area: "상속" },
    ];
    expect(primaryAreas(ex, 3)).toEqual(["임대차", "사기", "노동"]);
  });

  test("기본은 분야 5개만 늘 보인다 ('전체' 제외)", () => {
    const ex = Array.from({ length: 28 }, (_, i) => ({ area: `분야${i}` }));
    expect(primaryAreas(ex)).toHaveLength(PRIMARY_AREAS);
    expect(PRIMARY_AREAS).toBe(5);
  });
});
