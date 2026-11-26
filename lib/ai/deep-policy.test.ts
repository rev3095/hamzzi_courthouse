// DeepSearch 사건 구조 거르기 (DEC-041) — 숫자는 사용자가 적은 글에 같은 낱말로 있어야 한다 (절대 규칙 3, F-017 legal-reviewer 반영)
import { describe, expect, it } from "vitest";
import {
  deepAnswerSchema,
  parseDeepMap,
  screenPlan,
  screenStruct,
  type DeepPlanRaw,
  type DeepStructRaw,
} from "./deep-policy";
import { BUDGET_UNIT_USD, LONG_DEEP, LONG_QUESTION_CHARS, TIERS, isLongQuestion } from "./models";

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

describe("DEC-062 사건 정리판 거르기", () => {
  const q = "임대인이 보증금 1,500,000원을 돌려주지 않아요. 이사는 이미 했어요.";
  const plan = (over: Partial<DeepPlanRaw> = {}): DeepPlanRaw => ({
    kinds: ["civil", "criminal", "civil", "unknown"],
    sides: [
      { party: "임차인", side: "claimant", actions: ["내용증명으로 반환을 요구한다"] },
      { party: "임대인", side: "respondent", actions: ["반환 시기를 협의한다"] },
      { party: "모르는 사람", side: "third", actions: ["상관없다"] },
    ],
    prep: [{ item: "임대차계약서 사본", why: "보증금 액수와 기간을 보여 준다" }],
    ...over,
  });

  it("정해진 사건 종류만, 겹치지 않게 남긴다", () => {
    const p = screenPlan(plan(), ["임차인", "임대인"], q);
    expect(p?.kinds).toEqual(["civil", "criminal"]);
  });

  it("사건 구조에 없는 당사자는 버린다", () => {
    const p = screenPlan(plan(), ["임차인", "임대인"], q);
    expect(p?.sides.map((s) => s.party)).toEqual(["임차인", "임대인"]);
  });

  it("단정 표현·질문에 없는 숫자·조문 번호가 든 대응은 그 줄만 버린다", () => {
    const p = screenPlan(
      plan({
        sides: [
          {
            party: "임차인",
            side: "claimant",
            actions: [
              "반드시 돌려받을 수 있다",
              "30일 안에 소송을 낸다",
              "주택임대차보호법 제3조를 근거로 주장한다",
              "임차권등기명령을 신청한다",
            ],
          },
        ],
      }),
      ["임차인"],
      q,
    );
    expect(p?.sides[0].actions).toEqual(["임차권등기명령을 신청한다"]);
  });

  it("한글 수사 기간·유불리 표현이 든 줄은 버린다 (legal-reviewer)", () => {
    const p = screenPlan(
      plan({
        sides: [
          {
            party: "임차인",
            side: "claimant",
            actions: [
              "두 달 안에 소송을 낸다",
              "열흘 뒤 다시 요구한다",
              "임차인에게 유리하니 소송을 낸다",
              "이길 가능성이 높아 보인다",
              "지급명령을 신청한다",
            ],
          },
        ],
      }),
      ["임차인"],
      q,
    );
    expect(p?.sides[0].actions).toEqual(["지급명령을 신청한다"]);
  });

  it("질문에 있는 숫자는 쓸 수 있다", () => {
    const p = screenPlan(
      plan({ prep: [{ item: "1,500,000원 입금 내역", why: "" }] }),
      ["임차인"],
      q,
    );
    expect(p?.prep[0].item).toBe("1,500,000원 입금 내역");
  });

  it("정리판이 없으면 null", () => {
    expect(screenPlan(undefined, ["임차인"], q)).toBeNull();
  });

  it("DEC-068 입장·예상 반론·작성할 문서: 구조의 당사자·쟁점 번호·정해진 서식만 남기고 판정 표현은 버린다", () => {
    const p = screenPlan(
      plan({
        sides: [
          {
            party: "임차인",
            side: "claimant",
            stance: "계약이 끝났으니 보증금을 돌려받아야 한다는 입장",
            actions: ["민사: 내용증명으로 반환을 요구한다"],
          },
          { party: "임대인", side: "respondent", stance: "임차인이 불리하다", actions: [] },
        ],
        rebuttals: [
          {
            issue: 1,
            by: "임대인",
            point: "새 세입자가 들어와야 줄 수 있다고 한다",
            reply: "계약 종료 사실과 통지 기록을 모아 둔다",
          },
          { issue: 5, by: "임대인", point: "쟁점 번호가 범위를 벗어난 반론", reply: "대응" },
          { issue: 1, by: "모르는 사람", point: "구조에 없는 당사자의 반론", reply: "대응" },
          { issue: 2, by: "임대인", point: "임차인이 질 가능성이 높다고 한다", reply: "대응" },
          { issue: 2, by: "임대인", point: "임차인의 청구는 기각될 것이라고 한다", reply: "대응" },
          {
            issue: 2,
            by: "임대인",
            point: "연체를 이유로 든다",
            reply: "이 주장은 받아들여지기 어렵다",
          },
        ],
        docs: [
          { kind: "demand-letter", why: "먼저 반환을 요구한 기록을 남긴다" },
          { kind: "demand-letter", why: "겹침" },
          { kind: "없는-서식", why: "버림" },
        ],
      }),
      ["임차인", "임대인"],
      q,
      2,
    );
    expect(p?.sides[0].stance).toBe("계약이 끝났으니 보증금을 돌려받아야 한다는 입장");
    expect(p?.sides[1].stance).toBeUndefined();
    expect(p?.rebuttals).toEqual([
      {
        issue: 1,
        by: "임대인",
        point: "새 세입자가 들어와야 줄 수 있다고 한다",
        reply: "계약 종료 사실과 통지 기록을 모아 둔다",
      },
    ]);
    expect(p?.docs).toEqual([{ kind: "demand-letter", why: "먼저 반환을 요구한 기록을 남긴다" }]);
  });

  it("DEC-068 결과를 판정하는 활용형(받아들여질·인정된다·성립하지 않는다·처벌받을 수)도 버린다", () => {
    const judged = [
      "이 반론은 받아들여질 것이라고 한다",
      "임대인의 주장이 인정된다고 한다",
      "계약 해지는 성립하지 않는다고 한다",
      "상대방이 처벌받을 수 있다고 한다",
    ];
    const p = screenPlan(
      plan({
        rebuttals: [
          ...judged.map((point) => ({ issue: 1, by: "임대인", point, reply: "기록을 모아 둔다" })),
          {
            issue: 1,
            by: "임대인",
            point: "수리 요청을 받지 못했다고 한다",
            reply: "요청 기록을 모아 둔다",
          },
        ],
      }),
      ["임차인", "임대인"],
      q,
      2,
    );
    expect(p?.rebuttals?.map((r) => r.point)).toEqual(["수리 요청을 받지 못했다고 한다"]);
  });

  it("DEC-068 예전 정리판(반론·문서 없음)은 그 칸 없이 그대로 남는다", () => {
    const p = screenPlan(plan(), ["임차인", "임대인"], q);
    expect(p).not.toHaveProperty("rebuttals");
    expect(p).not.toHaveProperty("docs");
  });

  it("예전 결과(정리판 없음)도 그대로 읽고, 모양이 틀린 정리판은 빼고 읽는다", () => {
    const base = {
      parties: [{ label: "임차인", role: "질문자" }],
      events: [],
      issues: [{ title: "보증금 반환", points: [0] }],
      unknowns: [],
    };
    expect(parseDeepMap(base)?.plan).toBeUndefined();
    expect(parseDeepMap({ ...base, plan: { kinds: ["nope"] } })?.plan).toBeUndefined();
    const ok = parseDeepMap({
      ...base,
      plan: { kinds: ["civil"], sides: [], prep: [{ item: "계약서", why: "" }] },
    });
    expect(ok?.plan?.kinds).toEqual(["civil"]);
  });

  it("긴 질문이면 답변 형식에 정리판 칸이 필수, 짧은 질문이면 칸이 없다", () => {
    const long = deepAnswerSchema(["law:a"], 2, ["임차인"]);
    expect(long.required).toEqual(["points", "plan"]);
    const short = deepAnswerSchema(["law:a"], 2);
    expect(short.required).toEqual(["points"]);
    expect("plan" in short.properties).toBe(false);
  });
});

describe("DEC-062 긴 질문 기준", () => {
  it("가린 질문이 100자를 넘을 때만 긴 질문이다", () => {
    expect(LONG_QUESTION_CHARS).toBe(100);
    expect(isLongQuestion("가".repeat(100))).toBe(false);
    expect(isLongQuestion("가".repeat(101))).toBe(true);
    expect(isLongQuestion(`  ${"가".repeat(100)}  `)).toBe(false);
  });

  it("긴 질문은 Opus 5.5 xhigh, 가중치는 상한 ÷ 단위 올림", () => {
    expect(TIERS[LONG_DEEP.tier].model).toBe("claude-opus-5-5");
    expect(LONG_DEEP.effort).toBe("xhigh");
    expect(LONG_DEEP.weight).toBe(Math.ceil(LONG_DEEP.capUsd / BUDGET_UNIT_USD - 1e-9));
  });
});
