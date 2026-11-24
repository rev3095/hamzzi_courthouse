// 가상 사건 예시(DEC-061) 생성물 거르기 규칙 — 생성 스크립트와 presets.test.ts가 같은 상수를 쓴다.
// 사건 진행 화면은 유불리를 말하지 않는다(DEC-053). legal-reviewer 세 차례 검토(2026-11-25)에서 나온 꼴을 묶었다.

/** 유불리·가능성 판단, 전략 평가, 다른 쟁점을 가리키는 문장 */
export const LEANING =
  /유리|불리하게|가능성이 (크|큽|커|높)|여지가 (크|큽|커|넓)|볼 여지가 있|힘을 얻|힘이 실|설득력|인정되기 쉽|(약해|어려워|무거워)(지|집|질|져)|기는 어렵|어려워 보|자체가 효력이 없|의심할 만한|바탕이 됩|사정이 다릅|쪽이 (안전|현실적)|보시는 것이 맞|보시면 됩니다|어려울 수 있습니다|쟁점\s?\d|\d번 쟁점|첫 쟁점|앞의 \S+ 쟁점|\S+ 쟁점(의|과|에서) (결론|판단)/;

/** 앞 문장에 기대는 말 — 앞 문장을 지웠거나 문단 첫머리면 이 문장도 지운다 */
export const CONNECTIVE =
  /^(그러면|반대로|그래서|따라서|그러므로|그렇다면|이 경우|어느 경우든|둘째|그 주장)/;

/** 문장은 마침표·물음표·느낌표 뒤에서만 나눈다 ("~다 다만"처럼 문장 중간을 자르지 않게) */
export function dropLeaning(text: string): string {
  const out: string[] = [];
  let dropped = true; // 문단 첫 문장도 접속어로 시작하면 지운다
  for (const s of text.split(/(?<=[.?!])\s+/)) {
    if (LEANING.test(s) || (dropped && CONNECTIVE.test(s))) {
      dropped = true;
      continue;
    }
    dropped = false;
    out.push(s);
  }
  return out.join(" ").trim();
}
