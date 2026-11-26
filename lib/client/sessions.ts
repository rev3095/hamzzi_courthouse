// 내 세션 (DEC-039·056) — 마이페이지에서 남겨 둔 질문과 사건 진행의 사건을 한 목록으로. 순수 도우미(브라우저·테스트 공용).
// 질문은 가린 문장(마스킹본), 사건은 사용자가 붙인 사건 이름만 보인다. 판정·평가 항목은 없다.
import type { MatterSummary } from "@/lib/matters/model";

export type QuestionItem = {
  id: string;
  maskedText: string;
  status: string;
  createdAt: string;
  followup: boolean;
  /** 사용자가 바꾼 세션 이름 (DEC-070) */
  title?: string | null;
};

export type SessionItem =
  | { kind: "question"; at: string; question: QuestionItem }
  | { kind: "matter"; at: string; matter: MatterSummary };

export const SESSION_KIND_LABEL: Record<SessionItem["kind"], string> = {
  question: "질문",
  matter: "사건",
};

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** 질문은 보낸 때, 사건은 마지막으로 고친 때 기준으로 최근 것부터 */
export function mergeSessions(questions: QuestionItem[], matters: MatterSummary[]): SessionItem[] {
  const items: SessionItem[] = [
    ...questions.map((q) => ({ kind: "question" as const, at: q.createdAt, question: q })),
    ...matters.map((m) => ({ kind: "matter" as const, at: m.updatedAt, matter: m })),
  ];
  return items
    .map((item, i) => ({ item, i, t: time(item.at) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.item);
}

/** 사건을 바로 여는 주소 (/matters?open=<id>) */
export const matterHref = (id: string) => `/matters?open=${encodeURIComponent(id)}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 주소의 ?open= 값이 사건 번호 꼴일 때만 */
export function openParam(search: string): string | null {
  const id = new URLSearchParams(search).get("open");
  return id && UUID.test(id) ? id : null;
}

// --- 마이페이지 데스크톱형 배치 (DEC-056 ③, 2026-11-25): 거르기 · 페이지 · 날짜 묶음 ------------------------

/** 본문 목록 한 페이지의 세션 수 (사용자 선택 2026-11-25) */
export const SESSION_PAGE_SIZE = 10;
/** 사이드바 목록이 처음 보이는 수와 '더보기' 한 번에 더 보이는 수 */
export const SIDEBAR_STEP = 8;
/** 페이지 번호를 한 번에 보이는 수 (1·2·3·4·5) */
export const PAGE_WINDOW = 5;

export type SessionKindFilter = "all" | SessionItem["kind"];

/** 목록에 보이는 글: 질문은 가린 문장, 사건은 사건 이름 */
export const sessionText = (item: SessionItem) =>
  item.kind === "question" ? item.question.title || item.question.maskedText : item.matter.title;

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** 종류와 찾는 말로 거른다. 찾는 말은 띄어쓰기·대소문자를 가리지 않는다 (이 화면 안에서만, 서버로 보내지 않는다) */
export function filterSessions(
  items: SessionItem[],
  opts: { kind?: SessionKindFilter; query?: string } = {},
): SessionItem[] {
  const kind = opts.kind ?? "all";
  const q = norm(opts.query ?? "");
  return items.filter(
    (item) => (kind === "all" || item.kind === kind) && (!q || norm(sessionText(item)).includes(q)),
  );
}

/** 한 페이지 자르기. 페이지 번호는 1부터, 범위 밖이면 가까운 끝으로 맞춘다 */
export function paginate<T>(items: T[], page: number, size = SESSION_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    /** 이 페이지의 첫·마지막 순번 (1부터, 없으면 0) */
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + size, items.length),
  };
}

/** 보일 페이지 번호들: 지금 페이지를 가운데쯤 두고 최대 PAGE_WINDOW개 */
export function pageWindow(page: number, pages: number, width = PAGE_WINDOW): number[] {
  const count = Math.min(width, pages);
  const first = Math.min(Math.max(1, page - Math.floor(width / 2)), pages - count + 1);
  return Array.from({ length: count }, (_, i) => first + i);
}

export const DAY_GROUPS = ["오늘", "어제", "지난 7일", "지난 30일", "이전"] as const;
export type DayGroup = (typeof DAY_GROUPS)[number];

const KST_MS = 9 * 60 * 60 * 1000;
const kstDayIndex = (t: number) => Math.floor((t + KST_MS) / 86_400_000);

/** 한국 시간 날짜로 몇 날 전인지에 따라 묶음 이름 */
export function dayGroupOf(iso: string, now: number = Date.now()): DayGroup {
  const t = time(iso);
  const diff = kstDayIndex(now) - kstDayIndex(t);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return "지난 7일";
  if (diff < 30) return "지난 30일";
  return "이전";
}

/** 최근 순 목록을 날짜 묶음으로 (순서 유지, 빈 묶음은 뺀다) */
export function groupByDay(
  items: SessionItem[],
  now: number = Date.now(),
): { label: DayGroup; items: SessionItem[] }[] {
  const out: { label: DayGroup; items: SessionItem[] }[] = [];
  for (const item of items) {
    const label = dayGroupOf(item.at, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(item);
    else out.push({ label, items: [item] });
  }
  return out;
}
