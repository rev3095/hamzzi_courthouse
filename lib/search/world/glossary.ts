// 국내·해외 법령 통합 검색 (DEC-074) — 의료기기 분야 용어 대응표. 순수 규칙이고 모델·외부 번역 서비스를 쓰지 않는다.
// 한국어 검색어에서 아는 낱말만 영어·일본어로 바꿔 해외 공식 검색에 보낸다. 모르는 낱말(조사 포함)은 버린다.
// 화면은 바꾼 말을 "이렇게 찾았어요"로 그대로 보여 준다 — 무엇을 보냈는지 숨기지 않는다.

export type Term = { ko: string; en: string; ja: string };

/** 분야 전체를 가리키는 낱말. 이것만 있으면 '의료기기 전반' 검색으로 본다 (catalog 전체) */
export const GENERAL_TERM: Term = { ko: "의료기기", en: "medical device", ja: "医療機器" };

export const TERMS: readonly Term[] = [
  GENERAL_TERM,
  { ko: "체외진단의료기기", en: "in vitro diagnostic device", ja: "体外診断用医薬品" },
  { ko: "체외진단", en: "in vitro diagnostic", ja: "体外診断" },
  { ko: "디지털의료제품", en: "digital health software", ja: "プログラム医療機器" },
  { ko: "디지털의료기기", en: "software medical device", ja: "プログラム医療機器" },
  { ko: "소프트웨어", en: "software", ja: "プログラム" },
  { ko: "인공지능", en: "artificial intelligence", ja: "人工知能" },
  { ko: "사이버보안", en: "cybersecurity", ja: "サイバーセキュリティ" },
  { ko: "품목허가", en: "premarket approval", ja: "製造販売承認" },
  { ko: "허가", en: "approval", ja: "承認" },
  { ko: "인증", en: "certification", ja: "認証" },
  { ko: "신고", en: "notification", ja: "届出" },
  { ko: "등록", en: "registration", ja: "登録" },
  { ko: "심사", en: "review", ja: "審査" },
  { ko: "품질관리", en: "quality management system", ja: "品質管理" },
  { ko: "품질", en: "quality", ja: "品質" },
  { ko: "임상시험", en: "clinical investigation", ja: "治験" },
  { ko: "임상", en: "clinical", ja: "臨床" },
  { ko: "리콜", en: "recall", ja: "回収" },
  { ko: "회수", en: "recall", ja: "回収" },
  { ko: "폐기", en: "disposal", ja: "廃棄" },
  { ko: "부작용", en: "adverse event", ja: "副作用" },
  { ko: "이상사례", en: "adverse event", ja: "不具合" },
  { ko: "라벨", en: "labeling", ja: "表示" },
  { ko: "표시", en: "labeling", ja: "表示" },
  { ko: "첨부문서", en: "instructions for use", ja: "添付文書" },
  { ko: "광고", en: "advertising", ja: "広告" },
  { ko: "수입", en: "import", ja: "輸入" },
  { ko: "수출", en: "export", ja: "輸出" },
  { ko: "제조", en: "manufacturing", ja: "製造" },
  { ko: "판매", en: "distribution", ja: "販売" },
  { ko: "등급", en: "classification", ja: "クラス分類" },
  { ko: "분류", en: "classification", ja: "分類" },
  { ko: "추적관리", en: "tracking", ja: "追跡" },
  { ko: "고유식별", en: "unique device identification", ja: "識別" },
  { ko: "시판 후 조사", en: "postmarket surveillance", ja: "製造販売後調査" },
  { ko: "시판후조사", en: "postmarket surveillance", ja: "製造販売後調査" },
  { ko: "시판 후", en: "postmarket", ja: "製造販売後" },
  { ko: "안전성", en: "safety", ja: "安全性" },
  { ko: "유효성", en: "effectiveness", ja: "有効性" },
  { ko: "혁신의료기기", en: "breakthrough device", ja: "革新的医療機器" },
  { ko: "의약품", en: "drug", ja: "医薬品" },
  { ko: "재생의료", en: "regenerative medicine", ja: "再生医療" },
  { ko: "수수료", en: "fees", ja: "手数料" },
  { ko: "행정처분", en: "enforcement", ja: "行政処分" },
];

const HANGUL = /[가-힣ㄱ-ㆎ]/;
const KANA_HAN = /[぀-ヿ一-鿿]/;

/** 긴 낱말부터 맞춘다 ("체외진단의료기기"가 "의료기기"보다 먼저) */
const BY_LENGTH = [...TERMS].sort((a, b) => b.ko.length - a.ko.length);

export type QueryTerms = {
  /** 검색어에서 찾은 한국어 낱말 (나온 순서) */
  ko: string[];
  en: string[];
  ja: string[];
};

const uniq = (list: string[]) => [...new Set(list.filter(Boolean))];

/** 검색어에서 아는 낱말을 나온 순서대로 뽑는다. 한글이 없는 검색어는 그 말 그대로 쓴다 */
export function queryTerms(query: string): QueryTerms {
  const q = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!q) return { ko: [], en: [], ja: [] };
  if (!HANGUL.test(q)) {
    // 일본어·한자면 일본어 검색어로, 그 밖(영문·숫자)은 영어 검색어로 그대로
    return KANA_HAN.test(q) ? { ko: [], en: [], ja: [q] } : { ko: [], en: [q], ja: [] };
  }
  const found: { at: number; term?: Term; raw?: string }[] = [];
  let rest = q;
  for (const term of BY_LENGTH) {
    let at = rest.indexOf(term.ko);
    while (at >= 0) {
      found.push({ at, term });
      // 같은 자리를 짧은 낱말이 다시 잡지 않게 같은 길이의 빈칸으로 지운다
      rest = rest.slice(0, at) + " ".repeat(term.ko.length) + rest.slice(at + term.ko.length);
      at = rest.indexOf(term.ko);
    }
  }
  // 섞여 있는 영문·숫자 낱말(예: MDR, UDI)은 그대로 넘긴다. 남은 한글(조사·모르는 낱말)은 버린다
  for (const m of rest.matchAll(/[A-Za-z][A-Za-z0-9()-]*/g)) {
    found.push({ at: m.index, raw: m[0] });
  }
  found.sort((a, b) => a.at - b.at);
  return {
    ko: uniq(found.map((f) => f.term?.ko ?? "")),
    en: uniq(found.map((f) => f.term?.en ?? f.raw ?? "")),
    ja: uniq(found.map((f) => f.term?.ja ?? f.raw ?? "")),
  };
}

/** 해외 검색에 보낼 말. 바꾸지 못한 언어는 undefined */
export function translateQuery(query: string): { en?: string; ja?: string } {
  const t = queryTerms(query);
  const out: { en?: string; ja?: string } = {};
  if (t.en.length > 0) out.en = t.en.join(" ");
  // 영문 낱말만 남은 일본어 검색어는 보내지 않는다 (일본 법령 이름 검색에 맞지 않는다)
  if (t.ja.some((w) => KANA_HAN.test(w))) out.ja = t.ja.join(" ");
  return out;
}
