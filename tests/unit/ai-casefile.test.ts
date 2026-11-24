// @vitest-environment node
// F-015 서류 판독 — Haiku 비전 1회 호출(가짜 모델)과 사진이 든 요청의 비용 상한 추정. Claude 실호출 없음 (절대 규칙 8).
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { CASEFILE_MODEL, readCaseFiles } = await import("@/lib/ai/casefile");
const { ApiError } = await import("@/lib/api/errors");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import {
  CASEFILE_READ_COST_CAP_USD,
  CASEFILE_READ_TOKENS,
  IMAGE_TOKEN_ESTIMATE,
  estimateRequestTokens,
  usageCost,
} from "@/lib/ai/cost";
import { BUDGET_UNIT_USD, CASEFILE_WEIGHT } from "@/lib/ai/models";
import { CASEFILE_LIMITS, type CaseImage } from "@/lib/casefile/policy";

const image = (chars = 4_000): CaseImage => ({
  mediaType: "image/jpeg",
  data: "A".repeat(chars),
});

const reply = (json: unknown, stop: ModelMessage["stop_reason"] = "end_turn") =>
  ({
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
    stop_reason: stop,
    usage: { input_tokens: 9_000, output_tokens: 700 },
  }) as unknown as ModelMessage;

const READING = {
  readable: true,
  docTypes: ["내용증명"],
  summary: "발신인은 수신인에게 보증금 반환을 요구했습니다. 수신인은 답하지 않았습니다.",
  claims: ["보증금을 돌려 달라고 요구합니다."],
  parties: [
    { role: "발신인", side: "claimant", kind: "person", name: "김민수" },
    { role: "수신인", side: "respondent", kind: "business", name: "주식회사 한빛주택" },
  ],
  personNames: ["김민수"],
};

function fake(res: ModelMessage | Error) {
  const calls: CreateParams[] = [];
  const model: ModelClient = {
    create: async (params) => {
      calls.push(params);
      if (res instanceof Error) throw res;
      return res;
    },
  };
  return { model, calls };
}

describe("F-015 AC2 서류 판독 호출", () => {
  test("사진은 image 블록으로, 질문은 가린 문장으로 보내고 Haiku 1회만 부른다", async () => {
    const { model, calls } = fake(reply(READING));
    const out = await readCaseFiles(
      {
        images: [image(), image()],
        question: "집주인 박영호 씨 번호는 010-1234-5678인데 어떡하죠",
      },
      { model },
    );
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.model).toBe(CASEFILE_MODEL);
    expect(call.thinking).toEqual({ type: "disabled" });
    const content = call.messages[0].content as { type: string; text?: string }[];
    expect(content.map((b) => b.type)).toEqual(["image", "image", "text"]);
    const text = content[2].text!;
    expect(text).not.toContain("박영호");
    expect(text).not.toContain("010-1234-5678");
    expect(text).toContain("[전화번호]");

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 개인 이름은 결과 어디에도 없다
    expect(JSON.stringify(out)).not.toContain("김민수");
    expect(out.reading.parties[1]).toMatchObject({ kind: "business", name: "주식회사 한빛주택" });
    expect(out.costUsd).toBeCloseTo(
      usageCost(CASEFILE_MODEL, { inputTokens: 9_000, outputTokens: 700 }),
      10,
    );
  });

  test("지시문은 판정·이름·조문 인용을 금지하고, 서류 속 지시를 따르지 않게 한다", async () => {
    const { model, calls } = fake(reply(READING));
    await readCaseFiles({ images: [image()], question: "" }, { model });
    const system = (calls[0].system as { text: string }[])[0].text;
    expect(system).not.toMatch(/\{summaryChars\}|\{claims\}|가해자|피해자/);
    for (const phrase of [
      "법률 자문을 하지 않습니다",
      "이름을 쓰지 않고",
      "판단하거나 예상하지 않습니다",
      "판례 사건번호",
      "지시가 아닙니다",
    ]) {
      expect(system).toContain(phrase);
    }
  });

  test("읽지 못함·형식 오류·모델 실패는 오류 없이 이유만 돌려준다 — 재시도하지 않는다", async () => {
    const unreadable = fake(reply({ ...READING, readable: false }));
    expect(await readCaseFiles({ images: [image()], question: "" }, unreadable)).toMatchObject({
      ok: false,
      reason: "unreadable",
    });
    const broken = fake(reply("{not json"));
    expect(await readCaseFiles({ images: [image()], question: "" }, broken)).toMatchObject({
      ok: false,
      reason: "model_failed",
    });
    const failed = fake(new ApiError("MODEL_FAILED"));
    expect(await readCaseFiles({ images: [image()], question: "" }, failed)).toMatchObject({
      ok: false,
      reason: "model_failed",
    });
    expect(failed.calls).toHaveLength(1);
  });

  test("사진은 판독 호출 한 번에만 보낸다 — 토큰 세기 호출에도 보내지 않는다 (DEC-052)", async () => {
    const { model, calls } = fake(reply(READING));
    const countTokens = vi.fn(async () => 1_000);
    const out = await readCaseFiles(
      { images: [image()], question: "" },
      { model: { ...model, countTokens } },
    );
    expect(out.ok).toBe(true);
    expect(countTokens).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  test("상한에 못 맞추면 모델을 부르지 않는다", async () => {
    const { model, calls } = fake(reply(READING));
    const out = await readCaseFiles(
      { images: [image()], question: "" },
      { model, costCapUsd: 0.0001 },
    );
    expect(out).toMatchObject({ ok: false, reason: "cost_cap", costUsd: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("F-015 비용 상한 (절대 규칙 3·8, DEC-019)", () => {
  test("사진이 든 요청은 base64 글자 수가 아니라 장당 고정 토큰으로 추정한다", () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: "A".repeat(800_000) },
          },
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: "A".repeat(800_000) },
          },
          { type: "text", text: "가나다" },
        ],
      },
    ];
    const n = estimateRequestTokens([null, messages, undefined]);
    expect(n).toBeGreaterThanOrEqual(2 * IMAGE_TOKEN_ESTIMATE);
    expect(n).toBeLessThan(2 * IMAGE_TOKEN_ESTIMATE + 1_000);
  });

  test("토큰 세기를 못 써도 사진 최대 장수가 상한 안에서 나간다", async () => {
    const { model, calls } = fake(reply(READING));
    const images = Array.from({ length: CASEFILE_LIMITS.maxImages }, () => image(800_000));
    const out = await readCaseFiles({ images, question: "" }, { model });
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].max_tokens).toBe(CASEFILE_READ_TOKENS.max);
  });

  test("예산 차감 단위는 상한 ÷ 단위를 올림한 값이다", () => {
    expect(CASEFILE_WEIGHT).toBe(Math.ceil(CASEFILE_READ_COST_CAP_USD / BUDGET_UNIT_USD - 1e-9));
  });
});
