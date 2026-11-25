// DEC-063 분석 단계별 시간 재기
import { describe, expect, it } from "vitest";
import { parseTiming, stageClock } from "./timing";

describe("DEC-063 단계 시계", () => {
  it("단계마다 다음 단계가 시작될 때까지의 시간을 잰다", () => {
    let t = 0;
    const c = stageClock(() => t);
    t = 100;
    c.mark("intent");
    t = 600;
    c.mark("search");
    c.mark("search"); // 같은 단계가 이어 오면 하나로
    t = 900;
    c.mark("answer");
    t = 5900;
    c.mark("verify");
    t = 6400;
    expect(c.done()).toEqual({
      totalMs: 6400,
      stages: [
        { stage: "prepare", ms: 100 },
        { stage: "intent", ms: 500 },
        { stage: "search", ms: 300 },
        { stage: "answer", ms: 5000 },
        { stage: "verify", ms: 500 },
      ],
    });
  });

  it("다른 이름의 검색 신호는 검색으로 모으고, 모르는 단계는 무시한다", () => {
    let t = 0;
    const c = stageClock(() => t);
    c.mark("free_search");
    t = 10;
    c.mark("뭔가");
    t = 20;
    c.mark("search");
    t = 30;
    expect(c.done().stages).toEqual([
      { stage: "prepare", ms: 0 },
      { stage: "search", ms: 30 },
    ]);
  });

  it("저장된 값 형식 확인", () => {
    expect(parseTiming(null)).toBeNull();
    expect(
      parseTiming({
        totalMs: 5,
        stages: [
          { stage: "answer", ms: 3 },
          { stage: "x", ms: 1 },
        ],
      }),
    ).toEqual({
      totalMs: 5,
      stages: [{ stage: "answer", ms: 3 }],
    });
  });
});
