// 가상 사건 프리셋 (DEC-061) 검사 — 저장 형식, 항목 개수, 절대 규칙 1·2·4. 모델·법제처를 부르지 않는다.
import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import { parseMatterData } from "./policy";
import { MATTER_PRESETS, PRESET_NOTICE } from "./presets";

const SECTIONS = [
  "docs",
  "facts",
  "parties",
  "relations",
  "demands",
  "clauses",
  "issues",
  "notes",
] as const;

describe.each(MATTER_PRESETS.map((p) => [p.title, p] as const))("프리셋 %s", (_t, p) => {
  test("가상 사건 표시가 있고, 저장 형식(MatterDataZ)을 그대로 통과한다", () => {
    expect(p.title).toContain("[가상]");
    expect(p.id).toMatch(/^preset-\d+$/);
    expect(parseMatterData(p.data)).toEqual(p.data);
  });

  test("개요가 있고 모든 항목이 3개 이상이며 요약본 노트가 있다", () => {
    expect(p.data.summary.length).toBeGreaterThanOrEqual(100);
    for (const k of SECTIONS) expect(p.data[k].length, k).toBeGreaterThanOrEqual(3);
    expect(p.data.notes.some((n) => n.kind === "summary" && n.title === "요약본")).toBe(true);
    // 리서치: 검증된 근거를 모은 법령·판례 노트
    expect(p.data.notes.some((n) => n.kind === "search")).toBe(true);
  });

  test("F-005 쟁점 근거는 법제처 주소가 붙은 문단뿐이고, 그 밖의 글에는 법령 조문·사건번호가 없다", () => {
    for (const i of p.data.issues)
      for (const pt of i.points) expect(pt.url).toMatch(/^https:\/\/www\.law\.go\.kr\//);
    for (const n of p.data.notes)
      if (n.kind === "search")
        for (const s of n.sources) expect(s.url).toMatch(/^https:\/\/www\.law\.go\.kr\//);
    const free = [
      p.data.summary,
      ...p.data.docs.flatMap((d) => [d.title, d.gist, d.body ?? ""]),
      ...p.data.facts.map((f) => f.what),
      ...p.data.parties.flatMap((x) => [x.name, x.role, x.note]),
      ...p.data.demands.map((d) => d.what),
      ...p.data.clauses.flatMap((c) => [c.ref, c.gist]),
      ...p.data.issues.flatMap((i) => [i.title, i.detail, ...i.unknowns]),
      ...p.data.notes.filter((n) => n.kind !== "search").map((n) => n.body),
    ];
    // 사용자가 처음 만든 노트(AI 요약)에는 쟁점 근거를 옮긴 줄이 없다 — 모델이 채운 글만 본다
    for (const s of free) {
      expect(s, s).not.toMatch(/(법|법률|령|규칙)\s*(상\s*)?제\s*\d+\s*조/);
      expect(s, s).not.toMatch(
        /\d{2,4}\s?(다|도|두|누|가합|가단|나|노|고합|고단|헌마|헌바)\s?\d{2,7}/,
      );
    }
  });

  // 보강은 사건 단위로 채운다 — 원본을 받은 사건은 서류마다 원본과 요약본을 모두 갖춘다
  test.skipIf(!p.data.docs.some((d) => d.body))("서류 원본을 받은 사건은 자료마다 원본(지어낸 가상 서류 본문)과 요약본이 있다 (DEC-061 보강)", () => {
    for (const d of p.data.docs) {
      expect((d.body ?? "").length, d.title).toBeGreaterThanOrEqual(300);
      expect(d.body, d.title).not.toMatch(/주소\s*:\s*[가-힣]+(시|도)\s/);
    }
    expect(p.data.notes.some((n) => n.kind === "summary" && n.title === "한눈에 보는 요약본")).toBe(
      true,
    );
  });

  test("N1 단정 표현이 없다 · F-007 연락처·주민번호·계좌·이메일 꼴이 없다", () => {
    const all = JSON.stringify(p.data);
    const texts = all.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
    for (const t of texts) expect(isAssertive(t), t).toBe(false);
    expect(all).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(all).not.toMatch(/\d{6}-?[1-4]\d{6}/);
    expect(all).not.toMatch(/[\w.]+@[\w-]+\.[\w.]+/);
  });
});

test("DEC-061 프리셋이 있고 안내 문구가 저장하지 않는다는 점과 AI 기능은 로그인 뒤라는 점을 알린다", () => {
  expect(MATTER_PRESETS.length).toBeGreaterThanOrEqual(5);
  expect(PRESET_NOTICE).toContain("가상 사건");
  expect(PRESET_NOTICE).toContain("로그인한 뒤");
});
