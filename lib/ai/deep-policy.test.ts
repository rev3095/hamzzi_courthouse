// DeepSearch 사건 구조 거르기 (DEC-041) — 숫자는 사용자가 적은 글에 같은 낱말로 있어야 한다 (절대 규칙 3, F-017 legal-reviewer 반영)
import { describe, expect, it } from "vitest";
import { screenStruct, type DeepStructRaw } from "./deep-policy";

const raw = (what: string, when = ""): DeepStructRaw => ({
  parties: [{ label: "임차인", role: "질문자" }],
  events: [{ when, who: "임차인", what }],
  issues: [
    { title: "보증금 반환", lawName: "주택임대차보호법", lawKeywords: ["보증금"], caseQuery: "" },
  ],
  unknowns: [],
  lawQuery: "",
});

describe("DEC-041 사건 구조의 숫자", () => {
  it("적힌 숫자와 같은 낱말만 남긴다", () => {
    const s = screenStruct(
      raw("보증금 1,500,000원을 돌려받지 못했다"),
      "보증금 1,500,000원을 못 받았어요",
    );
    expect(s.events).toHaveLength(1);
  });

  it("큰 숫자의 일부(500)로 지어낸 숫자를 허용하지 않는다", () => {
    const s = screenStruct(raw("500만 원을 더 요구했다"), "보증금 1,500,000원을 못 받았어요");
    expect(s.events).toHaveLength(0);
  });

  it("가린 자리표시([이름1])의 숫자는 허용 원문에 넣지 않는다", () => {
    const s = screenStruct(raw("1년 뒤에 연락했다"), "[이름1]에게 보증금을 못 받았어요");
    expect(s.events).toHaveLength(0);
  });
});
