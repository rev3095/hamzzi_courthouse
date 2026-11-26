import "server-only";
// 국내·해외 법령 통합 검색 (DEC-074) — 각국 정부의 공식 공개 API를 그 요청에서 조회한다. 모델을 쓰지 않는다.
// 가져온 자료는 저장하지 않고(DEC-009와 같은 원칙), 웹 화면(HTML)을 긁지 않는다 — 공개 API의 JSON·Atom만 읽는다.
// 요청에는 일반적인 클라이언트 이름만 싣는다(프로젝트·사용자 이름 금지). 로그에 검색어를 남기지 않는다.
// 출처 하나가 실패해도 전체를 막지 않고 그 나라만 failed로 알린다. 관련도 점수 없이 고정 규칙(lib/search/rank.ts, DEC-076)으로 놓는다.
// 검색 '물어보기'(DEC-076)는 Haiku 해석이 고른 낱말을 deps.extra로 더해 부른다 — 이 모듈 자체는 모델을 부르지 않는다.
import { createLawSource } from "@/lib/search/law-source";
import { stripHtml } from "@/lib/search/normalize";
import type { LawHit } from "@/lib/search/types";
import { rankWorld } from "@/lib/search/rank";
import { catalogSearch } from "./catalog";
import { queryTerms, translateQuery, type QueryTerms } from "./glossary";
import {
  COUNTRY_CODES,
  type CountryCode,
  type WorldCase,
  type WorldLawHit,
  type WorldSearchResult,
} from "./types";

export const WORLD_TIMEOUT_MS = 6_000;
export const WORLD_USER_AGENT = "legal-info-client/1.0";
/** 나라마다 보이는 줄 수 상한 (고정 목록 포함) */
export const PER_COUNTRY_LIMIT = 10;
const PER_SOURCE = 8;

export type WorldDeps = {
  fetch?: typeof fetch;
  /** 법제처 법령 이름 검색. 테스트에서 가짜로 바꾼다 */
  koreanSearch?: (query: string) => Promise<LawHit[]>;
  timeoutMs?: number;
  /** 검색어 해석(Haiku, DEC-076)이 고른 낱말. 국내 이름 검색(ko)과 해외 검색(en·ja)에 더한다 */
  extra?: { ko?: string[]; en?: string[]; ja?: string[] };
};

type Ctx = { fetch: typeof fetch; signal: AbortSignal };

const clip = (text: string | null | undefined, max: number): string | undefined => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};
const plain = (v: unknown) => stripHtml(v)?.replace(/\s+/g, " ").trim() ?? "";
const day = (v: unknown): string | undefined =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined;

async function get(url: string, ctx: Ctx, accept: string): Promise<Response> {
  const res = await ctx.fetch(url, {
    signal: ctx.signal,
    headers: { "User-Agent": WORLD_USER_AGENT, Accept: accept },
    cache: "no-store",
  });
  return res;
}
async function getJson(url: string, ctx: Ctx): Promise<unknown> {
  const res = await get(url, ctx, "application/json");
  if (!res.ok) throw new Error("upstream");
  return res.json();
}

/** 이름으로만 찾는 출처: 낱말을 모두 넣어 찾고, 없으면 첫 낱말만으로 한 번 더 찾는다 */
async function titleSearch<T>(terms: string[], run: (q: string) => Promise<T[]>): Promise<T[]> {
  if (terms.length === 0) return [];
  const first = await run(terms.join(" "));
  if (first.length > 0 || terms.length === 1) return first;
  return run(terms[0]);
}

// ── 대한민국: 법제처 (기존 조회 그대로)
const KR_SOURCE = "법제처 국가법령정보센터";
export const koreanHit = (l: LawHit): WorldLawHit => ({
  id: `kr:${l.name}`,
  country: "kr",
  title: l.name,
  kind: l.kind ?? "법령",
  ...(l.effectiveFrom && { date: l.effectiveFrom }),
  sourceUrl: l.sourceUrl,
  source: KR_SOURCE,
  internal: `/laws/${encodeURIComponent(l.name)}`,
});

// ── 미국: eCFR 검색 API (연방규정집 Title 21 현행본)
type EcfrRow = {
  starts_on?: string | null;
  ends_on?: string | null;
  removed?: boolean;
  reserved?: boolean;
  hierarchy?: { part?: string | null; section?: string | null };
  headings?: { part?: string | null; section?: string | null };
  full_text_excerpt?: string | null;
};
const ECFR_SOURCE = "eCFR (미국 연방규정집)";

export function ecfrHits(json: unknown): WorldLawHit[] {
  const rows = (json as { results?: EcfrRow[] })?.results;
  if (!Array.isArray(rows)) throw new Error("shape");
  const out: WorldLawHit[] = [];
  for (const r of rows) {
    // 지난 판(ends_on이 있는 줄)·삭제·예약 조문은 뺀다
    if (r.ends_on || r.removed || r.reserved) continue;
    const part = r.hierarchy?.part;
    if (!part || !/^[\w.-]+$/.test(part)) continue;
    const section = r.hierarchy?.section;
    const partTitle = plain(r.headings?.part);
    if (section && /^[\w.-]+$/.test(section)) {
      const excerpt = clip(plain(r.full_text_excerpt), 220);
      out.push({
        id: `us:21cfr-${section}`,
        country: "us",
        title: plain(r.headings?.section) || `§ ${section}`,
        kind: "연방규정 조문",
        citation: `21 CFR ${section}`,
        ...((partTitle || excerpt) && {
          snippet: [partTitle && `Part ${part} ${partTitle}`, excerpt].filter(Boolean).join(" — "),
        }),
        ...(day(r.starts_on) && { date: day(r.starts_on) }),
        sourceUrl: `https://www.ecfr.gov/current/title-21/section-${section}`,
        source: ECFR_SOURCE,
      });
    } else {
      out.push({
        id: `us:21cfr-part-${part}`,
        country: "us",
        title: partTitle || `Part ${part}`,
        kind: "연방규정",
        citation: `21 CFR Part ${part}`,
        ...(day(r.starts_on) && { date: day(r.starts_on) }),
        sourceUrl: `https://www.ecfr.gov/current/title-21/part-${part}`,
        source: ECFR_SOURCE,
      });
    }
  }
  return out;
}

export const ecfrUrl = (en: string) =>
  `https://www.ecfr.gov/api/search/v1/results?${new URLSearchParams({
    query: en,
    per_page: String(PER_SOURCE),
    "hierarchy[title]": "21",
    date: "current",
  })}`;

async function searchUs(terms: QueryTerms, ctx: Ctx): Promise<WorldLawHit[]> {
  if (terms.en.length === 0) return [];
  return ecfrHits(await getJson(ecfrUrl(terms.en.join(" ")), ctx));
}

// ── 일본: e-Gov 法令 API v2
type EgovLaw = {
  law_info?: { law_type?: string; law_id?: string; law_num?: string; promulgation_date?: string };
  revision_info?: {
    law_title?: string;
    amendment_enforcement_date?: string | null;
    repeal_status?: string;
  };
  sentences?: { text?: string }[];
};
const EGOV_SOURCE = "e-Gov 法令検索 (일본 디지털청)";
const EGOV_KIND: Record<string, string> = {
  Constitution: "헌법",
  Act: "법률",
  CabinetOrder: "정령(政令)",
  ImperialOrder: "칙령",
  MinisterialOrdinance: "성령(省令)",
  Rule: "규칙",
};

export function egovHits(json: unknown): WorldLawHit[] {
  const j = json as { laws?: EgovLaw[]; items?: EgovLaw[] };
  const rows = j?.laws ?? j?.items;
  if (!Array.isArray(rows)) throw new Error("shape");
  const out: WorldLawHit[] = [];
  for (const r of rows) {
    const id = r.law_info?.law_id;
    const title = r.revision_info?.law_title;
    if (!id || !/^\w+$/.test(id) || !title) continue;
    const repeal = r.revision_info?.repeal_status;
    if (repeal && repeal !== "None") continue;
    const snippet = clip(plain(r.sentences?.[0]?.text), 200);
    const date =
      day(r.revision_info?.amendment_enforcement_date) ?? day(r.law_info?.promulgation_date);
    out.push({
      id: `jp:${id}`,
      country: "jp",
      title,
      kind: EGOV_KIND[r.law_info?.law_type ?? ""] ?? "법령",
      ...(r.law_info?.law_num && { citation: r.law_info.law_num }),
      ...(snippet && { snippet }),
      ...(date && { date }),
      sourceUrl: `https://laws.e-gov.go.jp/law/${id}`,
      source: EGOV_SOURCE,
    });
  }
  return out;
}

export const egovTitleUrl = (ja: string) =>
  `https://laws.e-gov.go.jp/api/2/laws?${new URLSearchParams({ law_title: ja, limit: String(PER_SOURCE) })}`;
export const egovKeywordUrl = (ja: string) =>
  `https://laws.e-gov.go.jp/api/2/keyword?${new URLSearchParams({ keyword: ja, limit: String(PER_SOURCE) })}`;

const translateJa = (terms: QueryTerms) =>
  terms.ja.some((w) => /[぀-ヿ一-鿿]/.test(w)) ? terms.ja : [];

async function searchJp(terms: QueryTerms, ctx: Ctx): Promise<WorldLawHit[]> {
  const ja = translateJa(terms);
  if (ja.length === 0) return [];
  // 낱말이 하나면 법령 이름에서, 여러 개면 본문에서 함께 나오는 법령을 찾는다
  if (ja.length === 1) {
    const byTitle = egovHits(await getJson(egovTitleUrl(ja[0]), ctx));
    if (byTitle.length > 0) return byTitle;
  }
  return egovHits(await getJson(egovKeywordUrl(ja.join(" ")), ctx));
}

// ── 영국: legislation.gov.uk Atom 피드
const UK_SOURCE = "legislation.gov.uk (영국 국립기록원)";
const xmlText = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const tag = (xml: string, name: string) =>
  xmlText(new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? "");
const attr = (xml: string, name: string, key: string) =>
  new RegExp(`<${name}\\s[^>]*${key}="([^"]*)"`).exec(xml)?.[1] ?? "";

export function ukHits(xml: string): WorldLawHit[] {
  if (!/<feed[\s>]/.test(xml)) throw new Error("shape");
  const out: WorldLawHit[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const key = /^https?:\/\/www\.legislation\.gov\.uk\/id\/([a-z]+\/[\w-]+\/[\w-]+)$/.exec(
      tag(e, "id"),
    )?.[1];
    const title = tag(e, "title");
    if (!key || !title) continue;
    const type = attr(e, "ukm:DocumentMainType", "Value");
    const year = attr(e, "ukm:Year", "Value");
    const num = attr(e, "ukm:Number", "Value");
    const summary = tag(e, "summary");
    const date = day(attr(e, "ukm:CreationDate", "Date"));
    const citation =
      !year || !num
        ? undefined
        : type === "UnitedKingdomStatutoryInstrument"
          ? `S.I. ${year}/${num}`
          : type === "UnitedKingdomPublicGeneralAct"
            ? `${year} c. ${num}`
            : undefined;
    out.push({
      id: `uk:${key}`,
      country: "uk",
      title,
      kind:
        type === "UnitedKingdomPublicGeneralAct"
          ? "법률"
          : type === "UnitedKingdomStatutoryInstrument"
            ? "행정입법(Statutory Instrument)"
            : "법령",
      ...(citation && { citation }),
      ...(summary && summary !== title && { snippet: clip(summary, 220) }),
      ...(date && { date }),
      sourceUrl: `https://www.legislation.gov.uk/${key}`,
      source: UK_SOURCE,
    });
    if (out.length >= PER_SOURCE) break;
  }
  return out;
}

export const ukUrl = (en: string) =>
  `https://www.legislation.gov.uk/primary+secondary/data.feed?${new URLSearchParams({ title: en })}`;

async function searchUk(terms: QueryTerms, ctx: Ctx): Promise<WorldLawHit[]> {
  return titleSearch(terms.en, async (q) => {
    const res = await get(ukUrl(q), ctx, "application/atom+xml");
    if (!res.ok) throw new Error("upstream");
    return ukHits(await res.text());
  });
}

// ── 호주: Federal Register of Legislation API (OData)
type AuTitle = {
  id?: string;
  name?: string;
  makingDate?: string | null;
  collection?: string;
  isPrincipal?: boolean;
};
const AU_SOURCE = "Federal Register of Legislation (호주 정부)";

export function auHits(json: unknown): WorldLawHit[] {
  const rows = (json as { value?: AuTitle[] })?.value;
  if (!Array.isArray(rows)) throw new Error("shape");
  const out: WorldLawHit[] = [];
  for (const r of rows) {
    if (!r.id || !/^\w+$/.test(r.id) || !r.name) continue;
    // 관보 공고·개정문은 빼고 현행 본법·본규정만
    if (r.collection !== "Act" && r.collection !== "LegislativeInstrument") continue;
    if (r.isPrincipal === false) continue;
    const date = day(r.makingDate);
    out.push({
      id: `au:${r.id}`,
      country: "au",
      title: r.name,
      kind: r.collection === "Act" ? "법률" : "하위법령(Legislative Instrument)",
      ...(date && { date }),
      sourceUrl: `https://www.legislation.gov.au/${r.id}/latest/text`,
      source: AU_SOURCE,
    });
    if (out.length >= PER_SOURCE) break;
  }
  return out;
}

export const auUrl = (en: string) =>
  `https://api.prod.legislation.gov.au/v1/titles?${new URLSearchParams({
    // OData 문자열 안의 작은따옴표는 두 번 적는다
    $filter: `contains(name,'${en.replace(/'/g, "''")}') and isInForce eq true`,
    $top: "20",
    $select: "id,name,makingDate,collection,status,isPrincipal",
  })}`;

async function searchAu(terms: QueryTerms, ctx: Ctx): Promise<WorldLawHit[]> {
  return titleSearch(terms.en, async (q) => auHits(await getJson(auUrl(q), ctx)));
}

/** 한 출처를 시간 한도 안에서 돌린다 */
async function timed<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error("timeout"));
    }, ms);
  });
  try {
    return await Promise.race([run(ctl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const HANGUL = /[가-힣]/;

/**
 * 국내·해외 법령을 한 번에 찾는다. 순서는 rankWorld 고정 규칙(국내 먼저 → 자주 쓰는 법령·위계, 해외는 핵심 법령 → 나라 순서)이고
 * 같은 자리끼리는 출처가 준 순서 그대로다. 같은 법령이 목록과 실시간 결과에 함께 있으면 목록의 한국어 이름·설명을 살린다.
 */
export async function searchWorldLaws(
  query: string,
  deps: WorldDeps = {},
): Promise<WorldSearchResult> {
  const q = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  const glossary = translateQuery(q);
  if (!q) return { items: [], failed: [], translated: glossary };
  const base = queryTerms(q);
  // 검색어 해석(DEC-076)이 준 영어·일본어 낱말이 있으면 고정 낱말표 앞에 둔다 (공식 사이트 검색에 그대로 보낸다)
  const terms: QueryTerms = deps.extra
    ? {
        ko: [...new Set([...base.ko, ...(deps.extra.ko ?? [])])],
        en: [...new Set([...(deps.extra.en ?? []), ...base.en])].slice(0, 4),
        ja: [...new Set([...(deps.extra.ja ?? []), ...base.ja])].slice(0, 4),
      }
    : base;
  const translated = deps.extra
    ? {
        ...(terms.en.length > 0 && { en: terms.en.join(" ") }),
        ...(terms.ja.length > 0 && { ja: terms.ja.join(" ") }),
      }
    : glossary;
  const doFetch = deps.fetch ?? fetch;
  const ms = deps.timeoutMs ?? WORLD_TIMEOUT_MS;
  const korean =
    deps.koreanSearch ?? ((s: string) => createLawSource({ timeoutMs: ms }).searchLaws(s, 30));

  const live: Partial<Record<CountryCode, (signal: AbortSignal) => Promise<WorldLawHit[]>>> = {
    // 한글이 없는 검색어는 법제처 이름 검색에 맞지 않아 보내지 않는다
    ...(HANGUL.test(q) && {
      kr: async () => {
        // 이름 검색이라 검색어 그대로 먼저 찾고, 없으면 아는 첫 낱말로 한 번 더 찾는다
        const first = await korean(q);
        const next = first.length === 0 && terms.ko[0] && terms.ko[0] !== q ? terms.ko[0] : null;
        return (next ? await korean(next) : first).map(koreanHit);
      },
    }),
    us: (signal) => searchUs(terms, { fetch: doFetch, signal }),
    jp: (signal) => searchJp(terms, { fetch: doFetch, signal }),
    uk: (signal) => searchUk(terms, { fetch: doFetch, signal }),
    au: (signal) => searchAu(terms, { fetch: doFetch, signal }),
  };
  const countries = COUNTRY_CODES.filter((c) => live[c]);
  const settled = await Promise.allSettled(countries.map((c) => timed(ms, live[c]!)));

  const failed: CountryCode[] = [];
  const merged = new Map<string, WorldLawHit>();
  for (const hit of catalogSearch(q)) merged.set(hit.id, hit);
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      failed.push(countries[i]);
      return;
    }
    for (const hit of r.value) {
      const known = merged.get(hit.id);
      if (!known) merged.set(hit.id, hit);
      // 목록에 있는 법령: 목록의 이름·설명·주소를 그대로 두고 출처가 준 날짜만 더한다
      else if (known.curated && !known.date && hit.date)
        merged.set(hit.id, { ...known, date: hit.date });
    }
  });

  // 순서 (DEC-076): 국내 먼저(자주 쓰는 법령 표 → 법령 위계), 해외는 핵심 법령 → 나라 순서. 관련도 점수 없음
  const ordered = rankWorld(
    [...merged.values()],
    (h) => ({ name: h.title, kind: h.kind, country: h.country, curated: h.curated }),
    COUNTRY_CODES,
  );
  const seen = new Map<CountryCode, number>();
  const items = ordered.filter((h) => {
    const n = (seen.get(h.country) ?? 0) + 1;
    seen.set(h.country, n);
    return n <= PER_COUNTRY_LIMIT;
  });
  return { items, failed, translated };
}

// ── 실제 사례: 미국 openFDA 의료기기 리콜 (공개 기록)
type FdaRecall = {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  recall_initiation_date?: string;
};
const FDA_SOURCE = "openFDA (미국 식품의약국 공개 자료)";
/** 제품 설명에 거의 다 들어 있어 검색을 좁히지 못하는 낱말 */
const FDA_SKIP = new Set(["medical", "device", "devices", "and", "or", "not", "the", "of", "for"]);

export function fdaWords(query: string): string[] {
  const en = queryTerms(query).en.join(" ").toLowerCase();
  const words = en.match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= 2 && !FDA_SKIP.has(w)))].slice(0, 4);
}

export const fdaUrl = (words: string[]) =>
  `https://api.fda.gov/device/enforcement.json?${
    words.length > 0 ? `search=${words.join("+AND+")}&` : ""
  }sort=recall_initiation_date:desc&limit=5`;

export function fdaCases(json: unknown): WorldCase[] {
  const rows = (json as { results?: FdaRecall[] })?.results;
  if (!Array.isArray(rows)) return [];
  const out: WorldCase[] = [];
  for (const r of rows) {
    const no = r.recall_number;
    const title = clip(r.product_description, 160);
    const summary = clip(r.reason_for_recall, 320);
    if (!no || !/^[\w-]+$/.test(no) || !title || !summary) continue;
    const d = /^(\d{4})(\d{2})(\d{2})$/.exec(r.recall_initiation_date ?? "");
    // 회수 업체 이름·주소는 싣지 않는다 (제품 설명·사유·날짜만)
    out.push({
      id: `us:recall-${no}`,
      country: "us",
      kind: "리콜",
      title,
      summary,
      ...(d && { date: `${d[1]}-${d[2]}-${d[3]}` }),
      sourceUrl: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&recallnumber=${no}`,
      source: FDA_SOURCE,
    });
  }
  return out;
}

/**
 * 해외 법령과 함께 볼 공개 사례. 지금은 미국 의료기기 리콜 기록만 있고 그 밖의 나라는 빈 목록이다.
 * 출처가 준 글을 그대로 싣고 번역·요약·판단을 붙이지 않는다. 실패하면 빈 목록.
 */
export async function searchWorldCases(
  country: CountryCode,
  query: string,
  deps: WorldDeps = {},
): Promise<WorldCase[]> {
  if (country !== "us") return [];
  const doFetch = deps.fetch ?? fetch;
  try {
    return await timed(deps.timeoutMs ?? WORLD_TIMEOUT_MS, async (signal) => {
      const res = await get(
        fdaUrl(fdaWords(query)),
        { fetch: doFetch, signal },
        "application/json",
      );
      // openFDA는 맞는 기록이 없으면 404를 준다
      if (!res.ok) return [];
      return fdaCases(await res.json());
    });
  } catch {
    return [];
  }
}
