// @vitest-environment node
// DEC-033 절차 분류 호출 — Haiku 1회, 생각 끔, $0.0015 상한. 모델은 가짜 (실호출 없음).
import { describe, expect, test, vi } from "vitest";
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";

vi.mock("server-only", () => ({}));

const { CLASSIFY_SYSTEM, classifyProcedure } = await import("@/lib/ai/classify");

function fakeModel(text: string, tokens = 1_500) {
  const calls: CreateParams[] = [];
  const model: ModelClient & { calls: CreateParams[] } = {
    calls,
    countTokens: async () => tokens,
    create: async (params) => {
      calls.push(params);
      return {
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        usage: { input_tokens: tokens, output_tokens: 200 },
      } as unknown as ModelMessage;
    },
  };
  return model;
}

const OUT = { track: "neighbor", keywords: ["층간소음"], proposal: null };

describe("DEC-033 절차 분류 호출", () => {
  test("Haiku 1회 · 생각 끔 · 출력 900토큰 이하 · 구조화 출력, 비용은 $0.0015 이하", async () => {
    const model = fakeModel(JSON.stringify(OUT));
    const r = await classifyProcedure("윗집 층간소음이 심해요", { model });
    expect(r).toMatchObject({ ok: true, output: OUT });
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.max_tokens).toBeLessThanOrEqual(900);
    expect(p.output_config?.format?.type).toBe("json_schema");
    expect(p.tools).toBeUndefined();
    // 입력 1,500 × $0.10 + 출력 200 × $0.50 = $0.00025
    expect(r.costUsd).toBeCloseTo(0.00025, 8);
    expect(r.costUsd).toBeLessThanOrEqual(0.0015);
  });

  test("입력이 상한을 넘으면 부르지 않는다", async () => {
    const model = fakeModel(JSON.stringify(OUT), 14_000);
    expect(await classifyProcedure("질문", { model })).toEqual({
      ok: false,
      reason: "budget",
      costUsd: 0,
    });
    expect(model.calls).toHaveLength(0);
  });

  test("형식이 틀린 응답은 오류가 아니라 '분류 없음'", async () => {
    expect((await classifyProcedure("질문", { model: fakeModel("{") })).ok).toBe(false);
    expect((await classifyProcedure("질문", { model: fakeModel('{"track":1}') })).ok).toBe(false);
  });

  test("프롬프트는 숫자·결과 예측을 쓰지 말라고 하고, 기존 절차 목록을 보여 준다", () => {
    expect(CLASSIFY_SYSTEM).toContain("숫자를 쓰지 않습니다");
    expect(CLASSIFY_SYSTEM).toContain("결과를 예측하거나 유불리를 말하지 않습니다");
    expect(CLASSIFY_SYSTEM).toContain("- neighbor:");
    expect(CLASSIFY_SYSTEM).toContain("- family:");
  });
});
