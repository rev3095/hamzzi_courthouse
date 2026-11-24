// 법인·사업자 공개 정보 조회 (F-015 AC4, DEC-052) — 순수 규칙. 요청 검증, 공식 API 응답을 화면용으로 줄이기, 바로 가기 링크.
// - 개인을 찾는 기능이 아니다. 출처는 상호·법인만 돌려주는 공식 API 두 곳(네이버 지역 검색, 금융위원회 기업기본정보)뿐이다.
// - 찾은 곳이 서류의 그 당사자와 같은 곳인지는 판단하지 않는다. 평판·위험도 같은 판정도 넣지 않는다 (절대 규칙 2).
// - 모델을 쓰지 않는다. AI_NOTICE 대신 BUSINESS_NOTICE를 붙인다.
import { ApiError } from "@/lib/api/errors";
import { orgNameOf } from "@/lib/casefile/policy";
import { scanInput } from "@/lib/pii";

export const BUSINESS_NOTICE = "공개 자료 검색 결과 · AI 생성 아님 · 같은 곳인지 직접 확인 필요";

const NAME_MIN = 2;
const NAME_MAX = 40;
export const BUSINESS_MAX_ITEMS = 5;

/** POST /businesses/lookup 본문. 연락처·주소·번호가 섞였거나 상호·기관 표지가 없는 이름은 받지 않는다 (값은 오류에 담지 않는다) */
export function parseLookupRequest(body: unknown): { name: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== "string") throw new ApiError("VALIDATION_ERROR", { fields: ["name"] });
  const name = b.name.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name) throw new ApiError("EMPTY_INPUT");
  if (name.length < NAME_MIN || name.length > NAME_MAX || /[<>[\]{}\\]/.test(name)) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["name"], reason: "format" });
  }
  if (scanInput(name).findings.some((f) => f.type !== "name")) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["name"], reason: "contact_info" });
  }
  // 법인·상호·기관의 표지가 있는 이름만 받는다 — 개인 이름이나 일반 낱말을 외부 검색으로 보내지 않는다.
  // 대표자·담당자 이름과 직함이 붙어 있으면 잘라 낸 상호만 쓴다
  const org = orgNameOf(name, "agency");
  if (!org) throw new ApiError("VALIDATION_ERROR", { fields: ["name"], reason: "not_business" });
  return { name: org };
}

export type BusinessLink = { label: string; url: string };

/** 사용자가 직접 확인할 수 있는 공식·공개 사이트. 조회 키가 없어도 언제나 보인다 */
export function businessLinks(name: string): BusinessLink[] {
  return [
    {
      label: "네이버 지도에서 찾기",
      url: `https://map.naver.com/p/search/${encodeURIComponent(name)}`,
    },
    { label: "인터넷등기소 (법인 등기 열람)", url: "https://www.iros.go.kr" },
    { label: "전자공시 DART (공시 대상 회사)", url: "https://dart.fss.or.kr" },
  ];
}

export type PlaceItem = {
  title: string;
  category: string | null;
  address: string | null;
  roadAddress: string | null;
  link: string | null;
};

export type CorpItem = {
  corpName: string;
  address: string | null;
  establishedAt: string | null;
  industry: string | null;
  homepage: string | null;
};

export type SourceResult<T> =
  { status: "ok"; items: T[] } | { status: "empty" | "no_key" | "failed"; items: [] };

const text = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return t || null;
};

/** http(s) 주소만 링크로 쓴다 */
const safeUrl = (v: unknown): string | null => {
  const t = text(v);
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `http://${t}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

/** 네이버 지역 검색 API(local.json) 응답 → 화면 항목. 제목의 강조 태그는 뗀다. 전화번호는 싣지 않는다 */
export function parseNaverLocal(json: unknown): PlaceItem[] {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: PlaceItem[] = [];
  for (const raw of items) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = text(r.title);
    if (!title) continue;
    out.push({
      title,
      category: text(r.category),
      address: text(r.address),
      roadAddress: text(r.roadAddress),
      link: safeUrl(r.link),
    });
    if (out.length >= BUSINESS_MAX_ITEMS) break;
  }
  return out;
}

/** "20010315" → "2001-03-15". 모양이 다르면 null */
const ymd = (v: unknown): string | null => {
  const t = text(v);
  const m = t ? /^(\d{4})(\d{2})(\d{2})$/.exec(t) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/**
 * 금융위원회 기업기본정보(getCorpOutline_V2) 응답 → 화면 항목.
 * 대표자 이름·법인등록번호·사업자등록번호·전화·팩스는 싣지 않는다 (개인 이름은 내보내지 않는다). 항목이 하나면 배열이 아닌 객체로 올 수 있다.
 */
export function parseCorpOutline(json: unknown): CorpItem[] {
  const body = (json as { response?: { body?: { items?: { item?: unknown } } } } | null)?.response
    ?.body;
  const item = body?.items?.item;
  const list = Array.isArray(item) ? item : item ? [item] : [];
  const out: CorpItem[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const corpName = text(r.corpNm);
    if (!corpName) continue;
    const address = text(r.enpBsadr);
    // 같은 법인이 기준일마다 여러 번 나온다
    const key = `${corpName}|${address ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      corpName,
      address,
      establishedAt: ymd(r.enpEstbDt),
      industry: text(r.sicNm),
      homepage: safeUrl(r.enpHmpgUrl),
    });
    if (out.length >= BUSINESS_MAX_ITEMS) break;
  }
  return out;
}

export const toResult = <T>(items: T[]): SourceResult<T> =>
  items.length > 0 ? { status: "ok", items } : { status: "empty", items: [] };

export type BlogItem = { title: string; description: string; link: string | null };

/**
 * 네이버 블로그 검색 API(blog.json) 응답 → 제목·요약문·주소. 기업 조사(F-016)가 참고 자료 목록으로 쓴다.
 * 공식 API가 주는 요약문까지만 쓴다 — 블로그 본문은 가져오지 않는다(자동 접근을 막은 곳이다). 글쓴이 이름은 싣지 않는다.
 */
export function parseNaverBlog(json: unknown): BlogItem[] {
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: BlogItem[] = [];
  for (const raw of items) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const title = text(r.title);
    if (!title) continue;
    out.push({ title, description: text(r.description) ?? "", link: safeUrl(r.link) });
    if (out.length >= BUSINESS_MAX_ITEMS) break;
  }
  return out;
}
