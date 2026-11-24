// F-017 자료 첨부 (DEC-058) — 판독 결과 거르기·저장 전 다시 거르기·답변 형식·자료 지도·활용 안내 문안
import { describe, expect, it } from "vitest";
import { BUDGET_UNIT_USD, MATERIALS_WEIGHT } from "@/lib/ai/models";
import { MATERIALS_READ_COST_CAP_USD } from "@/lib/ai/cost";
import { isAssertive } from "@/lib/ai/policy";
import {
  MATERIAL_KINDS,
  MATERIAL_LIMITS,
  buildMaterialsMap,
  materialRefsOf,
  materialsBlock,
  materialsContextLine,
  materialsPlainText,
  mergeFindings,
  parseMaterialsMap,
  parseStoredMaterials,
  readStoredMaterials,
  screenMaterials,
  withMaterialRefs,
  type MaterialsReadingRaw,
} from "./policy";
import { MATERIAL_COMMON_TIPS, MATERIAL_TIPS } from "./tips";

const raw = (over: Partial<MaterialsReadingRaw> = {}): MaterialsReadingRaw => ({
  readable: true,
  materials: [
    {
      image: 1,
      kind: "메신저 대화",
      summary: "임차인과 임대인이 보증금 반환 날짜를 두고 나눈 대화입니다.",
      details: ["2025년 3월 2일", "보증금 1000만원은 다음 달에 돌려주겠다"],
      gaps: ["보낸 사람 이름이 잘려 있음"],
    },
  ],
  queries: ["임대차보증금 반환"],
  personNames: [],
  ...over,
});

describe("F-017 AC2 판독 결과 거르기", () => {
  it("종류·요약·적힌 내용·읽지 못한 곳을 정해진 형식으로 돌려준다", () => {
    const r = screenMaterials(raw(), 1);
    expect(r?.materials).toEqual([
      {
        kind: "메신저 대화",
        summary: "임차인과 임대인이 보증금 반환 날짜를 두고 나눈 대화입니다.",
        details: ["2025년 3월 2일", "보증금 1000만원은 다음 달에 돌려주겠다"],
        gaps: ["보낸 사람 이름이 잘려 있음"],
      },
    ]);
    expect(r?.queries).toEqual(["임대차보증금 반환"]);
  });

  it("읽을 수 없었으면 null", () => {
    expect(screenMaterials(raw({ readable: false }), 1)).toBeNull();
  });

  it("목록 밖 종류는 기타로, 올린 장수보다 많은 항목은 버린다", () => {
    const r = screenMaterials(
      raw({
        materials: [
          { image: 1, kind: "증거", summary: "물건 사진입니다.", details: [], gaps: [] },
          { image: 2, kind: "문자", summary: "문자 화면입니다.", details: [], gaps: [] },
        ],
      }),
      1,
    );
    expect(r?.materials.map((m) => m.kind)).toEqual(["기타"]);
  });

  it("이름·전화번호를 가리고, 모델이 적어 준 개인 이름도 지운다", () => {
    const r = screenMaterials(
      raw({
        materials: [
          {
            image: 1,
            kind: "문자",
            summary: "김민수가 보낸 문자입니다. 연락처 010-1234-5678이 적혀 있습니다.",
            details: ["김민수 올림"],
            gaps: [],
          },
        ],
        personNames: ["김민수"],
      }),
      1,
    );
    const text = JSON.stringify(r?.materials);
    expect(text).not.toContain("김민수");
    expect(text).not.toContain("010-1234-5678");
    expect(r?.findings.find((f) => f.type === "name")?.count).toBeGreaterThan(0);
  });

  it("결과·유불리를 말하거나 조문·사건번호가 든 문장은 뺀다 (절대 규칙 1·2)", () => {
    const r = screenMaterials(
      raw({
        materials: [
          {
            image: 1,
            kind: "법원·수사기관 서류",
            summary:
              "법원에서 온 서류입니다. 이 자료로 반드시 승소합니다. 민법 제750조가 적혀 있습니다.",
            details: ["2025가소12345", "답변서 제출 안내"],
            gaps: ["임차인에게 유리한 증거입니다"],
          },
        ],
      }),
      1,
    );
    expect(r?.materials[0].summary).toBe("법원에서 온 서류입니다.");
    expect(r?.materials[0].details).toEqual(["답변서 제출 안내"]);
    expect(r?.materials[0].gaps).toEqual([]);
    expect(r?.dropped).toBe(4);
  });

  it("검색어는 숫자·개인정보·판정 표현이 없는 것만, 최대 개수까지", () => {
    const r = screenMaterials(
      raw({
        queries: ["보증금 1000만원", "[이름1] 사기", "명예훼손", "모욕", "전세사기", "부당해고"],
      }),
      1,
    );
    expect(r?.queries).toEqual(["명예훼손", "모욕", "전세사기"]);
    expect(r?.queries.length).toBeLessThanOrEqual(MATERIAL_LIMITS.queries);
  });
});

describe("F-017 AC3 질문과 함께 저장하기 전 다시 거르기", () => {
  it("없으면 빈 목록", () => {
    expect(parseStoredMaterials(undefined).materials).toEqual([]);
  });

  it("화면에서 고친 글도 같은 규칙으로 가리고 거른다", () => {
    const r = parseStoredMaterials([
      {
        kind: "문자",
        summary: "홍길동 님이 보낸 문자입니다. 무조건 이깁니다.",
        details: ["010-2222-3333"],
        gaps: [],
      },
    ]);
    const text = JSON.stringify(r.materials);
    expect(text).not.toContain("홍길동");
    expect(text).not.toContain("010-2222-3333");
    expect(text).not.toContain("무조건");
  });

  it("형식이 틀리면 400", () => {
    expect(() => parseStoredMaterials("자료")).toThrow();
    expect(() => parseStoredMaterials([{ kind: "문자" }])).toThrow();
    expect(() => parseStoredMaterials(Array.from({ length: 31 }, () => ({})))).toThrow();
  });

  it("전체 글자 수를 넘으면 뒤 자료의 적힌 내용부터 줄인다", () => {
    const long = "가".repeat(MATERIAL_LIMITS.detailChars - 1);
    const item = {
      kind: "문자",
      summary: "문자 화면입니다.",
      details: Array.from({ length: 5 }, () => long),
      gaps: [],
    };
    const r = parseStoredMaterials([item, item, item, item, item]);
    const total = r.materials.reduce(
      (n, m) => n + m.summary.length + m.details.join("").length + m.gaps.join("").length,
      0,
    );
    expect(total).toBeLessThanOrEqual(MATERIAL_LIMITS.totalChars);
    expect(r.materials).toHaveLength(5);
  });

  it("저장된 값 읽기는 모양이 맞을 때만", () => {
    expect(
      readStoredMaterials([{ kind: "문자", summary: "a", details: [], gaps: [] }]),
    ).toHaveLength(1);
    expect(readStoredMaterials([{ kind: "모름", summary: "a", details: [], gaps: [] }])).toEqual(
      [],
    );
    expect(readStoredMaterials(null)).toEqual([]);
  });
});

describe("F-017 답변 모델 입력·형식", () => {
  const list = [
    { kind: "문자" as const, summary: "문자 화면입니다.", details: ["다음 주 입금"], gaps: [] },
  ];

  it("자료 묶음은 근거가 아님을 밝힌다", () => {
    const block = materialsBlock(list);
    expect(block).toContain("<첨부_자료>");
    expect(block).toContain("법령·판례 근거가 아니며");
    expect(block).toContain("[자료 1] 종류: 문자");
    expect(materialsBlock([])).toBe("");
  });

  it("이어 묻기 맥락에는 종류와 요약 한 줄만", () => {
    expect(materialsContextLine(list)).toBe("(첨부 자료: 1. 문자 — 문자 화면입니다.)");
    expect(materialsContextLine([])).toBe("");
  });

  it("자료가 있을 때만 문단에 materials 칸을 더한다", () => {
    const schema = {
      type: "object",
      properties: {
        points: {
          type: "array",
          items: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
        },
      },
    };
    expect(withMaterialRefs(schema, 0)).toBe(schema);
    const added = withMaterialRefs(schema, 2).properties.points.items as unknown as {
      required: string[];
      properties: { materials: { items: { enum: number[] } } };
    };
    expect(added.required).toContain("materials");
    expect(added.properties.materials.items.enum).toEqual([1, 2]);
  });

  it("문단별 자료 번호는 범위 안의 것만", () => {
    const refs = materialRefsOf({ points: [{ text: " 가 ", materials: [1, 1, 3, 0] }] }, 2);
    expect(refs).toEqual([{ text: "가", materials: [1] }]);
    expect(materialRefsOf({ points: [{ text: "가", materials: [1] }] }, 0)).toEqual([]);
  });
});

describe("F-017 AC4 자료 지도", () => {
  const list = [
    { kind: "문자" as const, summary: "문자 화면입니다.", details: [], gaps: [] },
    { kind: "현장 사진" as const, summary: "벽 사진입니다.", details: [], gaps: [] },
  ];

  it("검증을 통과해 남은 문단만 자료에 잇는다", () => {
    const map = buildMaterialsMap(
      list,
      [
        { text: "남은 문단", materials: [1, 2] },
        { text: "빠진 문단", materials: [1] },
      ],
      [{ text: "다른 문단" }, { text: "남은 문단" }],
    );
    expect(map?.items.map((i) => i.points)).toEqual([[1], [1]]);
  });

  it("자료가 없으면 만들지 않고, 저장된 값은 모양이 맞을 때만 읽는다", () => {
    expect(buildMaterialsMap([], [], [])).toBeUndefined();
    const map = buildMaterialsMap(list, [], []);
    expect(parseMaterialsMap(map)).toEqual(map);
    expect(parseMaterialsMap({ items: [] })).toBeNull();
    expect(parseMaterialsMap({ items: [{ kind: "x" }] })).toBeNull();
  });
});

describe("F-017 활용 안내 고정 문안 (절대 규칙 2·3)", () => {
  const all = [
    ...Object.values(MATERIAL_TIPS).flatMap((t) => [...t.keep, ...t.useIn]),
    ...MATERIAL_COMMON_TIPS,
  ];

  it("모든 자료 종류에 안내가 있다", () => {
    for (const k of MATERIAL_KINDS) {
      expect(MATERIAL_TIPS[k].keep.length).toBeGreaterThan(0);
      expect(MATERIAL_TIPS[k].useIn.length).toBeGreaterThan(0);
    }
  });

  it("숫자·단정 표현·유불리·증거 가치 판단을 쓰지 않는다", () => {
    for (const t of all) {
      expect(t, t).not.toMatch(/\d/);
      expect(isAssertive(t), t).toBe(false);
      expect(t, t).not.toMatch(/유리|불리|승소|패소|이길|증거력|효력이\s*있|결정적|확실/);
    }
  });
});

describe("F-017 비용 단위", () => {
  it("판독 가중치 = 상한 ÷ 단위 올림", () => {
    expect(MATERIALS_WEIGHT).toBe(Math.ceil(MATERIALS_READ_COST_CAP_USD / BUDGET_UNIT_USD - 1e-9));
  });
});

describe("F-017 legal-reviewer 반영", () => {
  it("증거 가치·법적 효력을 말하는 문장도 뺀다 (절대 규칙 2)", () => {
    const r = screenMaterials(
      raw({
        materials: [
          {
            image: 1,
            kind: "메신저 대화",
            summary: "보증금 반환을 두고 나눈 대화입니다. 이 대화는 증거로 쓸 수 있습니다.",
            details: [
              "법적 효력이 있는 약속",
              "증거로서 의미가 있는 문자",
              "증거로 제출할 수 있음",
            ],
            gaps: ["입증할 수 있는 날짜는 없음"],
          },
        ],
      }),
      1,
    );
    expect(r?.materials[0].summary).toBe("보증금 반환을 두고 나눈 대화입니다.");
    expect(r?.materials[0].details).toEqual([]);
    expect(r?.materials[0].gaps).toEqual([]);
  });

  it("DeepSearch 허용 원문에는 머리표 번호를 넣지 않는다 (절대 규칙 3)", () => {
    const text = materialsPlainText([
      { kind: "문자", summary: "문자 화면입니다.", details: ["다음 주 입금"], gaps: [] },
      { kind: "문자", summary: "다른 문자입니다.", details: [], gaps: [] },
    ]);
    expect(text).not.toMatch(/\d/);
    expect(text).toContain("다음 주 입금");
  });

  it("가린 개인정보 목록을 종류별로 합친다", () => {
    expect(
      mergeFindings(
        [{ type: "name", count: 1 }],
        [
          { type: "name", count: 2 },
          { type: "phone", count: 1 },
        ],
      ),
    ).toEqual([
      { type: "name", count: 3 },
      { type: "phone", count: 1 },
    ]);
  });
});
