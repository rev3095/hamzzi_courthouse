// @vitest-environment node
// DEC-056 내 세션: 남겨 둔 질문과 사건을 한 목록으로. 문장·사건 이름은 가상이다.
import { describe, expect, test } from "vitest";
import { matterHref, mergeSessions, openParam, type QuestionItem } from "./sessions";

const q = (id: string, createdAt: string): QuestionItem => ({
  id,
  maskedText: "가상 질문",
  status: "analyzed",
  createdAt,
  followup: false,
});
const m = (id: string, updatedAt: string) => ({
  id,
  title: "가상 사건",
  updatedAt,
  counts: { docs: 0, parties: 0, issues: 0, notes: 1 },
});

describe("DEC-056 내 세션 목록", () => {
  test("질문과 사건을 최근 것부터 한 목록으로", () => {
    const out = mergeSessions(
      [q("q1", "2026-11-20T00:00:00Z"), q("q2", "2026-11-24T09:00:00Z")],
      [m("m1", "2026-11-24T10:00:00Z"), m("m2", "2026-11-22T00:00:00Z")],
    );
    expect(out.map((x) => (x.kind === "question" ? x.question.id : x.matter.id))).toEqual([
      "m1",
      "q2",
      "m2",
      "q1",
    ]);
  });

  test("한쪽이 비어도 된다", () => {
    expect(mergeSessions([], [])).toEqual([]);
    expect(mergeSessions([q("q1", "2026-11-20T00:00:00Z")], [])[0].kind).toBe("question");
  });

  test("사건 여는 주소와 ?open= 값은 사건 번호 꼴만", () => {
    const id = "51c594e1-b1c6-4fe3-9d2a-1eed9ac61edd";
    expect(matterHref(id)).toBe(`/matters?open=${id}`);
    expect(openParam(`?open=${id}`)).toBe(id);
    expect(openParam("?open=../../x")).toBeNull();
    expect(openParam("")).toBeNull();
  });
});
