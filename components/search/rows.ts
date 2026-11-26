// 판례 아카이브 공통 (DEC-054): 검색(/search)과 리서치(/research)가 같은 자료 행·인용 표기·보관함 키를 쓴다.
// 법제처가 준 값을 이어 붙이기만 한다 — 관련도 점수·유불리 판단을 만들지 않는다 (PRD 8.3, 절대 규칙 2).
import type { DecisionDomain } from "@/lib/client/api";
import { DECISION_TABS } from "@/lib/search/explore";
import { addPin, removePin, type RecentItem } from "./recent";

export type Kind = "cases" | "laws" | DecisionDomain | "ordinances" | "admin_rules";

export const KIND_LIST: { kind: Kind; label: string }[] = [
  { kind: "cases", label: "판례" },
  { kind: "laws", label: "법령" },
  ...DECISION_TABS.map((d) => ({ kind: d.domain as Kind, label: d.label })),
  { kind: "ordinances", label: "자치법규" },
  { kind: "admin_rules", label: "행정규칙" },
];
export const LABEL = Object.fromEntries(KIND_LIST.map((k) => [k.kind, k.label])) as Record<
  Kind,
  string
>;
export const isKind = (v: string | null): v is Kind => !!v && Object.hasOwn(LABEL, v);

export type Row = {
  kind: Kind;
  id: string;
  /** 상세 화면 주소. 행정규칙은 상세 화면이 없다 */
  href: string | null;
  title: string;
  /** 법원·기관·지자체 */
  org: string | null;
  date: string | null;
  refNo: string | null;
  sourceUrl: string | null;
  /** 판례만: 법제처 사건종류명(없으면 사건번호 부호로 읽은 종류). 거르기 검색에서만 온다 */
  caseType?: string | null;
};

export const DATE_WORD = {
  cases: "선고",
  laws: "시행",
  ordinances: "시행",
  admin_rules: "시행",
  ...Object.fromEntries(DECISION_TABS.map((d) => [d.domain, d.dateLabel])),
} as Record<Kind, string>;

/** 인용 표기: 법제처가 준 기관·날짜·번호를 이어 붙이기만 한다 (예: 대법원 2021. 3. 11. 선고 2020다12345) */
export function citationLine(r: Pick<Row, "kind" | "title" | "org" | "date" | "refNo">): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date ?? "");
  const date = m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}. ${DATE_WORD[r.kind]}` : null;
  // 법령·자치법규·행정규칙은 사건번호가 없다 — 이름과 기관·시행일만 적는다
  if (r.kind === "laws" || r.kind === "ordinances" || r.kind === "admin_rules") {
    const tail = [r.org, date].filter(Boolean).join(" ");
    return tail ? `${r.title} (${tail})` : r.title;
  }
  const head = [r.org, date, r.refNo].filter(Boolean).join(" ");
  return head ? `${head} (${r.title})` : r.title;
}

/** 보관함 키: 상세 화면 주소(검색 표시 제외). 상세 화면이 없으면 리서치 화면으로 돌아온다 */
export const pinKey = (r: Row) =>
  r.href ? r.href.replace(/\?from=search$/, "") : `/research#${r.kind}-${r.id}`;

/** 보관함은 제목·주소·인용 표기만 이 브라우저(localStorage hz:pins)에 둔다. 검색어는 담지 않는다 */
export const canPin = (r: Row) => Boolean(r.href ?? r.sourceUrl);
export const isPinned = (pins: RecentItem[], r: Row) => pins.some((p) => p.href === pinKey(r));
export function togglePin(pins: RecentItem[], r: Row) {
  if (isPinned(pins, r)) removePin(pinKey(r));
  else addPin({ href: pinKey(r), title: r.title, sub: citationLine(r), kind: LABEL[r.kind] });
}
