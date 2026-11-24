// @vitest-environment node
// F-017 자료 판독 (DEC-058) — Haiku 비전 1회 호출(가짜 모델). 사진·PDF·문서 글을 서류 분석과 같은 블록으로 보낸다. Claude 실호출 없음 (절대 규칙 8).
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { MATERIALS_MODEL, readMaterials } = await import("@/lib/ai/materials");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { MATERIALS_READ_COST_CAP_USD, MATERIALS_READ_TOKENS } from "@/lib/ai/cost";
import { BUDGET_UNIT_USD, CASEFILE_WEIGHT, MATERIALS_WEIGHT } from "@/lib/ai/models";
import { CASEFILE_READ_COST_CAP_USD } from "@/lib/ai/cost";
import type { CaseImage } from "@/lib/casefile/policy";
import { MATERIAL_LIMITS, parseStoredMaterials } from "@/lib/materials/policy";

const image: CaseImage = { mediaType: "image/jpeg", data: "A".repeat(4_000) };
const reply = (json: unknown) =>
  ({
    content: [{ type: "text", text: JSON.stringify(json) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 9_000, output_tokens: 700 },
  }) as unknown as ModelMessage;

const READING = {
  readable: true,
  materials: [
    { image: 2, kind: "기타 서류", summary: "임대차 계약서 글입니다.", details: [], gaps: [] },
    { image: 1, kind: "문자", summary: "보증금 반환을 미룬 문자입니다.", details: [], gaps: [] },
  ],
  queries: ["임대차보증금 반환"],
  personNames: [],
};

function fake(res: ModelMessage) {
  const calls: CreateParams[] = [];
  const model: ModelClient = {
    create: async (params) => {
      calls.push(params);
      return res;
    },
  };
  return { model, calls };
}

describe("F-017 AC2 자료 판독 호출", () => {
  test("사진은 image 블록, 문서 글은 가린 글로 보내고 Haiku 1회만 부른다. 파일마다 정리 하나", async () => {
    const { model, calls } = fake(reply(READING));
    const out = await readMaterials(
      {
        images: [image],
        texts: [{ name: "문서.txt", text: "임대인 연락처 010-1234-5678" }],
        question: "어떻게 하죠",
      },
      { model },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(MATERIALS_MODEL);
    expect(calls[0].max_tokens).toBeLessThanOrEqual(MATERIALS_READ_TOKENS.max);
    const body = JSON.stringify(calls[0].messages);
    expect(body).toContain('"type":"image"');
    expect(body).toContain("<첨부_문서");
    expect(body).not.toContain("010-1234-5678");
    expect(body).toContain("모두 2개");
    expect(out.ok && out.materials.map((m) => m.kind)).toEqual(["문자", "기타 서류"]);
  });
});

describe("F-017 한도", () => {
  test("판독 상한·가중치는 서류 판독과 같다 (같은 입력)", () => {
    expect(MATERIALS_READ_COST_CAP_USD).toBe(CASEFILE_READ_COST_CAP_USD);
    expect(MATERIALS_WEIGHT).toBe(CASEFILE_WEIGHT);
    expect(MATERIALS_WEIGHT).toBe(Math.ceil(MATERIALS_READ_COST_CAP_USD / BUDGET_UNIT_USD - 1e-9));
  });

  test("자료 30개도 빼지 않고, 넘치면 뒤 자료의 요약을 줄여 전체 글자 수 안에 맞춘다", () => {
    const item = {
      kind: "문자",
      summary: "가".repeat(MATERIAL_LIMITS.summaryChars - 10),
      details: [],
      gaps: [],
    };
    const r = parseStoredMaterials(Array.from({ length: MATERIAL_LIMITS.maxItems }, () => item));
    expect(r.materials).toHaveLength(MATERIAL_LIMITS.maxItems);
    const total = r.materials.reduce((n, m) => n + m.summary.length, 0);
    expect(total).toBeLessThanOrEqual(MATERIAL_LIMITS.totalChars);
  });
});
