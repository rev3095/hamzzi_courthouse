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
import { CASE_NO, MERGED_SERIAL, articlesIn } from "@/lib/citations/patterns";
import { maskContacts, nameAfterRelation, scanInput } from "@/lib/pii";
import { statuteUrl } from "@/lib/search/normalize";
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
        // 가상 사건 프리셋을 내 사건으로 가져올 때 함께 오는 지어낸 서류 본문 (DEC-061)
        body: clean(L.body).optional(),
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
    .array(
      z.object({
        id: Id,
        ref: clean(L.short),
        gist: clean(L.line),
        docId: Id.nullable(),
        /** 법제처 재조회로 확인된 법령 조문의 법제처 주소 (서류 읽기가 붙인다) */
        url: Url.optional(),
      }),
    )
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
        description:
          "claimant 요구·청구하는 쪽, respondent 받는 쪽, other 그 밖. 한쪽을 대신해 보내거나 받는 대리인·통지 대리는 대신하는 쪽과 같게",
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
      due: str(
        "서류에 적힌 기한 그대로 (없으면 빈 문자열). '동일 기한'처럼 앞의 기한을 가리키면 그 앞 요구의 기한 글자",
      ),
    }),
    clauses: list("서류가 근거로 든 계약 조항·법령 조항", {
      ref: str("조항 이름 (서류에 적힌 그대로)"),
      gist: str("서류가 그 조항에 대해 적은 내용 한 문장"),
    }),
  },
} as const;

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
/**
 * 한 줄: 연락처·번호를 가리고 길이를 맞춘다. 단정 표현이 든 문장은 버린다.
 * 길이 한도는 저장 한도(MATTER_LIMITS.short·line)와 같게 둔다 — 더 짧게 자르면 긴 기관 목록·계약 이름이 잘린다 (판독 시험 2026-11-24).
 * 조문·사건번호는 여기서 지우지 않는다 — 법제처 재조회 뒤 applyReadingChecks가 확인되지 않은 것을 가린다 (절대 규칙 1).
 */
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
    const name = line(p.name, L.short);
    if (name.length < 2 || /\[(?:전화번호|이메일|주민번호|계좌번호|주소)\]/.test(name)) continue;
    if (parties.some((x) => squash(x.name) === name)) continue;
    parties.push({
      name,
      kind: kindOf(p.kind),
      side: sideOf(p.side),
      role: line(p.role, L.short),
      note: line(p.note, L.line),
    });
    if (parties.length >= 30) break;
  }
  const names = new Set(parties.map((p) => p.name));
  const relations = raw.relations
    .map((r) => ({
      from: line(r.from, L.short),
      to: line(r.to, L.short),
      label: line(r.label, L.short),
    }))
    .filter((r) => names.has(r.from) && names.has(r.to) && r.from !== r.to && r.label)
    .slice(0, 40);
  const facts = raw.facts
    .map((f) => ({ when: line(f.when, L.short), what: line(f.what, L.line) }))
    .filter((f) => f.what.length >= 2)
    .slice(0, 60);
  const demands = raw.demands
    .map((d) => ({ what: line(d.what, L.line), due: line(d.due, L.short) }))
    .filter((d) => d.what.length >= 2)
    .slice(0, 30);
  const clauses = raw.clauses
    .map((c) => ({ ref: line(c.ref, L.short), gist: line(c.gist, L.line) }))
    .filter((c) => c.ref.length >= 2)
    .slice(0, 40);
  if (facts.length === 0 && demands.length === 0 && parties.length === 0) return null;

  const type = (DOC_TYPES as readonly string[]).includes(raw.doc.type) ? raw.doc.type : "기타";
  return {
    doc: {
      type,
      title: line(raw.doc.title, L.short),
      date: line(raw.doc.date, L.short),
      gist: line(raw.doc.gist, L.line),
    },
    parties,
    relations,
    facts,
    demands,
    clauses,
  };
}

// --- 서류 속 조문·사건번호 재조회 (절대 규칙 1) ---------------------------------------------
// 서류 읽기 결과에 든 법령 조문("민법 제681조")·사건번호는 AI가 옮긴 것이라 법제처 재조회(verify_citations)를
// 통과한 것만 남긴다(사용자 결정 2026-11-24). 통과하지 못한 것은 글에서 번호 자리를 가리고, 조항 목록에서는 항목째 뺀다.
// 법령 이름이 앞에 없는 조항("계약서 제5조"·"제5조(손해배상)")은 법령 인용이 아니라 서류 속 조항이라 그대로 둔다.
// 판별이 애매하면 가리는 쪽으로 틀리게 한다(법령 이름을 넓게 잡고, "같은 법"처럼 정할 수 없는 조문은 가린다).

/** 조문 바로 앞이 법령 이름으로 끝나는지 (법·법률·조례 + 시행령·시행규칙) */
const LAW_END = /(?:법률|법|조례)(?:\s?시행령|\s?시행규칙)?$/;
/** 이름을 정할 수 없는 법령 지시 ("같은 법 제5조", "위 법률 제3조", "동법 시행령 제2조") */
const SAME_LAW = /(?:^|\s)(?:같은|위|동|이|그)\s?(?:법률|법|조례)(?:\s?시행령|\s?시행규칙)?$/;
const QUOTE_MARKS = /[「」『』"'“”‘’()（）[\]<>《》〈〉]/g;
/** 앞 조문과 이어지는 사이 글 ("민법 제390조 제1항, 제750조", "제29조 및 제30조", "제1조 내지 제5조") */
const ARTICLE_JOIN =
  /^(?:\s|,|·|ㆍ|~|-|및|또는|와|과|내지|부터|까지|제\s*\d+\s*(?:항|호|목)|\d+\s*(?:항|호|목)|본문|단서|전단|후단)*$/;
/** 서류에 흔한 사건부호까지 넓게 (2025차전12345 · 2025형제123). 날짜·금액은 걸리지 않게 */
const CASE_NO_WIDE = /(?:19|20)\d{2}\s*(?![년만억천원월일])[가-힣]{1,3}\s*\d{3,}/g;
/** 법령 이름으로 볼 낱말 수의 끝 (띄어 쓴 긴 법령 이름: "정보통신망 이용촉진 및 정보보호 등에 관한 법률") */
const MAX_LAW_WORDS = 9;
/** 법령 이름 앞에서 끊는 낱말: 주어·목적어·부사어 조사로 끝나는 낱말, 접속어 */
const CUT_WORD =
  /(?:은|는|을|를|이|가|께서|에게|께|라고|며|도|에서|으로|로)$|^(?:그리고|또한|따라서|특히|다만|그러나|그래서|즉|또)$/;
/** 다른 나라·옛 법령을 가리키는 꾸밈말 — 꼬리("민법 제709조")가 확인돼도 그 조문이 아니다 */
const OTHER_LAW =
  /(?:^|\s)(?:구|舊|개정\s?전|폐지된|옛|일본|독일|미국|중국|프랑스|영국|대만|북한|외국|국제|EU|유럽)(?=\s)/;

export const UNCHECKED_ARTICLE = "〔확인 안 된 조문〕";
export const UNCHECKED_CASE = "〔확인 안 된 사건번호〕";

/**
 * 글 속 인용 한 자리. candidates = 재조회할 문자열(조문은 법령 이름 + 조문 한 개). 법제처가 확인하면 확인된 인용이다.
 * 비어 있으면(같은 법, 다른 나라·옛 법령, 너무 긴 이름) 재조회하지 않고 언제나 확인되지 않은 것으로 본다.
 */
type Span = { kind: "statute" | "case"; candidates: string[]; index: number; length: number };

/**
 * 조문 앞 글에서 법령 이름을 정한다. null = 법령 조문이 아니다(계약·약관 조항), [] = 법령이지만 정할 수 없다.
 * 「」로 묶였으면 그 이름. 아니면 괄호 속 글을 지우고, 문장 구두점과 조사·접속어 낱말 뒤부터 조문 앞까지를 이름으로 본다.
 * 이름을 짧게 잘라 다른 법령으로 확인되지 않게 후보는 하나만 만든다.
 */
function lawCandidates(before: string, label: string): string[] | null {
  const quoted = before.match(/[「『]([^「」『』]{2,80})[」』]\s*$/);
  if (quoted) {
    const name = quoted[1].replace(/\s+/g, " ").trim();
    return LAW_END.test(name) ? [`${name} ${label}`] : null;
  }
  const clean = (
    before
      // 괄호 속 글(개정일·약칭 등)은 법령 이름이 아니다: "근로기준법(2020. 1. 1. 개정) 제5조"
      .replace(/\([^()]*\)|（[^（）]*）|\[[^[\]]*\]/g, " ")
      .replace(QUOTE_MARKS, " ")
      .split(/[.!?。:;,\n]/)
      .pop() ?? ""
  )
    .replace(/\s+/g, " ")
    .trim();
  if (SAME_LAW.test(clean)) return [];
  if (!LAW_END.test(clean)) return null;
  const all = clean.split(" ");
  const cut = all.findLastIndex((w, i) => i < all.length - 1 && CUT_WORD.test(w));
  const words = all.slice(cut + 1);
  if (words.length > MAX_LAW_WORDS || OTHER_LAW.test(words.join(" "))) return [];
  const name = words.join(" ");
  // "법"·"법률"·"시행령" 한 낱말만으로는 법령 이름이 아니다
  if (/^(?:법|법률|조례|시행령|시행규칙)$/.test(name)) return [];
  return [`${name} ${label}`];
}

/** 글 속 법령 조문·사건번호의 자리 (법령 이름 없는 조항은 넣지 않는다) */
export function citationSpans(text: string): Span[] {
  const t = text.normalize("NFKC");
  const spans: Span[] = [];
  const overlaps = (index: number, length: number) =>
    spans.some((s) => index < s.index + s.length && s.index < index + length);

  // 사건번호: 판례 사건부호(lib/citations, 두 자리 연도·짧은 일련번호·병합 사건 포함) + 서류에 흔한 넓은 꼴
  for (const re of [CASE_NO, CASE_NO_WIDE]) {
    for (const m of t.matchAll(new RegExp(re.source, "g"))) {
      const index = m.index ?? 0;
      if (overlaps(index, m[0].length)) continue;
      const no = m[0].replace(/\s+/g, "");
      spans.push({ kind: "case", candidates: [no], index, length: m[0].length });
      // 병합 사건의 뒤 번호 ("2020다1234, 5678")
      const prefix = no.replace(/\d+$/, "");
      let at = index + m[0].length;
      let merged = t.slice(at).match(MERGED_SERIAL);
      while (merged) {
        const start = at + merged[0].indexOf(merged[1]);
        spans.push({
          kind: "case",
          candidates: [`${prefix}${merged[1]}`],
          index: start,
          length: merged[1].length,
        });
        at += merged[0].length;
        merged = t.slice(at).match(MERGED_SERIAL);
      }
    }
  }

  // 조문: 바로 앞이 법령 이름이면 그 법령, 앞 조문과 이어 쓴 것이면 앞 조문의 법령
  let prev: { names: string[] | null; end: number } | null = null;
  for (const a of articlesIn(t)) {
    if (overlaps(a.index, a.length)) continue;
    const before = t.slice(Math.max(0, a.index - 80), a.index);
    let names = lawCandidates(before, a.label);
    if (names === null && prev && ARTICLE_JOIN.test(t.slice(prev.end, a.index))) {
      names =
        prev.names === null ? null : prev.names.map((n) => n.replace(/\s\S+$/, ` ${a.label}`));
    }
    if (names !== null) spans.push({ kind: "statute", candidates: names, ...a });
    prev = { names, end: a.index + a.length };
  }
  return spans.sort((x, y) => x.index - y.index);
}

/** 읽기 결과에서 조문·사건번호가 들어갈 수 있는 모든 글 (이름·날짜 포함) */
function readingTexts(r: MatterReading): string[] {
  return [
    r.doc.title,
    r.doc.date,
    r.doc.gist,
    ...r.parties.flatMap((p) => [p.name, p.role, p.note]),
    ...r.relations.flatMap((x) => [x.from, x.to, x.label]),
    ...r.facts.flatMap((f) => [f.when, f.what]),
    ...r.demands.flatMap((d) => [d.what, d.due]),
    ...r.clauses.flatMap((c) => [c.ref, c.gist]),
  ];
}

/**
 * 재조회할 법령 조문·사건번호 (중복 없이). 법제처로 나가는 문자열이라 사람 이름이 섞인 것은 보내지 않는다 —
 * 그 읽기 결과의 당사자 이름이나 scanInput이 찾은 이름이 든 후보는 빼고(→ 확인되지 않은 것으로 가린다) 보낸다 (절대 규칙 4).
 */
export function readingClaims(r: MatterReading): { statutes: string[]; cases: string[] } {
  const spans = readingTexts(r).flatMap(citationSpans);
  const names = r.parties.map((p) => squash(p.name)).filter((n) => n.length >= 2);
  // 법령 이름 앞쪽 낱말에 직함·로마자 이름이 있거나, 성씨 이름 꼴 낱말 바로 뒤에 직함이 오면 보내지 않는다
  // (당사자로 뽑히지 않은 이름까지). 성씨 꼴만으로는 막지 않는다 — "이용촉진"·"정보보호" 같은 법령 이름 낱말도 걸린다
  const hasPerson = (words: string[]) =>
    words.some(
      (w, i) =>
        PERSON_TITLE.test(w) ||
        LATIN_PERSON.test(w) ||
        (/^[가-힣]{2,4}$/.test(w) &&
          nameAfterRelation(w) !== null &&
          PERSON_TITLE.test(words[i + 1] ?? "")),
    );
  const safe = (c: string) =>
    !names.some((n) => c.includes(n)) &&
    !scanInput(c).findings.some((f) => f.type === "name") &&
    !hasPerson(c.split(" ").slice(0, -2));
  const of = (kind: Span["kind"]) => [
    ...new Set(
      spans
        .filter((s) => s.kind === kind)
        .flatMap((s) => s.candidates)
        .filter(safe),
    ),
  ];
  return { statutes: of("statute"), cases: of("case") };
}

/** 법제처가 확인한 후보 (없으면 null) */
const confirmedOf = (s: Span, verified: ReadonlySet<string>) =>
  s.candidates.find((c) => verified.has(c)) ?? null;

/**
 * 재조회 결과를 읽기 결과에 반영한다. verified = 법제처가 실존을 확인한 인용 문자열.
 * - 글(이름·날짜 포함): 확인되지 않은 조문·사건번호 자리를 UNCHECKED_* 로 바꾼다 (사실·요구는 남기고 번호만 내보내지 않는다).
 *   같은 글은 같게 바뀌므로 관계의 from·to와 당사자 이름은 계속 맞는다.
 * - 조항 목록: 이름(ref)에 확인되지 않은 인용이 하나라도 있으면 그 조항을 뺀다. 확인된 법령 조문에는 법제처 주소를 붙인다
 */
export function applyReadingChecks(
  r: MatterReading,
  verified: ReadonlySet<string>,
): { reading: MatterReading; removed: number } {
  let removed = 0;
  const fix = (s: string) => {
    const t = s.normalize("NFKC");
    let out = t;
    for (const sp of citationSpans(t).reverse()) {
      if (confirmedOf(sp, verified)) continue;
      removed += 1;
      const mark = sp.kind === "case" ? UNCHECKED_CASE : UNCHECKED_ARTICLE;
      out = `${out.slice(0, sp.index)}${mark}${out.slice(sp.index + sp.length)}`;
    }
    return out === t ? s : out;
  };
  const clauses: MatterReading["clauses"] = [];
  for (const c of r.clauses) {
    const spans = citationSpans(c.ref);
    const unchecked = spans.filter((s) => !confirmedOf(s, verified)).length;
    if (unchecked > 0) {
      removed += unchecked;
      continue;
    }
    const statute = spans.find((s) => s.kind === "statute");
    const m = statute && confirmedOf(statute, verified)?.match(/^(.+)\s(제\d+조(?:의\d+)?)$/);
    clauses.push({
      ref: c.ref,
      gist: fix(c.gist),
      ...(m && { url: statuteUrl(m[1], m[2]) }),
    });
  }
  const reading: MatterReading = {
    doc: {
      type: r.doc.type,
      title: fix(r.doc.title),
      date: fix(r.doc.date),
      gist: fix(r.doc.gist),
    },
    parties: r.parties.map((p) => ({
      ...p,
      name: fix(p.name),
      role: fix(p.role),
      note: fix(p.note),
    })),
    relations: r.relations.map((x) => ({ from: fix(x.from), to: fix(x.to), label: fix(x.label) })),
    facts: r.facts.map((f) => ({ when: fix(f.when), what: fix(f.what) })),
    demands: r.demands.map((d) => ({ what: fix(d.what), due: fix(d.due) })),
    clauses,
  };
  return { reading, removed };
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

/**
 * 모델로 보내는 글에서 가릴 이름을 서버가 저장된 사건 자료에서 직접 모은다 (브라우저가 보낸 목록에만 기대지 않는다).
 * 개인(person)은 모두, 그 밖의 종류도 상호·기관 표지 없이 사람 이름 꼴이면 넣는다(종류를 잘못 고른 경우).
 * "외부 공격자"·"이용자" 같은 집단 이름은 사람 이름 꼴이 아니라 넣지 않는다.
 */
export function maskNamesOf(data: MatterData, extra: string[] = []): string[] {
  const names = data.parties
    .filter((p) => p.kind === "person" || looksLikePersonName(p.name))
    .map((p) => p.name);
  return [...new Set([...names, ...extra])].slice(0, 120);
}

/** 사건 번호 (본문 matterId) — 가릴 이름을 서버가 모으는 데 쓴다 */
export function parseMatterId(body: unknown): string {
  const id = ((body ?? {}) as Record<string, unknown>).matterId;
  if (typeof id !== "string" || !UUID.test(id)) throw invalid("matterId", "format");
  return id;
}

/** 본문 { text, matterId, personNames? } — 쟁점 정리·요약 요청 */
export function parseTextRequest(
  body: unknown,
  maxChars: number,
): { text: string; matterId: string; personNames: string[] } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.text !== "string") throw invalid("text", "type");
  if (!b.text.trim()) throw new ApiError("EMPTY_INPUT");
  if (b.text.length > maxChars) throw invalid("text", "too_long");
  const names = Array.isArray(b.personNames)
    ? b.personNames.filter((n): n is string => typeof n === "string" && n.length <= 40).slice(0, 60)
    : [];
  return { text: b.text, matterId: parseMatterId(b), personNames: names };
}

// --- 기업 조사 ----------------------------------------------------------------------------

export const COMPANY_LIMITS = { nameChars: 60, urls: 4, pastedChars: 6_000 } as const;
export const COMPANY_NOTICE = "웹 검색·공개 자료 요약 · 출처를 직접 확인하세요";

export type CompanyRequest = {
  name: string;
  /** 사건 번호 — 서버가 그 사건의 당사자 이름을 직접 모아 가린다 (브라우저가 보낸 이름 목록에만 기대지 않는다) */
  matterId: string;
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

/** 로마자 사람 이름 꼴 ("Jane Doe", "Mary-Ann Lee") — 회사는 "Inc."·"Ltd." 같은 표지를 붙여 적게 한다 */
const LATIN_PERSON = /^[A-Z][a-z]+(?:[ .'-][A-Z][a-z]+){1,2}$/;

/** 상호·기관 표지(주식회사·㈜·Inc·법원·공단 등)가 있는 이름 */
export const hasBusinessMark = (name: string) => ORG_MARK.test(name) || AGENCY_MARK.test(name);

/**
 * 사람 이름 꼴인지 (기업 조사에서 받지 않는다, DEC-053). 표지가 있으면 사람 이름 꼴이 아니다.
 * 직함이 붙은 이름, 성씨로 시작하는 한글 두~네 글자 낱말은 사람으로 본다.
 * 성씨 목록·글자 모양만으로는 사람을 다 가려낼 수 없다(목록에 없는 성씨, 외국 이름, 로마자 이름) —
 * 그래서 표지 없는 이름은 사용자 확인(isBusiness)을 받고, 모델 지시문에도 "사람이면 조사하지 않는다"를 둔다.
 */
export function looksLikePersonName(name: string): boolean {
  if (hasBusinessMark(name)) return false;
  if (PERSON_TITLE.test(name)) return true;
  if (LATIN_PERSON.test(name.trim())) return true;
  return name.split(" ").some((w) => /^[가-힣]{2,4}$/.test(w) && nameAfterRelation(w) !== null);
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
  if (looksLikePersonName(name)) throw invalid("name", "not_business");
  // 표지가 없는 이름(예: "쿠팡")은 사용자가 회사·기관 이름이라고 확인해야 보낸다 — 허용 목록 방식 (DEC-053)
  if (!hasBusinessMark(name) && b.isBusiness !== true) throw invalid("name", "confirm_business");
  if (typeof b.matterId !== "string" || !UUID.test(b.matterId)) throw invalid("matterId", "format");
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
  return { name, matterId: b.matterId, urls, pasted, personNames, consent: b.consent === true };
}

/** 지시문이 정한 거절 값 — 이름이 사람을 가리키면 모델은 조사하지 않고 이것만 쓴다 */
export const COMPANY_REFUSAL = { refused: "person" } as const;
export const isCompanyRefusal = (v: unknown) =>
  typeof v === "object" && v !== null && (v as { refused?: unknown }).refused === "person";

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

/**
 * 직함 앞 낱말이 사람 이름 꼴인지 ("김가상 대표가", "Jane Doe CEO"). 직함 뒤에는 조사만 올 수 있다
 * ("대표적"·"이사회"는 직함이 아니다)
 */
const NAME_BEFORE_TITLE =
  /([가-힣]{2,4}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\s?(?:대표\s*이사|대표자|대표|회장|사장|부사장|이사|전무|상무|팀장|부장|과장|씨|님|CEO|CTO|CFO)(?=$|[^가-힣A-Za-z]|(?:이|가|은|는|을|를|의|와|과|도|께서|에게|로|으로|인|이며|이고|였|이었)(?:$|[^가-힣]))/g;
/** 사람 이름이 보이는 문장인지 (scanInput의 이름 + 직함 앞 이름 꼴) */
function mentionsPerson(t: string): boolean {
  if (scanInput(t).findings.some((f) => f.type === "name")) return true;
  for (const m of t.matchAll(NAME_BEFORE_TITLE)) {
    const w = m[1];
    if (/^[A-Z]/.test(w) || nameAfterRelation(w) !== null) return true;
  }
  return false;
}
/** 대표자 항목 ("대표자: 이름 (출처)") */
const OWNER_ITEM = /^대표자\s*[:：]/;
/** 대표자 항목으로 받는 꼴: 이름 + (출처 사이트)뿐. 숫자(나이·연도)·학력·경력 같은 내용이 붙으면 받지 않는다 */
const OWNER_ONLY =
  /^대표자\s*[:：]\s*(?:[가-힣]{2,10}|[A-Z][a-z]+(?: [A-Z][a-z]+){1,2})(?:\s*[(（][^\d()（）]{1,40}[)）])?$/;
const OWNER_DETAIL = /졸업|출신|학력|경력|나이|년생|생년|전직|역임|재직|약력|고향|가족/;

/**
 * 모델이 쓴 기업 조사 글을 거른다: 연락처 가림, 단정·평가 문장 제거, 길이·개수 한도.
 * 사람 이름은 basics의 "대표자: …" 한 항목에만 남을 수 있다 (사용자 결정 2026-11-24, DEC-053) —
 * 그 밖의 항목에서 사람 이름이 보이는 문장은 뺀다 (임직원·개인 이름을 내보내지 않는다).
 */
export function screenCompanyReport(raw: z.infer<typeof CompanyReportZ>): CompanyReport | null {
  const sentence = (s: string, max: number, allowOwner = false) => {
    const t = maskContacts(squash(s));
    if (!t || isAssertive(t) || EVALUATING.test(t) || isJudging(t)) return "";
    if (!(allowOwner && OWNER_ITEM.test(t)) && mentionsPerson(t)) return "";
    // 조문·사건번호(검증하지 않은 인용)가 든 문장은 뺀다 (절대 규칙 1).
    // 공개 자료에 적힌 대표자 이름은 basics의 "대표자:" 한 항목에만 남는다 — 본인 계정에만 저장·표시되는 자료다
    // (사용자 결정 2026-11-24, DEC-053, CLAUDE.md 절대 규칙 4의 예외). 연락처·번호는 위에서 가린다
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
  // 대표자 항목은 첫 하나만, "대표자: 이름 (출처)" 꼴만 (나이·학력·경력이나 다른 사람 이름이 붙으면 그 항목을 뺀다)
  const basicsOf = (arr: string[]) => {
    let owner = false;
    const out: string[] = [];
    for (const x of arr) {
      const isOwner = OWNER_ITEM.test(squash(x));
      if (isOwner && owner) continue;
      const t = sentence(x, 240, isOwner);
      if (!t) continue;
      if (isOwner) {
        if (!OWNER_ONLY.test(t) || OWNER_DETAIL.test(t)) continue;
        if (mentionsPerson(t.replace(OWNER_ITEM, "").replace(/^\s*\S+/, ""))) continue;
        owner = true;
      }
      out.push(t);
      if (out.length >= 8) break;
    }
    return out;
  };
  const report: CompanyReport = {
    overview: para(raw.overview, 900),
    products: items(raw.products, 8),
    business: para(raw.business, 700),
    items: items(raw.items, 8),
    basics: basicsOf(raw.basics),
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
