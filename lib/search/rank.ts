// 법령 목록 순서 (DEC-076) — 순수 규칙. 모델·관련도 점수를 쓰지 않는다(절대 규칙 2: 사건에 대한 관련도·유불리 판정 아님).
// 기준은 두 가지 고정 자료뿐이다.
//  ① 법령 위계: 법제처 '법령구분명'(헌법 → 법률 → 대통령령 → 총리령·부령 → 그 밖)
//  ② 자주 쓰는 법령 표 CORE_LAWS: 이 서비스 홈 카테고리(docs/research/06, 법제처 생활법령 분야)가 기대는 기본 법률을 직접 고른 고정 목록
// 국내를 먼저, 해외를 그다음에 둔다. 같은 법률의 시행령·시행규칙은 그 법률 바로 아래에 묶는다. 같은 자리끼리는 출처가 준 순서 그대로.

/** 화면에 적는 정렬 기준 한 줄 */
export const RANK_NOTE =
  "정렬: 국내 먼저 · 자주 쓰는 법령(고정 목록) · 법령 위계(법률 → 시행령 → 시행규칙) 순이에요. 순서는 정해 둔 규칙으로만 놓고 AI가 정하지 않아요.";

/**
 * 자주 쓰는 법령 (고정 목록). 순서는 뜻이 없다 — 들어 있는지만 본다.
 * 근거: 홈 카테고리 40개(lib/procedure/categories)와 법제처 생활법령정보 분야가 기본으로 드는 법률.
 */
export const CORE_LAWS: readonly string[] = [
  "대한민국헌법",
  "민법",
  "형법",
  "상법",
  "민사소송법",
  "형사소송법",
  "민사집행법",
  "가사소송법",
  "행정기본법",
  "행정소송법",
  "행정심판법",
  "국가배상법",
  "근로기준법",
  "최저임금법",
  "근로자퇴직급여 보장법",
  "고용보험법",
  "산업재해보상보험법",
  "산업안전보건법",
  "중대재해 처벌 등에 관한 법률",
  "남녀고용평등과 일ㆍ가정 양립 지원에 관한 법률",
  "주택임대차보호법",
  "상가건물 임대차보호법",
  "민간임대주택에 관한 특별법",
  "집합건물의 소유 및 관리에 관한 법률",
  "부동산등기법",
  "공인중개사법",
  "건축법",
  "가족관계의 등록 등에 관한 법률",
  "소비자기본법",
  "전자상거래 등에서의 소비자보호에 관한 법률",
  "약관의 규제에 관한 법률",
  "할부거래에 관한 법률",
  "이자제한법",
  "대부업 등의 등록 및 금융이용자 보호에 관한 법률",
  "채무자 회생 및 파산에 관한 법률",
  "개인정보 보호법",
  "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
  "도로교통법",
  "교통사고처리 특례법",
  "자동차손해배상 보장법",
  "국민건강보험법",
  "국민연금법",
  "의료법",
  "의료기기법",
  "체외진단의료기기법",
  "약사법",
  "국세기본법",
  "소득세법",
  "부가가치세법",
  "저작권법",
  "특허법",
  "상표법",
  "독점규제 및 공정거래에 관한 법률",
  "경범죄 처벌법",
  "성폭력범죄의 처벌 등에 관한 특례법",
  "가정폭력범죄의 처벌 등에 관한 특례법",
  "스토킹범죄의 처벌 등에 관한 법률",
  "아동복지법",
  "병역법",
];

const compact = (s: string) => s.normalize("NFKC").replace(/[\s·ㆍ]/g, "");
const CORE = new Set(CORE_LAWS.map(compact));

/** 법령구분명 → 위계 자리 (작을수록 위) */
export function tierOf(kind: string | null | undefined, name = ""): number {
  const k = compact(kind ?? "");
  if (k === "헌법" || /헌법$/.test(compact(name))) return 0;
  if (k === "법률") return 1;
  if (k === "대통령령") return 2;
  if (k === "총리령" || k === "부령" || /령$/.test(k)) return 3;
  if (!k) {
    // 법령구분이 없으면 이름 꼬리로 본다
    if (/시행규칙$/.test(compact(name))) return 3;
    if (/시행령$/.test(compact(name))) return 2;
    if (/(?:법|법률)$/.test(compact(name))) return 1;
  }
  return 4;
}

/** 시행령·시행규칙을 그 법률 이름으로 묶는다 ("의료기기법 시행령" → "의료기기법") */
export const baseLawName = (name: string): string =>
  name
    .normalize("NFKC")
    .replace(/\s*시행(?:령|규칙)\s*$/, "")
    .trim();

export const isCoreLaw = (name: string): boolean => CORE.has(compact(baseLawName(name)));

/**
 * 국내 법령 순서: 자주 쓰는 법령 묶음 → 나머지 묶음(출처 순서), 묶음 안에서는 위계 순.
 * 같은 묶음·같은 위계면 출처가 준 순서를 그대로 둔다 (안정 정렬).
 */
export function rankDomestic<T>(
  items: readonly T[],
  pick: (item: T) => { name: string; kind?: string | null },
): T[] {
  const firstAt = new Map<string, number>();
  items.forEach((it, i) => {
    const base = compact(baseLawName(pick(it).name));
    if (!firstAt.has(base)) firstAt.set(base, i);
  });
  return items
    .map((it, i) => {
      const { name, kind } = pick(it);
      const base = compact(baseLawName(name));
      return {
        it,
        core: CORE.has(base) ? 0 : 1,
        group: firstAt.get(base)!,
        tier: tierOf(kind, name),
        i,
      };
    })
    .sort((a, b) => a.core - b.core || a.group - b.group || a.tier - b.tier || a.i - b.i)
    .map((x) => x.it);
}

/**
 * 국내·해외가 섞인 목록: 국내(rankDomestic) 먼저, 해외는 직접 고른 핵심 법령 → 나라 순서 → 출처 순서.
 * countryOrder에 없는 나라는 맨 뒤.
 */
export function rankWorld<T>(
  items: readonly T[],
  pick: (item: T) => {
    name: string;
    kind?: string | null;
    country: string;
    curated?: boolean;
  },
  countryOrder: readonly string[],
): T[] {
  const domestic = rankDomestic(
    items.filter((it) => pick(it).country === "kr"),
    pick,
  );
  const at = (c: string) => {
    const n = countryOrder.indexOf(c);
    return n < 0 ? countryOrder.length : n;
  };
  const foreign = items
    .map((it, i) => ({ it, i, p: pick(it) }))
    .filter((x) => x.p.country !== "kr")
    .sort(
      (a, b) =>
        (a.p.curated ? 0 : 1) - (b.p.curated ? 0 : 1) ||
        at(a.p.country) - at(b.p.country) ||
        a.i - b.i,
    )
    .map((x) => x.it);
  return [...domestic, ...foreign];
}
