// @vitest-environment node
// DEC-023 문서 초안 도우미 — 규칙 칸, 사실관계 문장 거르기, Haiku 1회 호출(가짜 모델). Claude 실호출 없음 (절대 규칙 8).
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { draftFacts } = await import("@/lib/ai/doc-draft");
const { ApiError } = await import("@/lib/api/errors");
import type { CreateParams, ModelClient, ModelMessage } from "@/lib/ai/client";
import { factsText, ruleSuggestions, screenFacts, screenMissing } from "@/lib/documents/draft";

const STORY =
  "2023년 3월에 [이름1]에게 보증금 5,000만 원을 주고 전세 계약을 했습니다. 올해 2월에 계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.";

describe("DEC-023 규칙 칸", () => {
  test("소장: 섹션으로 사건명, 첫 단계 준비물로 입증방법 (번호는 코드가, 이름·주소 항목은 뺀다)", () => {
    const s = ruleSuggestions("complaint", "lease_deposit", STORY);
    expect(s.caseName).toBe("임대차보증금 반환 청구의 소");
    expect(s.evidence.split("\n")[0]).toMatch(/^갑 제1호증 {2}/);
    expect(s.evidence).not.toMatch(/주소|연락처/);
    expect(s.claimCause).toBeUndefined();
  });

  test("내용증명: 제목만 규칙으로. 일반 금전은 빌려준 돈일 때만 대여금", () => {
    expect(ruleSuggestions("demand-letter", "contract_deposit", "").subject).toBe(
      "계약금 반환 요청",
    );
    expect(ruleSuggestions("demand-letter", "money", "친구에게 돈을 빌려줬어요").subject).toBe(
      "대여금 반환 요청",
    );
    expect(ruleSuggestions("demand-letter", "money", "물건값을 못 받았어요")).toEqual({});
    expect(ruleSuggestions("complaint", null, STORY)).toEqual({});
  });
});

describe("DEC-023 사실관계 문장 거르기 (절대 규칙 1·2·3, F-007)", () => {
  test("사연에 있는 숫자·가림 표시만 남기고, 지어낸 날짜·금액·이름은 뺀다", () => {
    const { kept, dropped } = screenFacts(
      [
        "원고는 2023년 3월 [이름1]과 보증금 5,000만 원의 전세 계약을 맺었습니다.",
        "원고는 2023년 3월 15일 입주했습니다.",
        "피고는 보증금 6,000만 원 중 일부를 돌려주었습니다.",
        "[이름2]가 계약을 중개했습니다.",
      ],
      STORY,
    );
    expect(kept).toEqual([
      "원고는 2023년 3월 [이름1]과 보증금 5,000만 원의 전세 계약을 맺었습니다.",
    ]);
    expect(dropped).toEqual(["number", "number", "mask"]);
  });

  test("단정 표현·법률 판단·법령 언급은 뺀다 (사용자가 직접 쓴 낱말은 허용)", () => {
    const { kept, dropped } = screenFacts(
      [
        "피고는 반드시 보증금을 돌려주어야 합니다.",
        "피고의 행위는 위법합니다.",
        "주택임대차보호법에 따라 원고는 보호받습니다.",
        "대법원 판례도 같은 입장입니다.",
        "계약이 끝났지만 피고는 보증금을 돌려주지 않았습니다.",
      ],
      STORY,
    );
    expect(kept).toEqual(["계약이 끝났지만 피고는 보증금을 돌려주지 않았습니다."]);
    expect(dropped).toEqual(["assertive", "judgment", "citation", "citation"]);
    expect(
      screenFacts(["피고가 불법 주차를 했습니다."], "옆집이 불법 주차를 해요").kept,
    ).toHaveLength(1);
  });

  test("더 적을 내용은 숫자 없는 짧은 질문만, 최대 4개", () => {
    expect(
      screenMissing(["계약한 날짜가 언제인가요?", "30일 안에 요구했나요?", "", "a", "b", "c"]),
    ).toEqual(["계약한 날짜가 언제인가요?", "a", "b", "c"]);
  });

  test("소장 청구원인은 코드가 문단 번호를 붙인다", () => {
    expect(factsText("complaint", ["가", "나"])).toBe("1. 가\n2. 나");
    expect(factsText("demand-letter", ["가", "나"])).toBe("가\n나");
  });
});

const OUT = JSON.stringify({
  sentences: [
    "원고는 2023년 3월 [이름1]과 전세 계약을 맺었습니다.",
    "피고는 계약이 끝난 뒤 보증금을 돌려주지 않았습니다.",
    "원고는 2024년 1월 10일 내용증명을 보냈습니다.",
  ],
  missing: ["계약이 끝난 날짜가 언제인가요?"],
});
const msg = (text: string): ModelMessage =>
  ({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1_200, output_tokens: 300, cache_read_input_tokens: 0 },
  }) as unknown as ModelMessage;

function fakeModel(opts: { tokens?: number; fail?: unknown; text?: string } = {}) {
  const calls: CreateParams[] = [];
  const model: ModelClient & { calls: CreateParams[] } = {
    calls,
    countTokens: async () => opts.tokens ?? 1_200,
    create: vi.fn(async (p: CreateParams) => {
      calls.push(p);
      if (opts.fail) throw opts.fail;
      return msg(opts.text ?? OUT);
    }),
  };
  return model;
}

describe("DEC-023 Haiku 사실관계 초안", () => {
  test("Haiku 1회, thinking 끔, 마스킹본만 보낸다, 출력 900토큰 이하, 1건 $0.0015 이하", async () => {
    const model = fakeModel();
    const out = await draftFacts({ kind: "complaint", maskedStory: STORY }, { model });
    expect(model.calls).toHaveLength(1);
    const p = model.calls[0];
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.max_tokens).toBeLessThanOrEqual(900);
    expect(JSON.stringify(p.messages)).toContain("[이름1]");
    expect(JSON.stringify(p.system)).toContain("원고");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 사연에 없는 날짜(2024년 1월 10일)가 든 문장은 빠진다
    expect(out.text).toBe(
      "1. 원고는 2023년 3월 [이름1]과 전세 계약을 맺었습니다.\n2. 피고는 계약이 끝난 뒤 보증금을 돌려주지 않았습니다.",
    );
    expect(out.dropped).toEqual(["number"]);
    expect(out.missing).toEqual(["계약이 끝난 날짜가 언제인가요?"]);
    expect(out.costUsd).toBeCloseTo(0.00027, 6);
    expect(out.costUsd).toBeLessThanOrEqual(0.0015);
  });

  test("입력이 예산을 넘으면 부르지 않는다 (오류 아님)", async () => {
    const model = fakeModel({ tokens: 20_000 });
    const out = await draftFacts({ kind: "demand-letter", maskedStory: STORY }, { model });
    expect(model.calls).toHaveLength(0);
    expect(out).toEqual({ ok: false, reason: "cost_cap", costUsd: 0 });
  });

  test("모델 실패·형식 오류는 AI 문장 없이 끝낸다 — 재시도하지 않는다", async () => {
    const failed = fakeModel({ fail: new ApiError("MODEL_FAILED", { reason: "max_tokens" }) });
    expect(
      (await draftFacts({ kind: "complaint", maskedStory: STORY }, { model: failed })).ok,
    ).toBe(false);
    expect(failed.calls).toHaveLength(1);
    const broken = fakeModel({ text: "not json" });
    const out = await draftFacts({ kind: "complaint", maskedStory: STORY }, { model: broken });
    expect(out).toMatchObject({ ok: false, reason: "model_failed" });
  });

  test("남는 문장이 없으면 no_facts", async () => {
    const model = fakeModel({
      text: JSON.stringify({ sentences: ["피고는 무조건 갚아야 합니다."], missing: [] }),
    });
    const out = await draftFacts({ kind: "complaint", maskedStory: STORY }, { model });
    expect(out).toMatchObject({ ok: false, reason: "no_facts" });
  });
});
