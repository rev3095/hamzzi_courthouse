// 내 세션 (DEC-039·056) — 마이페이지에서 남겨 둔 질문과 사건 진행의 사건을 한 목록으로. 순수 도우미(브라우저·테스트 공용).
// 질문은 가린 문장(마스킹본), 사건은 사용자가 붙인 사건 이름만 보인다. 판정·평가 항목은 없다.
import type { MatterSummary } from "@/lib/matters/model";

export type QuestionItem = {
  id: string;
  maskedText: string;
  status: string;
  createdAt: string;
  followup: boolean;
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
