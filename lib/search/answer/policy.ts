// 검색 '물어보기' AI 답 (DEC-076) — 순수 규칙: 저장 키, 모델 출력 거르기, 찾은 자료 정리, 덧붙이기.
// 모델 문장은 원문 없이 쓰는 글이라 법령 쉬운 설명보다 엄하게 거른다(bareLineDrop): 숫자·조문 번호·법원 이름·판례 낱말·
// 유불리·단정 표현·개인정보 꼴이 든 줄은 버린다(절대 규칙 2·3·4). 근거 조문은 따로 받은 칸만 쓰고, 법제처에서 실존을
// 확인한 것만 화면에 근거로 붙인다(DEC-071). 찾은 법령·판례·건수는 검색 결과를 코드가 센 것이다.
import { bareLineDrop } from "@/lib/search/easy/policy";
import { scanInput } from "@/lib/pii";
import { baseLawName, isCoreLaw, rankDomestic, rankWorld } from "@/lib/search/rank";
import { COUNTRY_CODES } from "@/lib/search/world/types";
import {
  ANSWER_LIMITS as L,
  type AnswerCase,
  type AnswerCondition,
  type AnswerFocus,
  type AnswerLaw,
  type AnswerMode,
  type AnswerVirtualCase,
  type SearchAnswer,
} from "./types";

export * from "./types";

/** 검색어 한 개의 글자 수 상한 (검색 API와 같다) */
export const ANSWER_QUERY_MAX = 100;

/** 같은 검색어로 보는 꼴: NFKC · 공백 하나 · 소문자 */
export const normalizeQuery = (q: string): string =>
  q.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** 저장 키 (kind 칸이 검색·리서치를 나눈다) */
export const answerKey = (focus: AnswerFocus, q: string): string => `${focus}:${normalizeQuery(q)}`;

/**
 * 저장·재사용해도 되는 검색어인지 (DEC-076). 개인정보로 보이는 꼴(이름·연락처·주소·등록번호 등)이 하나라도 있으면
 * 저장하지도, 저장된 답을 찾지도 않는다 — 그런 검색어는 검색 API가 먼저 막지만 한 번 더 본다.
 */
export function storableQuery(q: string): boolean {
  const n = normalizeQuery(q);
  if (!n || n.length > ANSWER_QUERY_MAX) return false;
  if (scanInput(n).findings.length > 0) return false;
  return !looksLikeBareName(n);
}

/** 흔한 성씨 (첫 글자) */
const SURNAME =
  "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부";
/** 법률 낱말에 흔한 끝 글자 — 이 글자로 끝나는 세 글자 낱말은 이름으로 보지 않는다 (임대차·유류분·위자료·공무원 등) */
const NOUN_END =
  "차금분장세율료권법죄인자물비서제안원액약사업가용해직상속험도증송청정산급모회단령칙표판건택역률소";

/**
 * 맨 이름 + 낱말 꼴("홍길동 횡령")인지 — 이름 감지(scanInput)는 호칭·조사가 있어야 잡으므로, 저장할 때만 한 번 더 보수적으로 본다.
 * 낱말이 둘 이상이고, 그중 하나가 '성씨로 시작하는 세 글자 한글'이며 법률 낱말 끝 글자로 끝나지 않으면 이름일 수 있다고 본다.
 * 잘못 걸려도 그 검색어를 저장·재사용하지 않을 뿐이다 (답은 그대로 만든다).
 */
export function looksLikeBareName(n: string): boolean {
  const words = n.split(" ").filter(Boolean);
  if (words.length < 2) return false;
  return words.some(
    (w) => /^[가-힣]{3}$/.test(w) && SURNAME.includes(w[0]) && !NOUN_END.includes(w[w.length - 1]),
  );
}

// ── 검색어 해석 (Haiku 1단계) ────────────────────────────────────

export type Interpretation = {
  offTopic: boolean;
  field: string;
  intent: string;
  /** 법제처 이름·판례 검색에 더할 한국어 낱말 */
  koTerms: string[];
  /** 관련 있어 보이는 국내 법령 이름 (법제처에서 찾아 있는 것만 쓴다) */
  lawNames: string[];
  en: string[];
  ja: string[];
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const uniq = (xs: string[]) => [...new Set(xs)];
const compact = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

const KO_TERM = /^[가-힣][가-힣\s·ㆍ]{0,19}$/;
const LAW_NAME = /^[가-힣][가-힣\s·ㆍ()]{1,58}(?:법|법률|령|규칙|규정)$/;
const EN_TERM = /^[A-Za-z][A-Za-z\s-]{1,39}$/;
const JA_TERM = /^[぀-ヿ一-鿿ー]{1,20}$/;
const clean = (v: unknown, re: RegExp, max: number): string[] =>
  uniq(
    list(v)
      .map((x) => str(x).normalize("NFKC").replace(/\s+/g, " "))
      .filter((x) => re.test(x) && scanInput(x).findings.length === 0),
  ).slice(0, max);

/** 해석 결과 거르기. 글자·꼴이 맞지 않는 낱말은 버린다 (검색에 보내는 말이라 개인정보 꼴도 본다) */
export function screenInterpretation(raw: unknown, query: string): Interpretation {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const field = str(r.field);
  const intent = str(r.intent);
  const koTerms = clean(r.koTerms, KO_TERM, 4).filter((t) => compact(t) !== compact(query));
  return {
    offTopic: r.offTopic === true,
    field: field && !bareLineDrop(field, L.field) ? field : "",
    intent: intent && !bareLineDrop(intent, L.intent) ? intent : "",
    koTerms,
    lawNames: clean(r.lawNames, LAW_NAME, 5),
    en: clean(r.en, EN_TERM, 3),
    ja: clean(r.ja, JA_TERM, 3),
  };
}

// ── 답 쓰기 (Haiku 2단계) ────────────────────────────────────────

export type Written = Pick<
  SearchAnswer,
  "summary" | "usage" | "conditions" | "issues" | "nextQueries" | "virtualCases"
>;

const ARTICLE_NO = /^제\d{1,4}조(?:의\d{1,3})?$/;

/**
 * 답 문장 거르기. 한 줄이라도 규칙에 걸리면 그 항목을 뺀다. 성립 조건의 근거(lawName·articleNo)는 꼴만 보고
 * 남기고, 실존 확인은 라우트가 법제처에서 한다(applyChecks). allowVirtual이 false면 가상 사례를 모두 뺀다.
 */
export function screenWritten(
  raw: unknown,
  opts: { allowVirtual: boolean; mode: AnswerMode },
): { written: Written; dropped: number } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  let dropped = 0;
  const lines = (v: unknown, max: number, chars: number): string[] => {
    const out: string[] = [];
    for (const item of list(v)) {
      const t = str(item);
      if (!t || bareLineDrop(t, chars) || out.length >= max) {
        if (t) dropped += 1;
        continue;
      }
      if (!out.includes(t)) out.push(t);
    }
    return out;
  };

  const conditions: AnswerCondition[] = [];
  for (const item of list(r.conditions)) {
    const c = (item ?? {}) as Record<string, unknown>;
    const text = str(c.text);
    if (!text || bareLineDrop(text, L.conditions.chars) || conditions.length >= L.conditions.max) {
      if (text) dropped += 1;
      continue;
    }
    const lawName = str(c.lawName).normalize("NFKC").replace(/\s+/g, " ");
    const articleNo = compact(str(c.articleNo));
    const cite =
      LAW_NAME.test(lawName) && ARTICLE_NO.test(articleNo) ? { lawName, articleNo } : null;
    conditions.push({ text, cite, confirmed: null });
  }

  const nextQueries = lines(r.nextQueries, L.nextQueries.max, L.nextQueries.chars).filter((q) =>
    KO_TERM.test(q.replace(/[A-Za-z0-9]/g, "")),
  );

  const virtualCases: AnswerVirtualCase[] = [];
  if (opts.allowVirtual) {
    for (const item of list(r.virtualCases)) {
      const v = (item ?? {}) as Record<string, unknown>;
      const title = str(v.title);
      const situation = str(v.situation);
      const point = str(v.point);
      const bad =
        !title ||
        !situation ||
        !point ||
        bareLineDrop(title, L.virtual.title, true) ||
        bareLineDrop(situation, L.virtual.chars, true) ||
        bareLineDrop(point, L.virtual.chars, true);
      if (bad || virtualCases.length >= L.virtual.max) {
        dropped += 1;
        continue;
      }
      virtualCases.push({ title, situation, point });
    }
  }

  return {
    written: {
      summary: lines(r.summary, L.summary.max, L.summary.chars),
      usage: lines(r.usage, L.usage.max, L.usage.chars),
      conditions,
      issues: opts.mode === "research" ? lines(r.issues, L.issues.max, L.issues.chars) : [],
      nextQueries,
      virtualCases,
    },
    dropped,
  };
}

/** 성립 조건 근거 → 법제처 재조회 인용 문자열 */
export const citeText = (c: { lawName: string; articleNo: string }) =>
  `${c.lawName} ${c.articleNo}`;

/**
 * 실존 확인 결과를 붙인다 (DEC-071과 같은 규칙): 없다고 확인된 조문을 댄 조건은 빼고, 있다고 확인된 것만
 * confirmed(조문 화면 주소)를 단다. 확인하지 못한 근거는 화면에 근거로 보이지 않게 cite를 지운다.
 */
export function applyChecks(
  conditions: AnswerCondition[],
  checks: { citation: string; exists: boolean | null }[],
  statuteHref: (lawName: string, articleNo: string) => string,
): AnswerCondition[] {
  const byCite = new Map(checks.map((c) => [c.citation.trim(), c.exists]));
  const out: AnswerCondition[] = [];
  for (const c of conditions) {
    if (!c.cite) {
      out.push(c);
      continue;
    }
    const exists = byCite.get(citeText(c.cite));
    if (exists === false) continue;
    out.push(
      exists === true
        ? {
            ...c,
            confirmed: {
              label: citeText(c.cite),
              href: statuteHref(c.cite.lawName, c.cite.articleNo),
            },
          }
        : { ...c, cite: null, confirmed: null },
    );
  }
  return out;
}

/** 화면에 낼 만큼 남았는지: 요약 한 줄 이상 */
export const writtenUsable = (w: Written): boolean => w.summary.length > 0;

// ── 찾은 자료 정리 ───────────────────────────────────────────────

/** 국내·해외 법령을 한 목록으로 고르고 순서를 정한다 (lib/search/rank.ts 고정 규칙) */
export function arrangeLaws(laws: AnswerLaw[]): { domestic: AnswerLaw[]; foreign: AnswerLaw[] } {
  const seen = new Set<string>();
  const unique = laws.filter((l) => {
    const k = `${l.country}:${compact(l.name)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const ranked = rankWorld(
    unique.map((l) => (l.country === "kr" ? { ...l, core: isCoreLaw(l.name) } : l)),
    (l) => ({ name: l.name, kind: l.kind, country: l.country, curated: l.core }),
    COUNTRY_CODES,
  );
  return {
    domestic: ranked.filter((l) => l.country === "kr").slice(0, L.domesticLaws),
    foreign: ranked.filter((l) => l.country !== "kr").slice(0, L.foreignLaws),
  };
}

/** 국내 법령만 위계로 묶어 구조도 칸으로 쓴다: 법률 → (그 법률의) 시행령·시행규칙 */
export function lawTree(domestic: AnswerLaw[]): { law: AnswerLaw; lower: AnswerLaw[] }[] {
  const ranked = rankDomestic(domestic, (l) => l);
  const groups = new Map<string, { law: AnswerLaw | null; lower: AnswerLaw[] }>();
  for (const l of ranked) {
    const base = compact(baseLawName(l.name));
    const g = groups.get(base) ?? { law: null, lower: [] };
    if (!g.law && compact(l.name) === base) g.law = l;
    else g.lower.push(l);
    groups.set(base, g);
  }
  return [...groups.values()].map((g) => ({
    law: g.law ?? g.lower[0],
    lower: g.law ? g.lower : g.lower.slice(1),
  }));
}

/** 법원별 건수 (리서치 브리프, 코드가 센다) */
export function courtCounts(cases: AnswerCase[]): { court: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of cases) m.set(c.court || "법원 미상", (m.get(c.court || "법원 미상") ?? 0) + 1);
  return [...m.entries()].map(([court, count]) => ({ court, count }));
}

// ── 저장한 답에 덧붙이기 ─────────────────────────────────────────

const unionBy = <T>(fresh: T[], old: T[], key: (x: T) => string, max: number): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of [...fresh, ...old]) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out.slice(0, max);
};

/**
 * 같은 검색어로 다시 만든 답을 저장된 답에 덧붙인다 (DEC-076 "더해지면 강화"): 문장 칸은 새로 쓴 것이 있으면 바꾸고
 * 비었으면 앞의 것을 둔다. 법령·판례 목록은 새 것 먼저 합친다(중복 제외). 처음 만든 시각은 그대로 둔다.
 */
export function mergeAnswer(old: SearchAnswer | null, fresh: SearchAnswer): SearchAnswer {
  if (!old) return fresh;
  const pick = <T>(a: T[], b: T[]) => (a.length > 0 ? a : b);
  const laws = arrangeLaws([
    ...fresh.laws.domestic,
    ...old.laws.domestic,
    ...fresh.laws.foreign,
    ...old.laws.foreign,
  ]);
  const max = L.cases[fresh.mode];
  const cases = unionBy(fresh.cases, old.cases, (c) => c.id, max);
  return {
    ...fresh,
    field: fresh.field || old.field,
    intent: fresh.intent || old.intent,
    summary: pick(fresh.summary, old.summary),
    usage: pick(fresh.usage, old.usage),
    conditions: pick(fresh.conditions, old.conditions),
    issues: pick(fresh.issues, old.issues),
    nextQueries: pick(fresh.nextQueries, old.nextQueries),
    laws,
    cases,
    casesTotal: fresh.casesTotal ?? old.casesTotal,
    // 실제 판례가 생기면 가상 사례는 내린다
    virtualCases: cases.length > 0 ? [] : pick(fresh.virtualCases, old.virtualCases),
    searched: {
      ko: uniq([...fresh.searched.ko, ...old.searched.ko]).slice(0, 6),
      en: uniq([...fresh.searched.en, ...old.searched.en]).slice(0, 4),
      ja: uniq([...fresh.searched.ja, ...old.searched.ja]).slice(0, 4),
    },
    createdAt: old.createdAt,
  };
}

/** 저장한 답을 다시 읽을 때 꼴을 확인한다 (형식이 다르면 없는 것으로 본다) */
export function readStoredAnswer(v: unknown): SearchAnswer | null {
  const a = (v && typeof v === "object" ? v : null) as SearchAnswer | null;
  if (!a) return null;
  const ok =
    (a.mode === "search" || a.mode === "research") &&
    (a.focus === "cases" || a.focus === "laws") &&
    typeof a.query === "string" &&
    Array.isArray(a.summary) &&
    a.summary.length > 0 &&
    Array.isArray(a.usage) &&
    Array.isArray(a.conditions) &&
    Array.isArray(a.issues) &&
    Array.isArray(a.nextQueries) &&
    Array.isArray(a.cases) &&
    Array.isArray(a.virtualCases) &&
    !!a.laws &&
    Array.isArray(a.laws.domestic) &&
    Array.isArray(a.laws.foreign) &&
    !!a.searched &&
    typeof a.createdAt === "string";
  return ok ? a : null;
}

/** 저장해 둔 답의 목록(법령·판례)을 새로 찾아 덧붙일 때가 됐는지 — 모델은 다시 부르지 않는다 */
export const LIST_REFRESH_MS = 3 * 24 * 60 * 60 * 1000;
export const listsStale = (a: SearchAnswer, now: Date): boolean =>
  now.getTime() - Date.parse(a.updatedAt) > LIST_REFRESH_MS;
