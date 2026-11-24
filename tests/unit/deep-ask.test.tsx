// DEC-038 DeepSearch — 양식 합치기·보내기 전 점검(모델 없음)·입력 창 흐름
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DeepAsk } from "@/components/ask/DeepAsk";
import {
  DEEP_EVIDENCE,
  DEEP_FIELDS,
  DEEP_PRESET,
  EMPTY_DEEP,
  composeDeep,
  reviewDeep,
} from "@/lib/inquiries/deep";
import { MAX_INPUT_CHARS, parseAnalyzeRequest } from "@/lib/inquiries/policy";

afterEach(cleanup);

const FULL = {
  facts:
    "2년 전세 계약이 지난달에 끝났어요. 세 달 전에 나가겠다고 문자로 알렸는데 이사한 뒤에도 보증금을 돌려받지 못했어요.",
  other: "집주인",
  done: "문자로 여러 번 요청했어요",
  proof: "임대차계약서, 문자",
  ask: "보증금을 돌려받으려면 어떻게 해야 하나요?",
};

describe("DEC-038 양식 합치기", () => {
  test("칸 길이의 합은 질문 한도(2,000자) 안이다 — 자유 양식보다 입력이 길어지지 않는다", () => {
    const heads = DEEP_FIELDS.length * 14;
    expect(DEEP_FIELDS.reduce((n, f) => n + f.max, 0) + heads).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    const long = Object.fromEntries(DEEP_FIELDS.map((f) => [f.key, "가".repeat(3000)]));
    expect(composeDeep(long as typeof EMPTY_DEEP).length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
  });

  test("칸 이름을 머리말로 붙이고 빈 칸은 뺀다", () => {
    const text = composeDeep({ ...FULL, done: " ", proof: "" });
    expect(text).toBe(`[있었던 일] ${FULL.facts}\n[상대방] 집주인\n[알고 싶은 것] ${FULL.ask}`);
  });
});

describe("DEC-038 보내기 전 점검 (규칙, 비용 0)", () => {
  test("필요한 내용이 다 있으면 빠진 것이 없다", () => {
    expect(reviewDeep({ values: FULL })).toEqual({ missing: [], thin: false });
  });

  test("빠진 내용을 알려 준다 — 시점·상대방·질문", () => {
    const r = reviewDeep({
      values: {
        ...EMPTY_DEEP,
        facts:
          "보증금을 돌려받지 못하고 있어서 너무 답답하고 힘든 상황이에요. 어디서부터 손을 대야 할지 모르겠어요",
      },
    });
    expect(r.missing.map((m) => m.key)).toEqual(["when", "who", "ask"]);
    expect(r.thin).toBe(true);
  });

  test("한두 가지만 빠지면 알려 주기만 하고, 사연이 너무 짧으면 '많이 부족'으로 본다", () => {
    expect(reviewDeep({ values: { ...FULL, ask: "" } })).toMatchObject({
      missing: [{ key: "ask" }],
      thin: false,
    });
    expect(reviewDeep({ values: { ...FULL, facts: "돈을 못 받았어요" } }).thin).toBe(true);
  });

  test("직접 입력도 같은 기준으로 본다", () => {
    expect(reviewDeep({ text: `${FULL.facts} 상대는 집주인이에요. ${FULL.ask}` }).missing).toEqual(
      [],
    );
    expect(reviewDeep({ text: "도와주세요" }).thin).toBe(true);
  });

  test("점검 문구는 내용을 평가하지 않는다 (유불리·결과 표현 없음)", () => {
    const all = reviewDeep({ text: "" })
      .missing.map((m) => m.message)
      .join(" ");
    expect(all).not.toMatch(/유리|불리|승소|가능성|확률/);
  });
});

describe("DEC-038 분석 요청", () => {
  test("deep은 참·거짓만 받는다. 없으면 false", () => {
    expect(parseAnalyzeRequest("")).toEqual({
      category: null,
      tier: null,
      deep: false,
      assistant: null,
    });
    expect(parseAnalyzeRequest(JSON.stringify({ deep: true, tier: "max" }))).toEqual({
      category: null,
      tier: "max",
      deep: true,
      assistant: null,
    });
    expect(() => parseAnalyzeRequest(JSON.stringify({ deep: "yes" }))).toThrow();
    expect(() => parseAnalyzeRequest(JSON.stringify({ tier: "opus" }))).toThrow();
  });

  test("심층 질문은 근거를 조문 8·판례 4건까지 넘겨 본다 (상한은 그대로)", () => {
    expect(DEEP_EVIDENCE).toEqual({ articles: 8, cases: 4 });
  });
});

describe("DEC-038 입력 창", () => {
  const open = (initialText = "") => {
    const onSubmit = vi.fn();
    render(
      <DeepAsk initialText={initialText} busy={false} onSubmit={onSubmit} onClose={vi.fn()} />,
    );
    return onSubmit;
  };
  const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

  test("필수 칸을 표시하고, 질문창에 적어 둔 글을 '있었던 일'에 옮겨 둔다", () => {
    open("전세 보증금 문제예요");
    expect(screen.getAllByText("필수")).toHaveLength(3);
    expect((screen.getByLabelText(/무슨 일이 있었나요/) as HTMLTextAreaElement).value).toBe(
      "전세 보증금 문제예요",
    );
  });

  test("내용이 다 있으면 바로 보낸다", () => {
    const onSubmit = open();
    type(/무슨 일이 있었나요/, FULL.facts);
    type(/상대방은 누구인가요/, FULL.other);
    type(/알고 싶은 것/, FULL.ask);
    fireEvent.click(screen.getByRole("button", { name: "심층 분석 시작" }));
    expect(onSubmit).toHaveBeenCalledWith(
      `[있었던 일] ${FULL.facts}\n[상대방] 집주인\n[알고 싶은 것] ${FULL.ask}`,
    );
  });

  test("많이 부족하면 먼저 묻고, '그래도 진행하기'를 눌러야 보낸다", () => {
    const onSubmit = open();
    type(/무슨 일이 있었나요/, "돈을 못 받았어요");
    fireEvent.click(screen.getByRole("button", { name: "심층 분석 시작" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("그래도 진행하시겠습니까?");
    fireEvent.click(screen.getByRole("button", { name: "그래도 진행하기" }));
    expect(onSubmit).toHaveBeenCalledWith("[있었던 일] 돈을 못 받았어요");
  });

  test("'내용 보완하기'를 누르면 보내지 않고 입력으로 돌아간다", () => {
    const onSubmit = open();
    type(/무슨 일이 있었나요/, "돈을 못 받았어요");
    fireEvent.click(screen.getByRole("button", { name: "심층 분석 시작" }));
    fireEvent.click(screen.getByRole("button", { name: "내용 보완하기" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("직접 입력으로 바꾸면 큰 입력란 하나와 들어갈 내용 안내가 나온다", () => {
    const onSubmit = open();
    fireEvent.click(screen.getByRole("tab", { name: "직접 입력" }));
    expect(screen.getByText("이 내용이 들어가게 적어 주세요")).toBeDefined();
    type(/사연 직접 입력/, `${FULL.facts} 상대는 집주인이에요. ${FULL.ask}`);
    fireEvent.click(screen.getByRole("button", { name: "심층 분석 시작" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("DEC-041 예시: 저장된 결과로 가는 링크가 있고, 양식에 채운 예시는 빠진 내용 없이 통과한다", () => {
    const onSubmit = open();
    expect(
      screen.getByRole("link", { name: "저장된 심층 분석 결과 보기" }).getAttribute("href"),
    ).toBe(DEEP_PRESET.href);
    fireEvent.click(screen.getByRole("button", { name: "양식에 예시 채워 보기" }));
    expect((screen.getByLabelText(/상대방은 누구인가요/) as HTMLTextAreaElement).value).toBe(
      DEEP_PRESET.values.other,
    );
    expect(reviewDeep({ values: DEEP_PRESET.values }).missing).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "심층 분석 시작" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
