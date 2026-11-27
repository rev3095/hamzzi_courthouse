// F-016 새 사건 만들기 창 — 칸에 적은 내용을 사건 자료로 바꾸는 순수 규칙 (모델 없음)
import { describe, expect, it } from "vitest";
import { MatterDataZ } from "./policy";
import {
  EMPTY_START,
  START_EXAMPLE,
  START_MODES,
  MY_SIDE_CHOICES,
  composeStart,
  splitFactLine,
  startCounts,
} from "./start";
import { isAssertive } from "@/lib/ai/policy";

describe("F-016 새 사건 만들기 splitFactLine", () => {
  it.each([
    ["2026.03.02 계약 만료", "2026.03.02", "계약 만료"],
    ["2026-3-2: 문자 받음", "2026-3-2", "문자 받음"],
    ["2026년 3월 2일 내용증명 보냄", "2026년 3월 2일", "내용증명 보냄"],
    ["2026.03 입주", "2026.03", "입주"],
    ["3월 2일 전화함", "3월 2일", "전화함"],
  ])("앞의 날짜를 나눈다: %s", (line, when, what) => {
    expect(splitFactLine(line)).toEqual({ when, what });
  });

  it("날짜가 없으면 날짜 칸을 비운다 (지어내지 않는다)", () => {
    expect(splitFactLine("집주인이 연락을 받지 않음")).toEqual({
      when: "",
      what: "집주인이 연락을 받지 않음",
    });
    expect(splitFactLine("3.5배 넓은 집")).toEqual({ when: "", what: "3.5배 넓은 집" });
  });
});

describe("F-016 새 사건 만들기 composeStart", () => {
  it("서류부터 시작하면 이름·입장만 담고 나머지는 비운다", () => {
    const { title, data } = composeStart(START_EXAMPLE, "docs");
    expect(title).toBe(START_EXAMPLE.title);
    expect(data.mySide).toBe("claimant");
    expect(data.facts).toEqual([]);
    expect(data.parties).toEqual([]);
    expect(data.summary).toBe("");
  });

  it("직접 적으면 상대방·사실·요구·요약으로 나눠 담고 저장 검증을 통과한다", () => {
    const { data } = composeStart(START_EXAMPLE, "write");
    expect(data.parties.map((p) => [p.name, p.side, p.role])).toEqual([
      ["집주인", "respondent", "상대방"],
      ["공인중개사사무소 A", "respondent", "상대방"],
    ]);
    expect(data.facts).toHaveLength(4);
    expect(data.facts[0]).toMatchObject({ when: "2024.03.02", docId: null });
    expect(data.facts[3].when).toBe("");
    expect(data.demands).toHaveLength(2);
    expect(MatterDataZ.safeParse(data).success).toBe(true);
    // 판정 항목은 없다
    expect(data.issues).toEqual([]);
    expect(data.auto).toBeUndefined();
  });

  it("빈 칸·빈 줄·목록 기호는 버리고 상대방 쪽은 내 입장의 반대다", () => {
    const { data } = composeStart(
      {
        ...EMPTY_START,
        mySide: "respondent",
        parties: [
          { name: "  ", kind: "person" },
          { name: "가나 주식회사", kind: "business" },
        ],
        facts: "\n- 첫째 일\n\n2. 둘째 일\n",
        demands: "  ",
      },
      "write",
    );
    expect(data.parties.map((p) => [p.name, p.side])).toEqual([["가나 주식회사", "claimant"]]);
    expect(data.facts.map((f) => f.what)).toEqual(["첫째 일", "둘째 일"]);
    expect(data.demands).toEqual([]);
    expect(
      composeStart({ ...EMPTY_START, parties: [{ name: "가", kind: "agency" }] }, "write").data
        .parties[0].side,
    ).toBe("other");
  });

  it("확인 단계 수 세기", () => {
    expect(startCounts(START_EXAMPLE, "write")).toEqual({
      parties: 2,
      facts: 4,
      dated: 3,
      demands: 2,
      summary: true,
    });
  });

  it("고정 문안에 단정 표현이 없다 (절대 규칙 2)", () => {
    const copy = [
      ...START_MODES.flatMap((m) => [m.title, m.body, m.next]),
      ...MY_SIDE_CHOICES.flatMap((c) => [c.label, c.hint]),
      START_EXAMPLE.facts,
      START_EXAMPLE.demands,
      START_EXAMPLE.summary,
    ];
    for (const s of copy) expect(isAssertive(s)).toBe(false);
  });
});
