// 본문 속 조문·사건번호 패턴 (F-005). lib/ai의 1차 거르기와 lib/citations의 재조회가 같은 패턴을 쓴다.
// 추출이 넓을수록 안전하다: 잘못 잡힌 번호는 근거 대조·재조회에서 걸려 문단이 빠지는 쪽으로만 틀린다.

/** 사건부호 (법원 사건별 부호). 재심(재다·재나 등)·경매(타경)·신청(카기 등) 포함 */
const CASE_CODES = [
  "재가합",
  "재가단",
  "재고합",
  "재고단",
  "재구합",
  "재다",
  "재나",
  "재두",
  "재누",
  "재도",
  "재노",
  "재마",
  "재스",
  "재므",
  "재르",
  "가합",
  "가단",
  "가소",
  "가",
  "나",
  "다",
  "라",
  "마",
  "그",
  "머",
  "드",
  "르",
  "므",
  "브",
  "스",
  "느",
  "즈",
  "카합",
  "카단",
  "카기",
  "카담",
  "카명",
  "카불",
  "카",
  "타경",
  "타기",
  "타채",
  "타인",
  "타",
  "고합",
  "고단",
  "고정",
  "고약",
  "노",
  "도",
  "로",
  "모",
  "보",
  "오",
  "초",
  "추",
  "감고",
  "감노",
  "감도",
  "구합",
  "구단",
  "누",
  "두",
  "무",
  "부",
  "아",
  "트",
  "허",
  "후",
  "코",
  "하",
  "히",
  "헌가",
  "헌나",
  "헌다",
  "헌라",
  "헌마",
  "헌바",
  "헌사",
  "헌아",
];
const CASE_CODE = `(?:${CASE_CODES.join("|")})`;

/** 사건번호: (19|20)YY 또는 YY + 사건부호 + 일련번호. 앞뒤가 숫자에 붙은 경우는 뺀다 */
export const CASE_NO = new RegExp(`(?<!\\d)(?:19|20)?\\d{2}\\s*${CASE_CODE}\\s*\\d+(?!\\d)`, "g");

/** 병합 사건의 뒤 번호 ("2020다12345, 12346"). 뒤에 한글이 오면 다음 사건번호(2021타경…)나 금액·기간이다 */
const MERGED_SERIAL = /^\s*,\s*(\d{3,})(?!\d|\s*[가-힣%])/;

/** 조문: "제3조의2", "3조의2"(제 생략) */
export const ARTICLE_NO = /(?:(제)\s*|(?<![\d가-힣]))(\d+)\s*조(?:\s*의\s*(\d+))?/g;
/** "제"가 없을 때 조문이 아닌 낱말 ("1조 원", "3조각", "조치·조정·조사·조합·조건") */
const NOT_ARTICLE_AFTER = /^(\s*원|[각직정사합건치])/;

const compact = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

/** 조문 표기를 "제N조" / "제N조의M"으로 맞춘다 */
export function articleLabelOf(m: RegExpMatchArray): string {
  return `제${m[2]}조${m[3] ? `의${m[3]}` : ""}`;
}

/** 본문 속 사건번호 (병합 사건 뒤 번호 포함), 공백 없앤 꼴 */
export function caseNumbersIn(text: string): string[] {
  const t = text.normalize("NFKC");
  const out: string[] = [];
  for (const m of t.matchAll(CASE_NO)) {
    const no = compact(m[0]);
    out.push(no);
    const prefix = no.replace(/\d+$/, "");
    let rest = t.slice((m.index ?? 0) + m[0].length);
    let merged = rest.match(MERGED_SERIAL);
    while (merged) {
      out.push(`${prefix}${merged[1]}`);
      rest = rest.slice(merged[0].length);
      merged = rest.match(MERGED_SERIAL);
    }
  }
  return out;
}

/** 본문 속 조문 위치·길이·표기 ("제N조[의M]") */
export function articlesIn(text: string): { label: string; index: number; length: number }[] {
  const t = text.normalize("NFKC");
  return [...t.matchAll(ARTICLE_NO)]
    .filter((m) => m[1] || !NOT_ARTICLE_AFTER.test(t.slice((m.index ?? 0) + m[0].length)))
    .map((m) => ({ label: articleLabelOf(m), index: m.index ?? 0, length: m[0].length }));
}

/** 조문·사건번호 자리를 공백으로 바꾼다 (숫자 규칙에서 식별자 속 숫자를 빼려고) */
export function stripCitations(text: string): string {
  let t = text.normalize("NFKC").replace(CASE_NO, " ");
  for (const a of articlesIn(t).reverse()) {
    t = `${t.slice(0, a.index)} ${t.slice(a.index + a.length)}`;
  }
  return t;
}
