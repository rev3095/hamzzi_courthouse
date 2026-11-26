// DEC-073 ③ 사진 용도 분류와 갈 곳 — 판독 결과 거르기(purpose), 일반 사진 질문 문장, 사건 서류 → 사건 진행 자료.
// 모델은 부르지 않는다 (절대 규칙 8). 서류 내용은 직접 쓴 가상 예다.
import { describe, expect, test } from "vitest";
import {
  DEFAULT_PHOTO_QUESTION,
  composePhotoQuestion,
  type CaseReading,
} from "@/lib/casefile/limits";
import { READING_SCHEMA, screenReading, type ReadingRaw } from "@/lib/casefile/policy";
import { matterFromReading } from "@/lib/matters/from-reading";
import { parseMatterData } from "@/lib/matters/policy";

const raw = (extra: Partial<ReadingRaw> = {}): ReadingRaw => ({
  readable: true,
  docTypes: ["내용증명"],
  summary: "발신인이 수신인에게 밀린 용역 대금을 보내 달라고 요구했습니다.",
  claims: ["밀린 용역 대금을 보내 달라"],
  parties: [
    { role: "발신인", side: "claimant", kind: "business", name: "주식회사 가상물산" },
    { role: "수신인", side: "respondent", kind: "person", name: "" },
  ],
  personNames: [],
  ...extra,
});

describe("DEC-073 ③ 사진 용도", () => {
  test("판독 형식이 용도를 반드시 고르게 하고, 목록은 case·question 둘뿐", () => {
    expect(READING_SCHEMA.required).toContain("purpose");
    expect(READING_SCHEMA.properties.purpose.enum).toEqual(["case", "question"]);
  });

  test("question만 일반 사진이고, 없거나 다른 값이면 사건 서류로 본다", () => {
    expect(screenReading(raw({ purpose: "question" }))?.reading.purpose).toBe("question");
    expect(screenReading(raw())?.reading.purpose).toBe("case");
    expect(screenReading(raw({ purpose: "이상한 값" }))?.reading.purpose).toBe("case");
  });

  test("일반 사진은 사건 서류 꼴 없이 질문 + 사진 내용 한 문장으로", () => {
    expect(composePhotoQuestion("", "안내문에 주차 금지 구역이라고 적혀 있습니다.")).toBe(
      `${DEFAULT_PHOTO_QUESTION}\n사진에 보이는 내용: 안내문에 주차 금지 구역이라고 적혀 있습니다.`,
    );
    expect(composePhotoQuestion("이건 어떤 법이야?", "x")).toMatch(/^이건 어떤 법이야\?/);
    // 질문 글자 수 한도 안으로 줄인다
    expect(composePhotoQuestion("q", "가".repeat(5000), 300)).toHaveLength(300);
  });

  test("사건 서류는 사건 진행 자료로 옮기고, 저장 검증을 통과한다 (개인은 역할로)", () => {
    const reading = screenReading(raw())!.reading as CaseReading;
    const data = matterFromReading(reading, 2);
    expect(data.docs).toHaveLength(1);
    expect(data.docs[0]).toMatchObject({ type: "내용증명", pages: 2 });
    expect(data.demands.map((d) => d.what)).toEqual(["밀린 용역 대금을 보내 달라"]);
    expect(data.demands[0].docId).toBe(data.docs[0].id);
    expect(data.parties.map((p) => p.name)).toEqual(["주식회사 가상물산", "수신인"]);
    expect(data.titleAuto).toBeUndefined();
    // AI가 읽은 개요는 사용자가 쓰는 요약 칸이 아니라 서류 요지에만
    expect(data.summary).toBe("");
    expect(data.docs[0].gist).toContain("용역 대금");
    expect(() => parseMatterData(data)).not.toThrow();
  });
});
