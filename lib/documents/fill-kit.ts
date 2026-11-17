// 서식 채우기 공통 도구 — 블록 만들기·날짜·금액 모양 바꾸기 (DEC-025). fill.ts와 fill-*.ts가 함께 쓴다.
export type BlockKind = "title" | "heading" | "text" | "center" | "right" | "blank";
export type Block = { kind: BlockKind; text: string };

export const title = (text: string): Block => ({ kind: "title", text });
export const heading = (text: string): Block => ({ kind: "heading", text });
export const p = (text: string): Block => ({ kind: "text", text });
export const center = (text: string): Block => ({ kind: "center", text });
export const right = (text: string): Block => ({ kind: "right", text });
export const blank: Block = { kind: "blank", text: "" };

export type V = Record<string, string>;

export const BLANK_DATE = "        년      월      일";
export const BLANK_SHORT_DATE = "      .      .      .";
export const BLANK_WON = "                ";
export const RRN = "(주민등록번호:              -              )";

/** "2026-03-01" → "2026. 3. 1." (사용자가 고른 날짜를 모양만 바꾼다) */
export function formatDate(iso: string | undefined, empty = BLANK_SHORT_DATE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : empty;
}

/** "23000000" → "23,000,000" (사용자가 적은 금액에 쉼표만 넣는다) */
export function formatWon(digits: string | undefined, empty = BLANK_WON): string {
  return digits && /^\d+$/.test(digits) ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : empty;
}

/** 사용자가 적은 여러 줄 글 → 문단 블록 (빈 줄은 건너뛴다) */
export const lines = (s: string | undefined): Block[] =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(p);

/** 번호가 이미 붙은 줄이면 떼고 다시 매긴다 */
export const numbered = (items: string[], from = 1): Block[] =>
  items.map((t, i) => p(`${from + i}. ${t.replace(/^\d+\s*[.)]\s*/, "")}`));

export const party = (role: string, nameV: string, addr: string, phone?: string, rrn = true): Block[] => [
  p(`${role}  ${nameV}${rrn ? `  ${RRN}` : ""}`),
  p(`        주소  ${addr}`),
  ...(phone === undefined ? [] : [p(`        연락 가능한 전화번호  ${phone}`)]),
];

export const picked = (v: string | undefined, labels: Record<string, string>): string[] =>
  (v ?? "")
    .split(",")
    .filter((k) => labels[k])
    .map((k) => labels[k]);

export const signDate = (v: V) => center(v.writtenOn ? formatDate(v.writtenOn) : BLANK_DATE);

