// @vitest-environment node
// DEC-056 내 세션: 남겨 둔 질문과 사건을 한 목록으로. 문장·사건 이름은 가상이다.
import { describe, expect, test } from "vitest";
import {
  SESSION_PAGE_SIZE,
  dayGroupOf,
  filterSessions,
  groupByDay,
  matterHref,
  mergeSessions,
  openParam,
  pageWindow,
  paginate,
  type QuestionItem,
} from "./sessions";

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

describe("DEC-056 ③ 데스크톱형 배치 — 거르기·페이지·날짜 묶음", () => {
  const many = Array.from({ length: 23 }, (_, i) =>
    q(`q${i + 1}`, `2026-11-${String(25 - (i % 20)).padStart(2, "0")}T00:00:00Z`),
  );
  const items = mergeSessions(many, [m("m1", "2026-11-25T03:00:00Z")]);

  test("종류·찾는 말로 거른다 (띄어쓰기·대소문자 무시)", () => {
    expect(filterSessions(items, { kind: "matter" })).toHaveLength(1);
    expect(filterSessions(items, { kind: "question" })).toHaveLength(23);
    expect(filterSessions(items, { query: "가상  사건" })).toHaveLength(1);
    expect(filterSessions(items, { query: "없는 말" })).toHaveLength(0);
  });

  test("한 페이지 10개, 범위 밖 페이지는 끝으로 맞춘다", () => {
    const p1 = paginate(items, 1);
    expect(p1.items).toHaveLength(SESSION_PAGE_SIZE);
    expect(p1.pages).toBe(3);
    expect([p1.from, p1.to]).toEqual([1, 10]);
    const last = paginate(items, 99);
    expect(last.page).toBe(3);
    expect([last.from, last.to]).toEqual([21, 24]);
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0 });
  });

  test("페이지 번호는 최대 다섯 개, 지금 페이지를 가운데쯤", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 12)).toEqual([4, 5, 6, 7, 8]);
    expect(pageWindow(12, 12)).toEqual([8, 9, 10, 11, 12]);
  });

  test("한국 시간 날짜로 오늘·어제·지난 7일·지난 30일·이전으로 묶는다", () => {
    const now = Date.parse("2026-11-25T03:00:00Z"); // 한국 시간 11월 25일 정오
    expect(dayGroupOf("2026-11-24T16:00:00Z", now)).toBe("오늘"); // 한국 시간 25일 1시
    expect(dayGroupOf("2026-11-24T14:00:00Z", now)).toBe("어제"); // 한국 시간 24일 23시
    expect(dayGroupOf("2026-11-20T00:00:00Z", now)).toBe("지난 7일");
    expect(dayGroupOf("2026-11-01T00:00:00Z", now)).toBe("지난 30일");
    expect(dayGroupOf("2026-09-01T00:00:00Z", now)).toBe("이전");
    const groups = groupByDay(items, now);
    expect(groups[0].label).toBe("오늘");
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(items.length);
    expect(new Set(groups.map((g) => g.label)).size).toBe(groups.length);
  });
});
