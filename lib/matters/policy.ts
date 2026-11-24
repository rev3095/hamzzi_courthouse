// 사건 진행 (F-016, DEC-053) — 순수 규칙. 저장 요청 검증, 서류 판독 결과 거르기, 모델에 보낼 글 가리기.
// - 사건 자료는 로그인 사용자 본인만 읽고 쓴다. 본인 사건을 정리하는 도구라 서류에 적힌 이름은 그대로 둔다(사용자 결정, DEC-053).
//   연락처·등록번호·계좌·주소 꼴은 저장·표시 전에 가린다 (maskContacts) — 정리에 필요하지 않다.
// - 모델에 보내는 글(쟁점 정리·요약·기업 조사에 붙여 넣은 글)은 이름까지 가린 문장만 쓴다 (절대 규칙 4). 사진만 예외(DEC-052).
// - 판정 항목이 없다. 단정 표현("반드시"·"무조건"·"100%")이 든 AI 문장은 뺀다 (절대 규칙 2).
import { z } from "zod";
import { isAssertive } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import {
  AGENCY_MARK,
  DOC_TYPES,
  ORG_MARK,
  hasCitation,
  isJudging,
  maskMore,
} from "@/lib/casefile/policy";
import { maskContacts, nameAfterRelation, scanInput } from "@/lib/pii";
import {
  MATTER_KINDS,
  MATTER_LIMITS,
  MATTER_SIDES,
  NOTE_KINDS,
  emptyMatter,
  type MatterData,
  type MatterReading,
} from "./model";

export * from "./model";

const L = MATTER_LIMITS;
const clean = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => maskContacts(s.replace(/\u0000/g, "")).slice(0, max));
const Id = z.string().min(1).max(40);
const Url = z
  .string()
  .max(500)
  .refine((u) => /^https?:\/\//i.test(u), "url");

/** 저장되는 사건 자료의 모양. 모르는 키는 버리고, 글자 수·개수 한도를 넘으면 거절한다 */
export const MatterDataZ = z.object({
  version: z.literal(1),
  summary: clean(L.line),
  mySide: z.enum(["claimant", "respondent", "unknown"]),
  docs: z
    .array(
      z.object({
        id: Id,
        title: clean(L.short),
        type: clean(L.short),
        date: clean(L.short),
        gist: clean(L.line),
        pages: z.number().int().min(0).max(50),
        addedAt: z.string().max(40),
      }),
    )
    .max(L.docs),
  facts: z
    .array(z.object({ id: Id, when: clean(L.short), what: clean(L.line), docId: Id.nullable() }))
    .max(L.facts),
  parties: z
    .array(
      z.object({
        id: Id,
        name: clean(L.short),
        kind: z.enum(MATTER_KINDS),
        side: z.enum(MATTER_SIDES),
        role: clean(L.short),
        note: clean(L.line),
      }),
    )
    .max(L.parties),
  relations: z
    .array(z.object({ id: Id, from: Id, to: Id, label: clean(L.short) }))
    .max(L.relations),
  demands: z
    .array(z.object({ id: Id, what: clean(L.line), due: clean(L.short), docId: Id.nullable() }))
    .max(L.demands),
  clauses: z
    .array(z.object({ id: Id, ref: clean(L.short), gist: clean(L.line), docId: Id.nullable() }))
    .max(L.clauses),
  issues: z
    .array(
      z.object({
        id: Id,
        title: clean(L.line),
        detail: clean(L.body),
        points: z.array(z.object({ text: clean(L.body), label: clean(L.short), url: Url })).max(12),
        unknowns: z.array(clean(L.line)).max(12),
        byAi: z.boolean(),
      }),
    )
    .max(L.issues),
  notes: z
    .array(
      z.object({
        id: Id,
        title: clean(L.short),
        body: clean(L.body),
        kind: z.enum(NOTE_KINDS),
        refs: z.array(Id).max(20),
        sources: z.array(z.object({ title: clean(L.short), url: Url })).max(L.sources),
        byAi: z.boolean(),
        at: z.string().max(40),
      }),
    )
    .max(L.notes),
});

const invalid = (field: string, reason: string) =>
  new ApiError("VALIDATION_ERROR", { fields: [field], reason });

export function parseTitle(v: unknown): string {
  if (typeof v !== "string") throw invalid("title", "type");
  const t = maskContacts(v.normalize("NFKC").replace(/\s+/g, " ").trim());
  if (!t) throw new ApiError("EMPTY_INPUT");
  if (t.length > L.titleChars) throw invalid("title", "too_long");
  return t;
}

/** 저장 요청의 data. 오류에는 필드 이름만 담는다 (사건 내용은 담지 않는다) */
export function parseMatterData(v: unknown): MatterData {
  const r = MatterDataZ.safeParse(v);
  if (!r.success) {
    const path = r.error.issues[0]?.path.filter((p) => typeof p === "string").join(".") || "data";
    throw invalid(`data.${path}`, "format");
  }
  if (new TextEncoder().encode(JSON.stringify(r.data)).length > L.dataBytes) {
    throw invalid("data", "too_large");
  }
  return r.data;
}

/** DB에서 읽은 값을 화면용으로. 모양이 다르면(옛 버전·손상) 빈 사건으로 */
export function readMatterData(v: unknown): MatterData {
  const r = MatterDataZ.safeParse(v);
  return r.success ? r.data : emptyMatter();
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- 서류 판독 (사건 진행용: 자세히, 이름 유지) -----------------------------------------------

const Str = z.string();
export const MatterReadingZ = z.object({
  readable: z.boolean(),
  doc: z.object({ type: Str, title: Str, date: Str, gist: Str }),
  parties: z.array(z.object({ name: Str, kind: Str, side: Str, role: Str, note: Str })),
  relations: z.array(z.object({ from: Str, to: Str, label: Str })),
  facts: z.array(z.object({ when: Str, what: Str })),
  demands: z.array(z.object({ what: Str, due: Str })),
  clauses: z.array(z.object({ ref: Str, gist: Str })),
});
export type MatterReadingRaw = z.infer<typeof MatterReadingZ>;

const str = (description: string) => ({ type: "string", description });
const list = (description: string, properties: Record<string, unknown>) => ({
  type: "array",
  description,
  items: {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  },
});

/** 고정 객체라 요청마다 같다 */
export const MATTER_READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "doc", "parties", "relations", "facts", "demands", "clauses"],
  properties: {
    readable: { type: "boolean", description: "서류의 글자를 읽을 수 있었는지" },
    doc: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title", "date", "gist"],
      properties: {
        type: {
          type: "string",
          enum: [...DOC_TYPES],
          description: "서류 종류. 목록에 없으면 기타",
        },
        title: str("서류의 제목 (적힌 그대로)"),
        date: str("서류의 작성·발송 날짜 (적힌 그대로, 없으면 빈 문자열)"),
        gist: str("이 서류가 무엇인지 한두 문장"),
      },
    },
    parties: list("서류에 나오는 회사·기관·사람·집단. 같은 대상은 한 번만", {
      name: str("이름 (회사·기관 이름, 사람 이름. 신원 미상이면 '외부 공격자'처럼 서류의 표현)"),
      kind: {
        type: "string",
        enum: [...MATTER_KINDS],
        description: "business 회사, agency 기관, person 개인, group 집단·불특정",
      },
      side: {
        type: "string",
        enum: [...MATTER_SIDES],
        description: "claimant 요구·청구하는 쪽, respondent 받는 쪽, other 그 밖",
      },
      role: str("서류에 적힌 역할·직책 (발신, 수신, 통지 대리, 대표이사, 수탁사 등)"),
      note: str("서류에 적힌 그 대상에 대한 설명 한 문장 (없으면 빈 문자열)"),
    }),
    relations: list("당사자 사이의 관계. from·to는 parties의 name과 같은 글자", {
      from: str("관계의 한쪽 name"),
      to: str("관계의 다른 쪽 name"),
      label: str("관계 (계약, 계열사, 통지 대리, 소속, 위탁 등 짧게)"),
    }),
    facts: list("서류에 적힌 사실을 일어난 순서대로. 한 항목에 한 가지 일", {
      when: str("서류에 적힌 시점 그대로 (없으면 빈 문자열)"),
      what: str("일어난 일 한 문장. 서류의 주장이면 누구의 주장인지 밝힌다"),
    }),
    demands: list("서류가 요구하는 것", {
      what: str("요구 내용 한 문장"),
      due: str("서류에 적힌 기한 그대로 (없으면 빈 문자열)"),
    }),
    clauses: list("서류가 근거로 든 계약 조항·법령 조항", {
      ref: str("조항 이름 (서류에 적힌 그대로)"),
      gist: str("서류가 그 조항에 대해 적은 내용 한 문장"),
    }),
  },
} as const;

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
/** 한 줄: 연락처·번호를 가리고 길이를 맞춘다. 단정 표현이 든 문장은 버린다 */
function line(raw: string, max: number): string {
  const t = maskContacts(squash(raw));
  if (isAssertive(t)) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * 판독 결과를 거른다 (이름은 그대로, 연락처·번호는 가림, 종류·자리는 정해진 값만, 개수·길이 한도).
 * 읽지 못했거나 남은 내용이 없으면 null.
 */
export function screenMatterReading(raw: MatterReadingRaw): MatterReading | null {
  if (!raw.readable) return null;
  const kindOf = (v: string) =>
    (MATTER_KINDS as readonly string[]).includes(v)
      ? (v as MatterReading["parties"][number]["kind"])
      : "group";
  const sideOf = (v: string) =>
    (MATTER_SIDES as readonly string[]).includes(v)
      ? (v as MatterReading["parties"][number]["side"])
      : "other";

  const parties: MatterReading["parties"] = [];
  for (const p of raw.parties) {
    const name = line(p.name, 60);
    if (name.length < 2 || /\[(?:전화번호|이메일|주민번호|계좌번호|주소)\]/.test(name)) continue;
    if (parties.some((x) => squash(x.name) === name)) continue;
    parties.push({
      name,
      kind: kindOf(p.kind),
      side: sideOf(p.side),
      role: line(p.role, 40),
      note: line(p.note, L.line),
    });
    if (parties.length >= 30) break;
  }
  const names = new Set(parties.map((p) => p.name));
  const relations = raw.relations
    .map((r) => ({ from: line(r.from, 60), to: line(r.to, 60), label: line(r.label, 30) }))
    .filter((r) => names.has(r.from) && names.has(r.to) && r.from !== r.to && r.label)
    .slice(0, 40);
  const facts = raw.facts
    .map((f) => ({ when: line(f.when, 40), what: line(f.what, L.line) }))
    .filter((f) => f.what.length >= 2)
    .slice(0, 60);
  const demands = raw.demands
    .map((d) => ({ what: line(d.what, L.line), due: line(d.due, 60) }))
    .filter((d) => d.what.length >= 2)
    .slice(0, 30);
  const clauses = raw.clauses
    .map((c) => ({ ref: line(c.ref, 80), gist: line(c.gist, L.line) }))
    .filter((c) => c.ref.length >= 2)
    .slice(0, 40);
  if (facts.length === 0 && demands.length === 0 && parties.length === 0) return null;

  const type = (DOC_TYPES as readonly string[]).includes(raw.doc.type) ? raw.doc.type : "기타";
  return {
    doc: {
      type,
      title: line(raw.doc.title, L.short),
      date: line(raw.doc.date, 40),
      gist: line(raw.doc.gist, L.line),
    },
    parties,
    relations,
    facts,
    demands,
    clauses,
  };
}

/**
 * 모델에 보낼 글을 가린다: scanInput(이름·연락처) + 사건에 적힌 개인 이름 목록으로 한 번 더.
 * 호출한 쪽은 반환값만 쓰고 원문은 더 쓰지 않는다.
 */
export function maskForModel(text: string, personNames: string[]) {
  const scan = scanInput(text);
  const more = maskMore(scan.maskedText, personNames);
  return { text: more.text, sensitive: scan.sensitive };
}

/** 본문 { text, personNames? } — 쟁점 정리·요약 요청 */
export function parseTextRequest(
  body: unknown,
  maxChars: number,
): { text: string; personNames: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.text !== "string") throw invalid("text", "type");
  if (!b.text.trim()) throw new ApiError("EMPTY_INPUT");
  if (b.text.length > maxChars) throw invalid("text", "too_long");
  const names = Array.isArray(b.personNames)
    ? b.personNames.filter((n): n is string => typeof n === "string" && n.length <= 40).slice(0, 60)
    : [];
  return { text: b.text, personNames: names };
}

// --- 기업 조사 ----------------------------------------------------------------------------

export const COMPANY_LIMITS = { nameChars: 60, urls: 4, pastedChars: 6_000 } as const;
export const COMPANY_NOTICE = "웹 검색·공개 자료 요약 · 출처를 직접 확인하세요";

export type CompanyRequest = {
  name: string;
  urls: string[];
  pasted: string;
  /** 사건에 적힌 개인 이름 — 붙여 넣은 글·검색 요약문에서 가리는 데만 쓴다 */
  personNames: string[];
  /** 붙여 넣은 글에 민감정보가 보일 때의 동의 */
  consent: boolean;
};

/** 사람을 가리키는 직함·호칭 — 회사 이름 칸에 사람이 들어온 꼴을 알아본다 */
const PERSON_TITLE =
  /(?:변호사|법무사|세무사|노무사|회계사|의사|교수|박사|판사|검사|기자|작가|대표\s*이사|대표|회장|사장|원장|이사|팀장|부장|과장|씨|님)(?![가-힣A-Za-z])/;
/** 개인 계정이 올라오는 사이트 — 기업 조사 링크로 받지 않는다 */
const PERSONAL_HOSTS =
  /(?:^|\.)(?:instagram\.com|facebook\.com|x\.com|twitter\.com|threads\.net|tiktok\.com|linkedin\.com)$/;

/**
 * 회사·기관 이름으로 볼 수 있는지. 사람 이름 꼴(성씨로 시작하는 한글 두~네 글자)이나 직함이 붙은 이름은
 * 상호·기관 표지(주식회사·Inc·법원 등)가 없으면 받지 않는다 — 기업 조사가 개인을 찾는 도구로 쓰이지 않게 (DEC-053).
 */
export function looksLikeCompanyName(name: string): boolean {
  if (ORG_MARK.test(name) || AGENCY_MARK.test(name)) return true;
  if (PERSON_TITLE.test(name)) return false;
  return !name.split(" ").some((w) => /^[가-힣]{2,4}$/.test(w) && nameAfterRelation(w) !== null);
}

/**
 * 웹 가져오기 도구로 읽히지 않는 것을 실제 호출로 확인한 사이트 (2026-11-24, 자동 접근을 막아 둔 곳).
 * 이런 링크는 도구 횟수를 쓰지 않고 바로 "읽지 못함"으로 알려 본문을 붙여 넣게 한다. 막힌 곳을 돌아서 읽지 않는다.
 */
const UNREADABLE_HOSTS = ["blog.naver.com", "m.blog.naver.com"];
export function isKnownUnreadable(url: string): boolean {
  try {
    return UNREADABLE_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** 사용자가 준 링크는 공개 웹 주소(http/https, 사설·로컬 주소 아님)만 받는다 */
export function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 400) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return null;
  }
  u.username = "";
  u.password = "";
  return u.toString();
}

export function parseCompanyRequest(body: unknown): CompanyRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== "string") throw invalid("name", "type");
  const name = squash(b.name);
  if (!name) throw new ApiError("EMPTY_INPUT");
  if (name.length < 2 || name.length > COMPANY_LIMITS.nameChars || /[<>[\]{}\\]/.test(name)) {
    throw invalid("name", "format");
  }
  // 연락처·번호가 섞인 이름은 외부 검색으로 보내지 않는다
  if (scanInput(name).findings.some((f) => f.type !== "name"))
    throw invalid("name", "contact_info");
  // 사람 이름 꼴은 받지 않는다 (회사만 조사한다)
  if (!looksLikeCompanyName(name)) throw invalid("name", "not_business");
  if (b.urls !== undefined && !Array.isArray(b.urls)) throw invalid("urls", "type");
  const urls: string[] = [];
  for (const raw of (b.urls as unknown[] | undefined) ?? []) {
    const u = safeHttpUrl(raw);
    if (!u) throw invalid("urls", "format");
    if (PERSONAL_HOSTS.test(new URL(u).hostname.toLowerCase()))
      throw invalid("urls", "personal_site");
    if (!urls.includes(u)) urls.push(u);
  }
  if (urls.length > COMPANY_LIMITS.urls) throw invalid("urls", "too_many");
  if (b.pasted !== undefined && typeof b.pasted !== "string") throw invalid("pasted", "type");
  const pasted = typeof b.pasted === "string" ? b.pasted.trim() : "";
  if (pasted.length > COMPANY_LIMITS.pastedChars) throw invalid("pasted", "too_long");
  const personNames = Array.isArray(b.personNames)
    ? b.personNames.filter((n): n is string => typeof n === "string" && n.length <= 40).slice(0, 60)
    : [];
  return { name, urls, pasted, personNames, consent: b.consent === true };
}

export type CompanyReport = {
  /** 무엇을 하는 회사인지 */
  overview: string;
  /** 주력 제품·서비스 */
  products: string[];
  /** 무엇으로 매출을 내고 어떻게 파는지 */
  business: string;
  /** 핵심 기술·아이템 */
  items: string[];
  /** 설립·소재지 같은 기본 정보 */
  basics: string[];
  /** 자료에서 확인하지 못한 것 */
  unknowns: string[];
};

export const CompanyReportZ = z.object({
  overview: Str,
  products: z.array(Str),
  business: Str,
  items: z.array(Str),
  basics: z.array(Str),
  unknowns: z.array(Str),
});

/** 평판·위험도·전망처럼 회사를 평가하는 말 (절대 규칙 2 — 조사는 적힌 사실만 옮긴다) */
const EVALUATING =
  /신뢰할\s*(?:수|만)|믿을\s*(?:수|만)|사기\s*(?:업체|회사|기업)|위험한\s*(?:회사|업체|기업)|부실\s*(?:기업|회사)|투자\s*(?:가치|추천|유망)|망할|전망이\s*(?:밝|어둡)|평판이|유망한|우량|먹튀|악덕|추천합니다|추천할|성장\s*가능성/;

/** 모델이 쓴 기업 조사 글을 거른다: 연락처 가림, 단정·평가 문장 제거, 길이·개수 한도 */
export function screenCompanyReport(raw: z.infer<typeof CompanyReportZ>): CompanyReport | null {
  const sentence = (s: string, max: number) => {
    const t = maskContacts(squash(s));
    if (!t || isAssertive(t) || EVALUATING.test(t) || isJudging(t)) return "";
    // 조문·사건번호(검증하지 않은 인용)가 든 문장은 뺀다 (절대 규칙 1).
    // 대표자 이름 같은 공개 자료 속 이름은 남긴다 — 본인 계정에만 저장·표시되는 자료다 (사용자 결정 2026-11-24, DEC-053)
    if (hasCitation(t)) return "";
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const para = (s: string, max: number) =>
    s
      .split(/(?<=[.!?。])\s+|\n+/)
      .map((x) => sentence(x, 400))
      .filter(Boolean)
      .join(" ")
      .slice(0, max);
  const items = (arr: string[], n: number) =>
    arr
      .map((x) => sentence(x, 240))
      .filter(Boolean)
      .slice(0, n);
  const report: CompanyReport = {
    overview: para(raw.overview, 900),
    products: items(raw.products, 8),
    business: para(raw.business, 700),
    items: items(raw.items, 8),
    basics: items(raw.basics, 8),
    unknowns: items(raw.unknowns, 6),
  };
  return report.overview || report.products.length > 0 ? report : null;
}

/** 조사 결과를 노트 본문으로 */
export function companyNoteBody(r: CompanyReport): string {
  const block = (title: string, lines: string[]) =>
    lines.length > 0 ? [`■ ${title}`, ...lines.map((l) => `- ${l}`)] : [];
  return [
    ...(r.overview ? ["■ 무엇을 하는 회사인가", r.overview] : []),
    ...block("주력 제품·서비스", r.products),
    ...(r.business ? ["■ 매출·판매 방식", r.business] : []),
    ...block("핵심 기술·아이템", r.items),
    ...block("기본 정보", r.basics),
    ...block("자료에서 확인하지 못한 것", r.unknowns),
  ].join("\n");
}
