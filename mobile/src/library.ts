// 기기 안 자료 (DEC-048·049): 검증된 예시 답변과, 그 예시가 근거로 쓴 법령 조문·판례 목록.
// 인터넷이 없거나 서버에 닿지 않을 때 탐색·답변 화면이 이 자료로 동작한다. 판례 본문은 담지 않는다(목록·출처 주소만, DEC-007).
import data from "@/lib/demo/examples.json";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import type { PostSummary } from "@/lib/community/policy";
import { CATEGORIES, type CategoryKey } from "@/lib/procedure/categories";

export type Example = { id: string; tags: string[]; question: string; result: DemoAnalysisResult };
export const EXAMPLES = (data as unknown as { examples: Example[] }).examples;
export const exampleOf = (id: string) => EXAMPLES.find((e) => e.id === id) ?? null;

/** 예시가 속한 홈 카테고리 */
const CATEGORY_OF = new Map<string, CategoryKey>();
for (const k of Object.keys(CATEGORIES) as CategoryKey[])
  for (const id of CATEGORIES[k].examples) CATEGORY_OF.set(id, k);
export const categoryOfExample = (id: string): CategoryKey | null => CATEGORY_OF.get(id) ?? null;

export type LibArticle = {
  id: string;
  lawName: string;
  articleNo: string;
  title: string;
  sourceUrl: string;
  /** 이 조문을 근거로 쓴 예시 */
  examples: string[];
  /** 예시 답변이 인용한 원문 구절 (검증 통과분만) */
  quotes: string[];
};
export type LibCase = {
  id: string;
  caseNo: string;
  caseName: string;
  court: string;
  decidedAt: string | null;
  sourceUrl: string;
  examples: string[];
};

function build() {
  const arts = new Map<string, LibArticle>();
  const cases = new Map<string, LibCase>();
  for (const e of EXAMPLES) {
    for (const a of e.result.articles) {
      const hit = arts.get(a.id) ?? {
        id: a.id,
        lawName: a.lawName,
        articleNo: a.articleNo,
        title: a.title,
        sourceUrl: a.sourceUrl,
        examples: [],
        quotes: [],
      };
      if (a.used && !hit.examples.includes(e.id)) hit.examples.push(e.id);
      arts.set(a.id, hit);
    }
    for (const p of e.result.answer.points) {
      const hit = arts.get(p.source);
      if (hit && p.check === "verified" && p.quote && !hit.quotes.includes(p.quote))
        hit.quotes.push(p.quote);
    }
    for (const c of e.result.cases) {
      const hit = cases.get(c.id) ?? {
        id: c.id,
        caseNo: c.caseNo,
        caseName: c.caseName,
        court: c.court,
        decidedAt: c.decidedAt ?? null,
        sourceUrl: c.sourceUrl,
        examples: [],
      };
      if (!hit.examples.includes(e.id)) hit.examples.push(e.id);
      cases.set(c.id, hit);
    }
  }
  return {
    articles: [...arts.values()].sort((a, b) =>
      `${a.lawName}${a.articleNo}`.localeCompare(`${b.lawName}${b.articleNo}`, "ko", {
        numeric: true,
      }),
    ),
    cases: [...cases.values()].sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")),
  };
}

export const LIBRARY = build();

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

export function searchLibrary(q: string) {
  const words = q.split(/\s+/).map(norm).filter(Boolean);
  if (words.length === 0) return { articles: LIBRARY.articles, cases: LIBRARY.cases };
  const hit = (text: string) => words.every((w) => norm(text).includes(w));
  return {
    articles: LIBRARY.articles.filter((a) =>
      hit(`${a.lawName} ${a.articleNo} ${a.title} ${a.quotes.join(" ")}`),
    ),
    cases: LIBRARY.cases.filter((c) => hit(`${c.caseNo} ${c.caseName} ${c.court}`)),
  };
}

/** 질문과 낱말이 겹치는 예시 (서버에 닿지 않을 때 보여 줄 검증된 답변) */
export function nearestExamples(question: string, prefer: string[], max = 3): Example[] {
  const grams = (s: string) => {
    const t = norm(s);
    const out = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const q = grams(question);
  return EXAMPLES.map((e) => {
    const g = grams(e.question);
    let both = 0;
    for (const x of q) if (g.has(x)) both++;
    return { e, score: both / Math.max(8, g.size) + (prefer.includes(e.id) ? 0.5 : 0) };
  })
    .filter((x) => x.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.e);
}

/** 미리보기용 커뮤니티 예시 글 — 직접 쓴 가상 글이고 실제 이용자 글이 아니다 */
export const SAMPLE_POSTS: (PostSummary & { body: string })[] = [
  {
    id: "sample-1",
    board: "free",
    title: "처음 와 봤어요. 판례를 이렇게 찾아볼 수 있는 줄 몰랐네요",
    nickname: "올리브 햄찌",
    member: true,
    folded: false,
    commentCount: 3,
    createdAt: "2026-11-19T10:12:00+09:00",
    body: "보증금 문제로 검색하다 들어왔는데, 답변마다 어느 조문을 근거로 했는지 같이 보여 줘서 좋았어요. 다들 어떤 기능을 제일 자주 쓰시나요?",
  },
  {
    id: "sample-2",
    board: "whatif",
    title: "만약에 이웃이 제 택배를 대신 받아 두고 돌려주지 않으면 어떤 절차가 되나요",
    nickname: "익명 햄찌",
    member: false,
    folded: false,
    commentCount: 2,
    createdAt: "2026-11-19T14:40:00+09:00",
    body: "실제로 있었던 일은 아니고 궁금해서요. 이런 경우에는 어디에 먼저 물어봐야 하는지, 비슷한 경험 있으신 분 계신가요.",
  },
  {
    id: "sample-3",
    board: "opinion",
    title: "전자소송 화면이 조금 더 쉬웠으면 좋겠어요",
    nickname: "아고라 산책",
    member: true,
    folded: false,
    commentCount: 5,
    createdAt: "2026-11-18T21:05:00+09:00",
    body: "혼자 지급명령을 신청해 봤는데 용어가 어려워서 한참 걸렸어요. 처음 쓰는 사람을 위한 쉬운 말 안내가 있으면 좋겠다는 생각이 들었습니다.",
  },
  {
    id: "sample-4",
    board: "story",
    title: "임차권등기명령 신청하고 이사한 과정을 적어 봅니다",
    nickname: "이사한 햄찌",
    member: true,
    folded: false,
    commentCount: 4,
    createdAt: "2026-11-18T09:30:00+09:00",
    body: "계약이 끝나고도 보증금을 받지 못해 신청했습니다. 준비한 서류와 걸린 순서를 적어 둘게요. 같은 상황인 분들께 참고가 되면 좋겠어요.",
  },
  {
    id: "sample-5",
    board: "tips",
    title: "대한법률구조공단 상담 예약할 때 미리 챙기면 좋은 것",
    nickname: "메모하는 햄찌",
    member: false,
    folded: false,
    commentCount: 1,
    createdAt: "2026-11-17T16:20:00+09:00",
    body: "계약서, 주고받은 문자, 입금 내역을 날짜순으로 정리해 가니 상담이 빨랐어요. 질문도 미리 적어 가면 좋습니다.",
  },
  {
    id: "sample-6",
    board: "feedback",
    title: "앱에서도 글자 크기를 키울 수 있으면 좋겠어요",
    nickname: "돋보기",
    member: false,
    folded: false,
    commentCount: 0,
    createdAt: "2026-11-17T11:02:00+09:00",
    body: "부모님께 알려 드렸는데 글씨가 작다고 하셔서요. 설정에 글자 크기가 있으면 좋겠습니다.",
  },
];
