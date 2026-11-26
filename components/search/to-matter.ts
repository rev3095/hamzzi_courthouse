// 보관함 → 사건 진행 노트 (DEC-075 ⓓ) 순수 규칙. 담아 둔 공개 자료 한 건이 노트 한 건(종류 '법령·판례')이 된다.
// 노트 글은 담을 때 법제처 값으로 만든 인용 표기와 사용자가 적은 메모뿐이고 AI를 부르지 않는다(byAi: false).
// 서버는 사건 자료 규칙(MatterDataZ — 연락처·등록번호·계좌 꼴 가리기, 글자 수 한도)으로 다시 검사해 저장한다 (DEC-053).
import { MATTER_LIMITS, newId, type MatterData, type MatterNote } from "@/lib/matters/model";
import type { RecentItem } from "./recent";

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** 노트 출처 주소: 이 사이트의 상세 화면 주소(공개 자료). origin이 http(s)가 아니면 출처 없이 둔다 */
const sourceUrl = (p: RecentItem, origin: string) =>
  /^https?:\/\//i.test(origin) && p.href.startsWith("/") ? `${origin}${p.href}` : null;

export function noteFromPin(
  p: RecentItem,
  origin: string,
  at = new Date().toISOString(),
): MatterNote {
  const url = sourceUrl(p, origin);
  return {
    id: newId(),
    title: cut(p.title, 100),
    body: [
      p.sub,
      p.memo && `메모: ${p.memo}`,
      "(판례·법령 보관함에서 보냄 · 원문에서 내용을 확인하세요)",
    ]
      .filter(Boolean)
      .join("\n"),
    kind: "search",
    refs: [],
    sources: url ? [{ title: cut(`${p.kind} ${p.title}`, 100), url }] : [],
    byAi: false,
    at,
  };
}

/**
 * 사건 자료에 노트를 더한다. 같은 출처 주소의 노트가 이미 있으면 다시 넣지 않고, 노트 한도를 넘기면 넘는 만큼 뺀다.
 * 돌려주는 added·skipped로 화면이 결과를 알린다
 */
export function appendShelfNotes(
  data: MatterData,
  pins: RecentItem[],
  origin: string,
): { data: MatterData; added: number; duplicate: number; overLimit: number } {
  const have = new Set(data.notes.flatMap((n) => n.sources.map((s) => s.url)));
  const fresh: MatterNote[] = [];
  let duplicate = 0;
  for (const p of pins) {
    const note = noteFromPin(p, origin);
    const url = note.sources[0]?.url;
    if (url && have.has(url)) {
      duplicate += 1;
      continue;
    }
    if (url) have.add(url);
    fresh.push(note);
  }
  const room = Math.max(0, MATTER_LIMITS.notes - data.notes.length);
  const added = fresh.slice(0, room);
  return {
    data: { ...data, notes: [...data.notes, ...added] },
    added: added.length,
    duplicate,
    overLimit: fresh.length - added.length,
  };
}
