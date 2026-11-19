// 비슷한 예시 찾기 (DEC-048) — 순수 규칙. 앱에 함께 넣은 검증된 예시 답변(lib/demo/examples.json)에서
// 같은 섹션의 예시를 먼저, 그다음 글자 겹침이 많은 예시를 고른다. 예시 답변은 AI가 만든 것이라 화면이 AI_NOTICE를 붙인다.
import data from "@/lib/demo/examples.json";
import { CATEGORY_LIST } from "@/lib/procedure/categories";
import { normText, type Section } from "./lexicon";

type Example = { id: string; tags: string[]; question: string };
const EXAMPLES = (data as { examples: Example[] }).examples;

/** 예시 id → 그 예시가 속한 카테고리의 섹션 */
const SECTION_OF = new Map<string, Section>(
  CATEGORY_LIST.flatMap((c) => c.examples.map((id) => [id, c.track as Section] as const)),
);

function bigrams(t: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

export type ExampleRef = { id: string; question: string; sameSection: boolean };

/** 질문과 비슷한 예시 (최대 max개). 섹션이 같은 예시가 앞이고, 섹션이 없으면 글자 겹침만 본다 */
export function similarExamples(section: Section | null, question: string, max = 2): ExampleRef[] {
  const q = bigrams(normText(question));
  return EXAMPLES.map((e) => {
    const same = section !== null && SECTION_OF.get(e.id) === section;
    return { e, same, score: (same ? 1 : 0) + similarity(q, bigrams(normText(e.question))) };
  })
    .filter((x) => x.same || x.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => ({ id: x.e.id, question: x.e.question, sameSection: x.same }));
}

/** 예시 id → 섹션 (앱 화면의 예시 목록 묶음용) */
export const exampleSection = (id: string): Section | null => SECTION_OF.get(id) ?? null;
