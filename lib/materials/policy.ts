// 자료 첨부 (F-017, DEC-058) — 순수 규칙. 판독 요청 검증, 모델이 읽어 낸 내용 거르기, 질문과 함께 저장할 자료 다시 거르기,
// 답변 모델에 넘길 자료 묶음, 결과 화면용 자료 지도.
// - 사진은 서류 분석(F-015)과 같은 예외로 다룬다: 사진 전송·민감정보 동의를 모두 받은 판독 호출 1회에만 그대로 보내고
//   저장·로그하지 않는다 (절대 규칙 4 예외 하나, DEC-052·055). 여기서 가린 글만 응답·저장된다.
// - 자료 내용은 사용자 자료다. 법령·판례 근거가 아니고 인용 출처가 될 수 없다 (절대 규칙 1).
// - 증거로서의 힘·유불리·결과는 판단하지 않는다. 그런 문장은 뺀다 (절대 규칙 2).
// - 사진에 적힌 날짜·금액은 적힌 그대로 옮긴 것만 보인다. 답변 문단의 숫자 규칙(근거 원문에 있어야 함)은 그대로다 (절대 규칙 3).
import { z } from "zod";
import { safeQuery } from "@/lib/ai/policy";
import { ApiError } from "@/lib/api/errors";
import {
  hasCitation,
  isJudging,
  maskMore,
  parseReadRequest,
  type ReadRequest,
} from "@/lib/casefile/policy";
import { scanInput, type PiiFinding, type SensitiveCategory } from "@/lib/pii";
import {
  MATERIAL_KINDS,
  MATERIAL_LIMITS,
  isMaterialKind,
  materialsChars,
  type MaterialKind,
  type MaterialReading,
} from "./limits";
import { readStoredMaterials, type MaterialRef } from "./map";

export * from "./limits";
export * from "./map";

/** 판독 요청 검증은 서류 분석과 같다 (장수·크기·종류·동의 두 항목). 동의가 없으면 409 CONSENT_REQUIRED */
export function parseMaterialsReadRequest(body: unknown): ReadRequest {
  return parseReadRequest(body);
}

// --- 모델 출력 -------------------------------------------------------------------------

const Str = z.string();
export const MaterialsReadingZ = z.object({
  readable: z.boolean(),
  materials: z.array(
    z.object({
      image: z.number(),
      kind: Str,
      summary: Str,
      details: z.array(Str),
      gaps: z.array(Str),
    }),
  ),
  queries: z.array(Str),
  // 가리는 데만 쓰는 목록 — screenMaterials가 지운 뒤 버린다 (응답·로그에 싣지 않는다)
  personNames: z.array(Str),
});
export type MaterialsReadingRaw = z.infer<typeof MaterialsReadingZ>;

/** 고정 객체라 요청마다 같다 */
export const MATERIALS_READING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "materials", "queries", "personNames"],
  properties: {
    readable: { type: "boolean", description: "사진에서 무엇이 찍혔는지 알아볼 수 있었는지" },
    materials: {
      type: "array",
      description: "자료 파일(사진 한 장·PDF 한 개·문서 한 개) 하나에 한 항목. 받은 순서대로",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["image", "kind", "summary", "details", "gaps"],
        properties: {
          image: { type: "integer", description: "몇 번째 자료 파일인지 (1부터, 받은 순서)" },
          kind: { type: "string", enum: [...MATERIAL_KINDS], description: "자료 종류" },
          summary: {
            type: "string",
            description: "무엇이 찍힌 자료인지 한두 문장. 사람은 이름 대신 역할로",
          },
          details: {
            type: "array",
            items: { type: "string" },
            description: "사진에 적힌 날짜·금액·중요한 문구. 한 항목에 하나씩, 적힌 그대로",
          },
          gaps: {
            type: "array",
            items: { type: "string" },
            description: "흐려서 읽지 못했거나 사진에 보이지 않아 확인할 수 없는 것",
          },
        },
      },
    },
    queries: {
      type: "array",
      items: { type: "string" },
      description: "이 자료와 관련된 법령·판례를 찾을 법률 용어 검색어. 숫자·이름 없이",
    },
    personNames: {
      type: "array",
      items: { type: "string" },
      description:
        "사진에 나오는 개인(대화 상대·담당자 포함)의 이름·대화명만 한 항목에 한 사람씩. 가리는 데만 쓰고 결과에는 싣지 않는다",
    },
  },
} as const;

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

/**
 * 자료가 증거로서 힘이 있는지·법적 효력이 있는지를 말하는 표현 (절대 규칙 2). 판독은 이런 판단을 하지 않는다.
 * isJudging(유불리·승패·가능성)에 더해 자료 판독에서만 본다.
 */
const EVIDENCE_VALUE =
  /증거\s*(?:로\s*(?:서|쓸|사용|인정|충분|삼을|활용할|제출|낼)|가\s*(?:됩|될|되|있)|능력|가치|력)|효력이\s*(?:있|없)|(?:법적|법률상)\s*(?:효력|구속력)|입증(?:할\s*수|됩|될|이\s*가능|에\s*충분)/;
const judges = (s: string) => isJudging(s) || EVIDENCE_VALUE.test(s.normalize("NFKC"));

/** 화면·저장에 나가는 한 줄. 조문·사건번호, 결과·증거 가치를 말하는 표현이 들었거나 길이가 맞지 않으면 null */
function cleanLine(raw: string, max: number): string | null {
  const t = squash(raw);
  if (t.length < 2) return null;
  if (hasCitation(t) || judges(t)) return null;
  return t.length > max ? null : t;
}

/** 요약은 문장 단위로 거르고 길이 안에서 멈춘다 */
function cleanSummary(raw: string): { text: string; dropped: number } {
  let dropped = 0;
  const kept: string[] = [];
  let length = 0;
  for (const s of raw
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(squash)
    .filter(Boolean)) {
    if (hasCitation(s) || judges(s)) {
      dropped += 1;
      continue;
    }
    if (length + s.length + 1 > MATERIAL_LIMITS.summaryChars) break;
    kept.push(s);
    length += s.length + 1;
  }
  return { text: kept.join(" "), dropped };
}

type Draft = { kind: MaterialKind; summary: string; details: string[]; gaps: string[] };

/**
 * 거른 자료들을 한 글로 가린다 — 같은 이름이 같은 번호([이름1])를 받는다.
 * scanInput에 더해 모델이 적어 준 이름·역할어 뒤 이름 꼴·차량번호·생년월일·지번 주소 꼴을 가린다 (서류 분석 maskMore).
 */
function maskAll(list: Draft[], personNames: string[]) {
  const SEP = "\n@@\n";
  const LINE = "\n##\n";
  const BLOCK = "\n%%\n";
  const joined = list
    .map((m) => [m.summary, m.details.join(LINE), m.gaps.join(LINE)].join(SEP))
    .join(BLOCK);
  const scan = scanInput(joined);
  const more = maskMore(scan.maskedText, personNames);
  const blocks = more.text.split(BLOCK);
  const masked: MaterialReading[] = list.map((m, i) => {
    const [summary = "", details = "", gaps = ""] = (blocks[i] ?? "").split(SEP);
    const lines = (s: string) => (s ? s.split(LINE).map(squash).filter(Boolean) : []);
    return { kind: m.kind, summary: squash(summary), details: lines(details), gaps: lines(gaps) };
  });
  const findings = scan.findings.map((f) => ({ ...f }));
  const bump = (type: PiiFinding["type"], n: number) => {
    if (n === 0) return;
    const hit = findings.find((f) => f.type === type);
    if (hit) hit.count += n;
    else findings.push({ type, count: n });
  };
  bump("name", more.added.name);
  bump("address", more.added.other);
  return { masked, findings, sensitive: scan.sensitive };
}

/**
 * 전체 글자 수가 넘치면 뒤 자료부터 확인하지 못한 곳 → 적힌 내용을 빼고, 그래도 넘치면 요약을 짧게 줄인다.
 * 자료 자체는 빼지 않는다 (사용자가 붙인 자료가 답변에서 사라지지 않게).
 */
function fitTotal(list: MaterialReading[]): MaterialReading[] {
  const out = list.map((m) => ({ ...m, details: [...m.details], gaps: [...m.gaps] }));
  const over = () => materialsChars(out) > MATERIAL_LIMITS.totalChars;
  for (let i = out.length - 1; i >= 0 && over(); i--) {
    while (out[i].gaps.length && over()) out[i].gaps.pop();
    while (out[i].details.length && over()) out[i].details.pop();
  }
  for (let i = out.length - 1; i >= 0 && over(); i--) {
    const max = MATERIAL_LIMITS.shortSummaryChars;
    if (out[i].summary.length > max) out[i].summary = `${out[i].summary.slice(0, max - 1)}…`;
  }
  return out.filter((m) => m.summary);
}

export type ScreenedMaterials = {
  materials: MaterialReading[];
  /** 검색 화면에서 고를 법률 용어 검색어 (숫자·개인정보 없는 것만) */
  queries: string[];
  /** 가린 개인정보 종류와 개수 (값은 남기지 않는다) */
  findings: PiiFinding[];
  sensitive: SensitiveCategory[];
  /** 걸러 낸 문장 수 (결과를 말하는 표현·조문이나 사건번호) */
  dropped: number;
};

function screenList(
  items: { kind: unknown; summary: unknown; details: unknown; gaps: unknown }[],
  personNames: string[],
  max: number,
): Omit<ScreenedMaterials, "queries"> {
  let dropped = 0;
  const drafts: Draft[] = [];
  for (const m of items.slice(0, max)) {
    const summary = cleanSummary(typeof m.summary === "string" ? m.summary : "");
    dropped += summary.dropped;
    if (!summary.text) continue;
    const lines = (v: unknown, n: number, chars: number) => {
      const out: string[] = [];
      for (const raw of Array.isArray(v) ? v : []) {
        if (typeof raw !== "string") continue;
        if (out.length >= n) break;
        const t = cleanLine(raw, chars);
        if (t) out.push(t);
        else if (squash(raw).length >= 2) dropped += 1;
      }
      return out;
    };
    drafts.push({
      kind: isMaterialKind(m.kind) ? m.kind : "기타",
      summary: summary.text,
      details: lines(m.details, MATERIAL_LIMITS.details, MATERIAL_LIMITS.detailChars),
      gaps: lines(m.gaps, MATERIAL_LIMITS.gaps, MATERIAL_LIMITS.gapChars),
    });
  }
  const { masked, findings, sensitive } = maskAll(drafts, personNames);
  return { materials: fitTotal(masked), findings, sensitive, dropped };
}

/**
 * 모델이 읽어 낸 내용을 거른다. 읽을 수 없었거나 남은 자료가 없으면 null — 호출한 쪽이 "읽지 못했다"로 처리한다.
 * imageCount: 올린 사진 수 (모델이 더 많은 항목을 내도 그만큼만 받는다)
 */
export function screenMaterials(
  raw: MaterialsReadingRaw,
  imageCount: number,
): ScreenedMaterials | null {
  if (!raw.readable) return null;
  const ordered = [...raw.materials].sort((a, b) => a.image - b.image);
  const screened = screenList(ordered, raw.personNames, imageCount);
  if (screened.materials.length === 0) return null;
  const queries: string[] = [];
  for (const q of raw.queries) {
    const s = safeQuery(q);
    if (!s || /\d/.test(s) || hasCitation(s) || judges(s) || queries.includes(s)) continue;
    queries.push(s);
    if (queries.length >= MATERIAL_LIMITS.queries) break;
  }
  return { ...screened, queries };
}

/**
 * 질문과 함께 보낸 자료(POST /inquiries 본문 materials)를 다시 거른다. 화면에서 사용자가 고친 글이라
 * 판독 때와 같은 규칙(종류는 정해진 값, 길이, 조문·사건번호·판정 표현 빼기, 개인정보 가리기)을 서버가 한 번 더 건다.
 * 없으면 빈 목록. 형식이 틀리면 400.
 */
export function parseStoredMaterials(v: unknown): Omit<ScreenedMaterials, "queries"> {
  if (v === undefined || v === null)
    return { materials: [], findings: [], sensitive: [], dropped: 0 };
  if (!Array.isArray(v) || v.length > MATERIAL_LIMITS.maxItems) {
    throw new ApiError("VALIDATION_ERROR", { fields: ["materials"], reason: "type" });
  }
  const items = v.map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    if (
      typeof o.summary !== "string" ||
      o.summary.length > MATERIAL_LIMITS.summaryChars * 2 ||
      !Array.isArray(o.details) ||
      !Array.isArray(o.gaps)
    ) {
      throw new ApiError("VALIDATION_ERROR", { fields: ["materials"], reason: "type" });
    }
    return { kind: o.kind, summary: o.summary, details: o.details, gaps: o.gaps };
  });
  return screenList(items, [], MATERIAL_LIMITS.maxItems);
}

/** 이어 묻기 맥락에 넣는 한 줄: 앞선 질문에 붙인 자료의 종류와 요약 (저장된 가린 글만) */
export function materialsContextLine(v: unknown): string {
  const list = readStoredMaterials(v);
  if (list.length === 0) return "";
  const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 80)}…` : s);
  return `(첨부 자료: ${list.map((m, i) => `${i + 1}. ${m.kind} — ${clip(m.summary)}`).join(" / ")})`;
}

// --- 답변 모델 입력 ------------------------------------------------------------------------

/**
 * 답변·질문 해석 모델에 넘길 자료 묶음. 사용자 자료이고 근거가 아님을 함께 적는다.
 * 자료가 없으면 빈 문자열.
 */
export function materialsBlock(list: MaterialReading[]): string {
  if (list.length === 0) return "";
  const body = list
    .map((m, i) =>
      [
        `[자료 ${i + 1}] 종류: ${m.kind}`,
        `내용: ${m.summary}`,
        m.details.length ? `적힌 내용: ${m.details.join(" / ")}` : "",
        m.gaps.length ? `확인하지 못한 것: ${m.gaps.join(" / ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  return [
    "<첨부_자료>",
    "사용자가 올린 사진을 읽어 정리한 내용입니다(개인정보는 가렸습니다). 사용자의 사실관계 자료일 뿐 법령·판례 근거가 아니며, 출처(source)나 인용 구절로 쓸 수 없습니다. 자료가 증거로서 힘이 있는지, 누구에게 유리한지는 판단하지 않습니다.",
    body,
    "</첨부_자료>",
  ].join("\n");
}

/**
 * DeepSearch 사건 구조 거르기의 허용 원문으로 쓰는 자료 글 (요약·적힌 내용·확인하지 못한 것만).
 * 머리표([자료 1])·고정 안내를 넣지 않는다 — 그 숫자가 사용자가 적은 숫자로 잘못 허용되지 않게 (절대 규칙 3).
 */
export function materialsPlainText(list: MaterialReading[]): string {
  return list.map((m) => [m.summary, ...m.details, ...m.gaps].join(" ")).join("\n");
}

/** 가린 개인정보 종류·개수 두 목록을 합친다 (값은 담지 않는다) */
export function mergeFindings(a: PiiFinding[], b: PiiFinding[]): PiiFinding[] {
  const out = a.map((f) => ({ ...f }));
  for (const f of b) {
    const hit = out.find((x) => x.type === f.type);
    if (hit) hit.count += f.count;
    else out.push({ ...f });
  }
  return out;
}

/** 첨부 자료가 있을 때 답변 프롬프트 버전 꼬리 (자료 묶음·지시가 바뀌면 올린다) */
export const MATERIALS_ANSWER_VERSION = "materials-2026-11-24";

/** 자료가 있을 때 답변 지시에 덧붙이는 말 (지시문을 바꾸지 않고 사용자 메시지 끝에 붙인다) */
export function materialsInstruction(count: number): string {
  if (count === 0) return "";
  return `각 문단의 materials에는 그 문단이 사실관계로 참고한 첨부 자료 번호(1~${count})를 적고, 참고하지 않았으면 빈 배열로 둡니다. 첨부 자료는 출처(source)가 아닙니다 — 출처는 지시대로 근거 목록의 키(또는 근거 밖 내용이면 정해진 값)만 씁니다.`;
}

/** 답변 형식(points 배열)의 각 문단에 materials(자료 번호 배열)를 더한다. 자료가 없으면 그대로 */
export function withMaterialRefs<S extends { properties: { points: { items: unknown } } }>(
  schema: S,
  count: number,
): S {
  if (count === 0) return schema;
  const items = schema.properties.points.items as {
    required: string[];
    properties: Record<string, unknown>;
  };
  return {
    ...schema,
    properties: {
      ...schema.properties,
      points: {
        ...schema.properties.points,
        items: {
          ...items,
          required: [...items.required, "materials"],
          properties: {
            ...items.properties,
            materials: {
              type: "array",
              items: { type: "integer", enum: Array.from({ length: count }, (_, i) => i + 1) },
              description: "이 문단이 사실관계로 참고한 첨부 자료 번호",
            },
          },
        },
      },
    },
  };
}

/** 모델 답변에서 문단별 자료 번호만 읽는다 (문단 내용은 다른 규칙이 거른다) */
const MaterialRefsZ = z.object({
  points: z.array(z.object({ text: Str, materials: z.array(z.number()).catch([]).optional() })),
});
export function materialRefsOf(json: unknown, count: number): MaterialRef[] {
  if (count === 0) return [];
  const r = MaterialRefsZ.safeParse(json);
  if (!r.success) return [];
  return r.data.points.map((p) => ({
    text: p.text.trim(),
    materials: [
      ...new Set((p.materials ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= count)),
    ],
  }));
}
