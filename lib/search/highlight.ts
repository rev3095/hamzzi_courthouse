// 판례 검색 하이라이트 (F-003). 순수 함수 — 검색어 낱말이 나오는 자리만 표시하고 글은 바꾸지 않는다.
// 검색어는 이 기기(sessionStorage)에만 두고 주소·서버로 보내지 않는다 (F-007, SearchView).

export type HighlightPart = { text: string; hit: boolean };

const MAX_TERMS = 8;

/** 검색어를 띄어쓰기로 나눈 낱말. 한 글자 낱말·중복은 빼고 긴 낱말부터 (겹칠 때 긴 쪽을 먼저 맞춘다) */
export function highlightTerms(query: string | null | undefined): string[] {
  if (!query) return [];
  const words = query
    .normalize("NFKC")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, MAX_TERMS);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 글을 검색어 낱말과 나머지로 나눈다. 이어 붙이면 원래 글과 같다 */
export function highlightParts(text: string, terms: string[]): HighlightPart[] {
  if (!text || terms.length === 0) return [{ text, hit: false }];
  const re = new RegExp(`(${terms.map(escape).join("|")})`, "gi");
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), hit: false });
    parts.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts.length > 0 ? parts : [{ text, hit: false }];
}
