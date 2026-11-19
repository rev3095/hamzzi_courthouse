// 질문 해석 예시 뱅크 (DEC-042). "질문 → 절차 라벨" 예시를 모아 두고, 새 질문과 비슷한 것을 골라 질문 해석 호출에 붙인다.
// Claude는 미세조정을 할 수 없어서, 우리 분류 체계를 따르게 하는 방법이 "매번 관련 예시를 보여 주는 것"이다.
// - 예시는 직접 쓴 것만 넣는다: 홈 카테고리의 예시 문장·문장 시작(카테고리가 곧 라벨), 직접 쓴 복합 사례.
//   기계가 라벨링한 공개 질문(evals/labels/labeled.jsonl)은 사람이 확인하기 전에는 여기에 넣지 않는다.
// - 고르는 방법은 글자 두 개 단위의 겹침이다 (모델·임베딩 없음, 비용 0). 예시가 수천 건이 되면 임베딩 검색을 검토한다.
// 순수 모듈: 사용자 질문은 여기서 저장하지 않는다.
import { CATEGORY_LIST } from "@/lib/procedure/categories";
import type { SectionLabel } from "@/lib/procedure/sections";

export type Channel = "online" | "offline" | "both" | "unknown";

export type LabelExample = {
  q: string;
  section: SectionLabel;
  others: SectionLabel[];
  channel: Channel;
};

/** 일이 벌어진 곳이 라벨로 정해지는 분야 */
const CHANNEL_OF: Partial<Record<SectionLabel, Channel>> = {
  defamation: "online",
  insult: "offline",
  assault: "offline",
  domestic_violence: "offline",
  school_violence: "offline",
  traffic: "offline",
};

/** 여러 절차가 함께 걸린 사례 (직접 작성). 주된 라벨은 사용자가 지금 가장 먼저 풀려는 문제다 */
const COMPOSITE: LabelExample[] = [
  {
    q: "전세사기를 당한 것 같아요. 집주인이 연락이 안 되고 보증금도 돌려받지 못했어요.",
    section: "lease_deposit",
    others: ["fraud"],
    channel: "offline",
  },
  {
    q: "직장 상사가 회사 단체 대화방에서 저를 욕하고 일부러 업무에서 빼요.",
    section: "workplace_harassment",
    others: ["defamation"],
    channel: "both",
  },
  {
    q: "배우자가 때려서 다쳤어요. 이혼하고 아이도 제가 키우고 싶어요.",
    section: "domestic_violence",
    others: ["family"],
    channel: "offline",
  },
  {
    q: "중고거래로 돈을 보냈는데 물건은 안 오고, 판매자가 제 연락처를 인터넷에 올렸어요.",
    section: "fraud",
    others: ["privacy"],
    channel: "online",
  },
  {
    q: "일하다 다쳤는데 회사가 치료비도 안 주고 그만두라고 해요.",
    section: "industrial_accident",
    others: ["dismissal"],
    channel: "offline",
  },
  {
    q: "헤어진 사람이 계속 집 앞에 찾아오고 SNS에 제 험담을 올려요.",
    section: "stalking",
    others: ["defamation"],
    channel: "both",
  },
  {
    q: "퇴사했는데 마지막 월급을 못 받았고, 회사는 제가 돈을 빼돌렸다며 고소했어요.",
    section: "respond_criminal",
    others: ["wage"],
    channel: "offline",
  },
  {
    q: "아이가 학교에서 맞았는데 가해 학생 쪽에서 단체 대화방에 우리 아이 험담을 퍼뜨려요.",
    section: "school_violence",
    others: ["defamation"],
    channel: "both",
  },
  {
    q: "부모님이 돌아가셨는데 형제가 유산을 혼자 가져갔고, 부모님 빚 독촉장이 저한테 왔어요.",
    section: "inheritance",
    others: ["respond_civil"],
    channel: "offline",
  },
  {
    q: "검찰이라는 전화에 속아 돈을 보냈는데, 제 계좌가 범죄에 쓰였다며 경찰에서 나오라고 해요.",
    section: "voice_phishing",
    others: ["respond_criminal"],
    channel: "online",
  },
];

const strip = (s: string) => s.replace(/^예:\s*/, "").trim();

/** 홈 카테고리 문장(직접 쓴 것)에서 만든 예시 + 복합 사례 */
export const LABEL_BANK: LabelExample[] = [
  ...CATEGORY_LIST.flatMap((c) =>
    [c.placeholder, ...c.starters].map((q) => ({
      q: strip(q),
      section: c.track as SectionLabel,
      others: [] as SectionLabel[],
      channel: CHANNEL_OF[c.track as SectionLabel] ?? ("unknown" as Channel),
    })),
  ),
  ...COMPOSITE,
];

const norm = (s: string) => s.normalize("NFKC").replace(/[^가-힣a-zA-Z0-9]/g, "");

function bigrams(s: string): Set<string> {
  const t = norm(s);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** 두 문장이 글자 두 개 단위로 얼마나 겹치는지 (0~1) */
export function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const g of x) if (y.has(g)) both += 1;
  return both / (x.size + y.size - both);
}

const BANK_GRAMS = LABEL_BANK.map((e) => ({ e, grams: bigrams(e.q) }));
const MIN_SCORE = 0.06;

/**
 * 질문과 비슷한 예시를 고른다. 같은 라벨만 몰리지 않게 라벨마다 하나씩 먼저 뽑고,
 * 복합 사례가 하나도 없으면 가장 비슷한 복합 사례 하나를 더한다 (여러 라벨을 붙이는 모습을 보여 주려고).
 */
export function pickExamples(question: string, k = 4): LabelExample[] {
  const q = bigrams(question);
  if (q.size === 0) return [];
  const scored = BANK_GRAMS.map(({ e, grams }) => {
    let both = 0;
    for (const g of q) if (grams.has(g)) both += 1;
    return { e, score: both / (q.size + grams.size - both) };
  })
    .filter((s) => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  const picked: LabelExample[] = [];
  const labels = new Set<string>();
  for (const s of scored) {
    if (labels.has(s.e.section)) continue;
    labels.add(s.e.section);
    picked.push(s.e);
    if (picked.length >= k) break;
  }
  if (picked.length > 0 && !picked.some((e) => e.others.length > 0)) {
    const composite = scored.find((s) => s.e.others.length > 0);
    if (composite) picked[picked.length >= k ? k - 1 : picked.length] = composite.e;
  }
  return picked;
}

/** 질문 해석 호출에 붙이는 글. 예시가 없으면 빈 문자열 */
export function examplesBlock(question: string): string {
  const ex = pickExamples(question);
  if (ex.length === 0) return "";
  const line = (e: LabelExample) =>
    `- "${e.q}" → section: ${e.section}, others: [${e.others.join(", ")}], channel: ${e.channel}`;
  return `<비슷한_질문_라벨_예시>\n${ex.map(line).join("\n")}\n</비슷한_질문_라벨_예시>`;
}
