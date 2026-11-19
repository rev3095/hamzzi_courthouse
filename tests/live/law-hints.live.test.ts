// 홈 카테고리 기본 조문(lib/procedure/categories lawHints)이 법제처에 실제로 있는지 확인한다 (DEC-041, 무료 조회).
// 실행: pnpm test:live. 법이 개정돼 조문이 옮겨지거나 없어지면 여기서 드러난다 — 그때 categories.ts와 evals/examples-gen/law-hints.json을 고친다.
import { describe, expect, test, vi } from "vitest";
import expected from "../../evals/examples-gen/law-hints.json";
import { CATEGORY_LIST } from "@/lib/procedure/categories";

vi.mock("server-only", () => ({}));
const { createLawSource } = await import("@/lib/search/law-source");

const compact = (s: string) => s.replace(/\s/g, "");

describe.skipIf(!process.env.OPEN_LAW_API_KEY)("카테고리 기본 조문 실존 (DEC-041)", () => {
  const source = createLawSource({ timeoutMs: 30_000 });

  test("모든 기본 조문이 그 법령에 있고, 제목이 기록해 둔 낱말을 담고 있다", async () => {
    const titles = new Map(
      Object.values(expected.hints as unknown as Record<string, [string, string, string][]>)
        .flat()
        .map(([law, no, word]) => [`${compact(law)} ${no}`, word]),
    );
    const problems: string[] = [];
    for (const c of CATEGORY_LIST) {
      for (const h of c.lawHints ?? []) {
        for (const no of h.articleNos) {
          const a = await source.getArticle(h.lawName, no);
          const id = `${c.key}: ${h.lawName} ${no}`;
          if (!a) problems.push(`${id} — 조문 없음`);
          else if (compact(a.lawName) !== compact(h.lawName))
            problems.push(`${id} — 다른 법령(${a.lawName})`);
          else {
            const word = titles.get(`${compact(h.lawName)} ${no}`);
            if (word && !a.title.includes(word)) problems.push(`${id} — 제목이 바뀜(${a.title})`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  }, 600_000);
});
