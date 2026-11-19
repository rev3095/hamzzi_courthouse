// 편집기(/studio)가 화면 변화를 따라가는지 지키는 검사 (브랜드 가이드 2.3).
// 화면 코드에서 HamzziJudge·HamzziBadge·HamzziFace에 넘긴 mood를 모두 찾아,
// 그 상태가 편집기 설명(MOOD_INFO.usedIn)과 실제 화면 미리보기(MOOD_CONTEXTS, 말풍선 카드 말고)를 가졌는지 본다.
// 새 화면에 마스코트를 넣었는데 이 검사가 실패하면: lib/mascot/moods.ts usedIn + components/studio/MascotContexts.tsx 맥락을 더한다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { MOOD_CONTEXTS } from "@/components/studio/MascotContexts";
import { isMood, MASCOT_MOODS, MOOD_INFO, moodForError, type MascotMood } from "@/lib/mascot/moods";

const ROOT = process.cwd();
const SKIP = [path.join("components", "studio"), path.join("components", "HamzziJudge.tsx")];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

const TAG = /<Hamzzi(?:Judge|Badge|Face)\b[^>]*?\bmood=(?:"([^"]+)"|\{([^}]*)\})/g;
// 오류 코드에 따라 갈리는 상태 (moodForError가 돌려줄 수 있는 값 전부)
const FROM_ERROR = [
  ...new Set(
    ["SEARCH_UPSTREAM_FAILED", "RATE_LIMITED", "PII_CONFIRMATION_REQUIRED"].map(moodForError),
  ),
];

function usedMoods(): Map<MascotMood, string[]> {
  const found = new Map<MascotMood, string[]>();
  const add = (m: MascotMood, file: string) => found.set(m, [...(found.get(m) ?? []), file]);
  for (const dir of ["app", "components"])
    for (const file of tsxFiles(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file);
      if (SKIP.some((s) => rel.startsWith(s))) continue;
      for (const m of readFileSync(file, "utf8").matchAll(TAG)) {
        const literal = m[1];
        const expr = m[2] ?? "";
        if (literal) {
          expect(isMood(literal), `${rel}: 알 수 없는 mood "${literal}"`).toBe(true);
          add(literal as MascotMood, rel);
        } else if (expr.includes("moodForError")) FROM_ERROR.forEach((x) => add(x, rel));
        else throw new Error(`${rel}: mood={${expr}} — 이 검사에 해석 규칙을 더해 주세요`);
      }
    }
  return found;
}

describe("마스코트 상태 ↔ 편집기", () => {
  const used = usedMoods();

  test("화면에서 쓰는 상태를 찾는다 (검사가 비지 않게)", () => {
    expect(used.size).toBeGreaterThan(3);
  });

  test.each([...MASCOT_MOODS])(
    "%s: 화면에서 쓰면 편집기 설명과 실제 화면 미리보기가 있다",
    (mood) => {
      const files = used.get(mood);
      if (!files) return;
      expect(MOOD_INFO[mood].usedIn.length, `${mood} 쓰는 곳: ${files.join(", ")}`).toBeGreaterThan(
        0,
      );
      expect(
        MOOD_CONTEXTS[mood].some((c) => c !== "bubble"),
        `${mood}는 ${files.join(", ")}에서 쓰는데 편집기 미리보기가 말풍선 카드뿐`,
      ).toBe(true);
    },
  );
});
