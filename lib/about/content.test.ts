// 소개 메뉴 고정 문안 검사 (DEC-051). 절대 규칙 2(단정·판정 표현)·3(숫자)과 끊긴 링크를 막는다.
import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { isAssertive } from "@/lib/ai/policy";
import {
  ABOUT_PAGES,
  CASE_DB,
  DEVELOPER,
  ENGINE_KEEPS,
  ENGINE_STEPS,
  FEATURES,
  FEATURES_PENDING,
  INTRO,
  INTRO_LEAD,
  NOT_CHARGED,
  ROADMAP_CHECKS,
  ROADMAP_LEAD,
  ROADMAP_NOTICE,
  SCHEDULE,
  SERVICE_STEPS,
  type AboutSection,
} from "./content";

const sectionTexts = (s: AboutSection) => [s.title, ...s.lines, ...(s.list ?? [])];
const ALL: string[] = [
  INTRO_LEAD,
  ...INTRO.flatMap(sectionTexts),
  ...FEATURES.flatMap((f) => [f.title, f.summary, ...f.lines, f.link?.label ?? ""]),
  ...FEATURES_PENDING,
  ROADMAP_LEAD,
  ROADMAP_NOTICE,
  ...ENGINE_STEPS.flatMap((s) => [s.tag, s.title, s.body]),
  ...ENGINE_KEEPS.flatMap(sectionTexts),
  ...sectionTexts(CASE_DB),
  ...SERVICE_STEPS.flatMap((s) => [s.tag, s.title, s.body]),
  NOT_CHARGED,
  ...SCHEDULE.flatMap((t) => [t.track, ...t.items.flatMap((i) => [i.when, i.what])]),
  ...ROADMAP_CHECKS.flatMap(sectionTexts),
  ...DEVELOPER.flatMap(sectionTexts),
].filter(Boolean);

/** 승패·가능성 확정 표현 (절대 규칙 2, DEC-055: 상담식 의견은 허용하되 승률·결과 보장은 금지) + 변협 광고규정 금지 표현 */
const JUDGING =
  /승률|승소|패소|이길|이깁|성공\s*(확률|가능)|가능성|확률|유리|불리|합법|적법|보장(합|해)|무료\s*상담|최저가|변호사\s*필요\s*없/;

describe("소개 메뉴 문안 (DEC-051)", () => {
  test("절대 규칙 2: 단정 표현(반드시·무조건·100% 등)이 없다", () => {
    for (const s of ALL) expect(isAssertive(s), s).toBe(false);
  });

  test("절대 규칙 2: 승률·결과 보장 같은 확정 표현이 없다", () => {
    for (const s of ALL) expect(s, s).not.toMatch(JUDGING);
  });

  test("절대 규칙 3: 숫자는 유인물의 연도·단계 번호뿐이다 (가격·통계 없음)", () => {
    const allowed = new Set(["2026", "2027", "2028", "2029", "1", "2", "3"]);
    for (const s of ALL) {
      for (const n of s.match(/\d+/g) ?? []) expect(allowed.has(n), `${n} in ${s}`).toBe(true);
    }
    for (const s of ALL) expect(s, s).not.toMatch(/\d\s*원|₩|\$/);
  });

  // 싣지 않기로 한 이름은 공개 저장소에 쓰지 않으려고 글자 수와 SHA-256 해시로만 둔다
  const HIDDEN_NAMES: [number, string][] = [
    [5, "a89cec968fd8620b8bc5315a2ce84536b7155840885c60a4782917dfed6b1f2b"],
    [3, "c9f20e4be7fef1aec9e1b7dd910fdbfe90e68a0691ebf9832d76f42127abe7ce"],
    [3, "026809c140a9503fc4e76193ecd65e4350b4c44e796cd925dde044495d32f728"],
    [2, "7531bbe997ffb7000b0bc75afa10669b1d99f79b9cf797bd85b8d98e4e6cbc15"],
  ];
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  // 협업 변호사·법무법인 이름은 DEC-055(2026-11-25)로 싣는다 — 목록에서 뺐다
  test("싣지 않기로 한 이름(경쟁 서비스·시범 지역)이 없다 (사용자 결정 2026-11-24)", () => {
    for (const s of ALL) {
      const chars = [...s];
      for (const [len, hash] of HIDDEN_NAMES) {
        for (let i = 0; i + len <= chars.length; i++) {
          expect(sha(chars.slice(i, i + len).join("")), s).not.toBe(hash);
        }
      }
    }
  });

  test("향후 계획은 모두 계획으로 쓴다", () => {
    expect(ROADMAP_NOTICE).toContain("바뀔 수 있어요");
  });

  test("DEC-055: 전면 무료 — 구독·유료·결제 계획을 쓰지 않는다", () => {
    for (const s of ALL) {
      expect(s, s).not.toMatch(/구독\s*(기능|결제)|유료\s*(범위|기능|화)|결제\s*기능|가격/);
    }
    expect(SERVICE_STEPS.some((s) => s.title.includes("구독"))).toBe(false);
    expect(NOT_CHARGED).toContain("유료로 바꿀 계획이 없어요");
  });

  test("링크는 모두 사이트 안의 실제 페이지다", () => {
    const appDir = path.join(process.cwd(), "app");
    const resolves = (href: string) => {
      const [pathname] = href.split(/[?#]/);
      let dir = appDir;
      for (const seg of decodeURIComponent(pathname).split("/").filter(Boolean)) {
        const exact = path.join(dir, seg);
        if (existsSync(exact)) {
          dir = exact;
          continue;
        }
        const dynamic = readdirSync(dir, { withFileTypes: true }).find(
          (d) => d.isDirectory() && /^\[[^.\]]+\]$/.test(d.name),
        );
        if (!dynamic) return false;
        dir = path.join(dir, dynamic.name);
      }
      return existsSync(path.join(dir, "page.tsx"));
    };
    const hrefs = [
      ...ABOUT_PAGES.map((p) => p.href),
      ...FEATURES.flatMap((f) => (f.link ? [f.link.href] : [])),
    ];
    for (const href of hrefs) expect(resolves(href), href).toBe(true);
  });

  test("이메일 주소는 문안에 그대로 쓰지 않는다 (누를 때 합쳐서 보여 준다)", () => {
    for (const s of ALL) expect(s, s).not.toContain("@");
  });
});
