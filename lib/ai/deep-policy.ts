// DeepSearch 심층 분석 — 순수 규칙 (DEC-041). 여러 사정이 얽힌 사연을 "구조화 → 쟁점별 검색 → 쟁점별 답변 → 시각화"로 다룬다.
// - 구조(당사자·사실 순서·쟁점·확인할 사실)는 Haiku 1회가 뽑고, 여기서 거른 뒤에만 검색어·화면에 쓴다.
// - 구조에는 사용자가 적은 사실만 담는다. 질문에 없는 숫자·단정 표현·개인정보 패턴·조문이나 사건번호가 든 항목은 버린다
//   (절대 규칙 1·2·3·4). 법률 판단은 구조에 넣지 않는다 — 판단은 인용 검증을 거치는 답변 문단에만 있다.
// - 시각자료(사건 구조도 등)는 이 구조와 검증을 통과한 문단으로 코드가 그린다. 그림을 위해 모델을 더 부르지 않는다.
import { z } from "zod";
import { scanInput } from "@/lib/pii";
import { MODEL_SOURCE, citationsIn, isAssertive, safeQuery, sourceEnum } from "./policy";

export const DEEP_LIMITS = {
  parties: 4,
  events: 8,
  issues: 4,
  unknowns: 5,
  /** 쟁점마다 고정 법령에서 가져올 조문 수 */
  articlesPerIssue: 2,
  /** 답변 모델에 넘겨 볼 근거 (비용 상한을 넘으면 뒤에서부터 뺀다) */
  articles: 10,
  cases: 5,
  /** 쟁점마다 답변 문단 수 */
  pointsPerIssue: 3,
} as const;

const Str = z.string();
export const DeepStructZ = z.object({
  parties: z.array(z.object({ label: Str, role: Str })),
  events: z.array(z.object({ when: Str, who: Str, what: Str })),
  issues: z.array(
    z.object({ title: Str, lawName: Str, lawKeywords: z.array(Str), caseQuery: Str }),
  ),
  unknowns: z.array(Str),
  lawQuery: Str,
});
export type DeepStructRaw = z.infer<typeof DeepStructZ>;

const strings = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

/** 고정 객체라 요청마다 같다 */
export const DEEP_STRUCT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["parties", "events", "issues", "unknowns", "lawQuery"],
  properties: {
    parties: {
      type: "array",
      description: "사연에 나오는 당사자. 이름이 아니라 관계로 (임차인, 임대인, 회사 등)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "role"],
        properties: {
          label: { type: "string", description: "당사자를 부르는 말 (예: 임차인)" },
          role: { type: "string", description: "사연에서의 위치 (예: 질문자, 상대방)" },
        },
      },
    },
    events: {
      type: "array",
      description: "사연에 적힌 사실을 일어난 순서대로. 적히지 않은 사실은 넣지 않는다",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["when", "who", "what"],
        properties: {
          when: { type: "string", description: "사연에 적힌 시점 표현 그대로. 없으면 빈 문자열" },
          who: { type: "string", description: "parties의 label 중 하나" },
          what: { type: "string", description: "한 일이나 일어난 일 (한 문장)" },
        },
      },
    },
    issues: {
      type: "array",
      description: "따로 살펴봐야 할 법률 쟁점. 서로 겹치지 않게",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "lawName", "lawKeywords", "caseQuery"],
        properties: {
          title: {
            type: "string",
            description: "쟁점을 묻는 짧은 말, 30자 이내 (예: 계약이 갱신된 것으로 보는지)",
          },
          lawName: { type: "string", description: "이 쟁점을 다루는 법률의 정식 이름 하나" },
          lawKeywords: strings("그 법률 조문 제목·본문에 쓰이는 낱말 1~3개"),
          caseQuery: { type: "string", description: "판례 검색어. 법률 용어 두세 낱말" },
        },
      },
    },
    unknowns: strings("답이 달라질 수 있는데 사연에 적히지 않은 사실. 질문 형태로"),
    lawQuery: { type: "string", description: "사연 전체를 법률 용어로 바꾼 법령 검색 문장" },
  },
} as const;

export type DeepIssue = {
  title: string;
  lawName: string | null;
  lawKeywords: string[];
  caseQuery: string | null;
};

export type DeepStruct = {
  parties: { label: string; role: string }[];
  events: { when: string; who: string; what: string }[];
  issues: DeepIssue[];
  unknowns: string[];
  lawQuery: string | null;
};

const squash = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 문자열 안의 숫자가 모두 질문에 그대로 있는지 (질문에 없는 숫자를 만들어 넣지 못하게, 절대 규칙 3) */
function numbersFromQuestion(s: string, question: string): boolean {
  // 숫자는 낱말 단위로 비교한다 — "1,500,000원"의 500이 "500만 원"을 허용하지 않게. 가린 자리표시([이름1])의 숫자는 뺀다
  const tokens = (t: string) => t.match(/\d+(?:[.,]\d+)*/g) ?? [];
  const allowed = new Set(tokens(question.normalize("NFKC").replace(/\[[^\]]*\]/g, " ")));
  return tokens(s.normalize("NFKC")).every((n) => allowed.has(n));
}

/** 화면에 나가는 구조 문구 한 줄. 통과하지 못하면 null */
function cleanText(raw: string, max: number, question: string): string | null {
  const t = squash(raw);
  if (t.length < 2 || t.length > max) return null;
  if (scanInput(t).findings.length > 0) return null;
  if (isAssertive(t) || !numbersFromQuestion(t, question)) return null;
  const cited = citationsIn(t);
  if (cited.articles.length > 0 || cited.cases.length > 0) return null;
  return t;
}

/** 쟁점 제목 글자 수 상한. 지시문은 30자 이내를 요구하고, 넘더라도 이 길이까지는 받는다 */
export const ISSUE_TITLE_MAX = 60;

const LAW_NAME = /^[가-힣ㆍ· ]{1,40}(?:법률|법|령|규칙)$/;

/**
 * 모델이 뽑은 구조를 거른다. 버린 항목은 조용히 빠진다 — 구조가 비어도 분석은 일반 방식으로 계속된다.
 * 쟁점 제목은 화면에 나가고, 법령 이름·낱말·판례 검색어는 법제처 검색에만 쓴다.
 */
export function screenStruct(raw: DeepStructRaw, maskedText: string): DeepStruct {
  const parties: DeepStruct["parties"] = [];
  for (const p of raw.parties) {
    const label = cleanText(p.label, 16, maskedText);
    const role = cleanText(p.role, 20, maskedText) ?? "";
    if (label && !parties.some((x) => x.label === label)) parties.push({ label, role });
    if (parties.length >= DEEP_LIMITS.parties) break;
  }
  const labels = new Set(parties.map((p) => p.label));

  const events: DeepStruct["events"] = [];
  for (const e of raw.events) {
    const what = cleanText(e.what, 90, maskedText);
    if (!what) continue;
    // 시점을 적었는데 통과하지 못하면(질문에 없는 숫자 등) 그 사실을 통째로 버린다 — 지어낸 시점일 수 있다
    const when = squash(e.when) ? cleanText(e.when, 24, maskedText) : "";
    if (when === null) continue;
    const who = squash(e.who);
    events.push({
      when,
      who: labels.has(who) ? who : "",
      what,
    });
    if (events.length >= DEEP_LIMITS.events) break;
  }

  const issues: DeepIssue[] = [];
  for (const i of raw.issues) {
    // 긴 사연에서는 모델이 40자를 넘는 쟁점 제목을 자주 써서 쟁점이 모두 버려졌다(2026-11-25 실호출 — 일반 답변으로 내려감).
    // 화면에 두 줄까지는 괜찮으니 ISSUE_TITLE_MAX까지 받는다
    const title = cleanText(i.title, ISSUE_TITLE_MAX, maskedText);
    if (!title || issues.some((x) => x.title === title)) continue;
    const lawName = squash(i.lawName);
    const lawKeywords = i.lawKeywords
      .map((k) => safeQuery(k))
      .filter((k): k is string => !!k && k.length <= 20 && !/\d/.test(k))
      .slice(0, 3);
    const caseQuery = safeQuery(i.caseQuery);
    issues.push({
      title,
      lawName: LAW_NAME.test(lawName) ? lawName : null,
      lawKeywords,
      caseQuery: caseQuery && caseQuery.length <= 30 && !/\d/.test(caseQuery) ? caseQuery : null,
    });
    if (issues.length >= DEEP_LIMITS.issues) break;
  }

  const unknowns: string[] = [];
  for (const u of raw.unknowns) {
    const t = cleanText(u, 70, maskedText);
    if (t && !unknowns.includes(t)) unknowns.push(t);
    if (unknowns.length >= DEEP_LIMITS.unknowns) break;
  }

  const lawQuery = safeQuery(raw.lawQuery);
  return {
    parties,
    events,
    issues,
    unknowns,
    lawQuery: lawQuery && lawQuery.length >= 5 && !/\d/.test(lawQuery) ? lawQuery : null,
  };
}

// ── 답변 출력 (쟁점 번호가 붙은 문단) ────────────────────────────

export const DeepAnswerZ = z.object({
  points: z.array(
    z.object({ issue: z.number().int(), text: z.string(), source: z.string(), quote: z.string() }),
  ),
});
export type DeepDraftPoint = z.infer<typeof DeepAnswerZ>["points"][number];

/** 출처는 이번 요청의 근거 키 중 하나 또는 MODEL_SOURCE(DEC-055), 쟁점은 구조에서 뽑은 번호 중 하나만 고를 수 있다 */
export function deepAnswerSchema(keys: string[], issueCount: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["points"],
    properties: {
      points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["issue", "text", "source", "quote"],
          properties: {
            issue: {
              type: "integer",
              enum: Array.from({ length: Math.max(1, issueCount) }, (_, i) => i + 1),
              description: "이 문단이 답하는 쟁점 번호",
            },
            text: { type: "string", description: "답변 문단" },
            source: {
              type: "string",
              enum: sourceEnum(keys),
              description: `이 문단의 근거 키. 근거 목록에 없는 내용이면 "${MODEL_SOURCE}"`,
            },
            quote: {
              type: "string",
              description: `근거 원문에서 글자 그대로 옮긴 20~60자 구절. source가 "${MODEL_SOURCE}"면 빈 문자열`,
            },
          },
        },
      },
    },
  };
}

// ── 화면에 보내는 사건 구조 ─────────────────────────────────────

/** API.md DemoAnalysisResult.deep — 시각자료의 재료. 쟁점의 points는 answer.points의 순번이다 */
export type DeepMap = {
  parties: { label: string; role: string }[];
  events: { when: string; who: string; what: string }[];
  issues: { title: string; points: number[] }[];
  unknowns: string[];
};

/**
 * 구조 + (쟁점 번호가 붙은) 초안 문단 + 검증을 통과해 남은 문단 → 화면용 사건 구조.
 * 문단은 글자가 같은 것으로 다시 찾는다 — 검증에서 빠진 문단은 쟁점에서도 빠진다.
 */
export function buildDeepMap(
  struct: DeepStruct,
  drafted: { issue: number; text: string }[],
  finalPoints: { text: string }[],
): DeepMap {
  const issueOf = new Map(drafted.map((d) => [d.text.trim(), d.issue]));
  const issues = struct.issues.map((i) => ({ title: i.title, points: [] as number[] }));
  finalPoints.forEach((p, index) => {
    const n = issueOf.get(p.text.trim());
    if (n && issues[n - 1]) issues[n - 1].points.push(index);
  });
  return { parties: struct.parties, events: struct.events, issues, unknowns: struct.unknowns };
}

/** 저장된 결과를 다시 읽을 때 형식 확인 (모양이 다르면 그림을 그리지 않는다) */
export function parseDeepMap(v: unknown): DeepMap | null {
  const ok = z
    .object({
      parties: z.array(z.object({ label: Str, role: Str })),
      events: z.array(z.object({ when: Str, who: Str, what: Str })),
      issues: z.array(z.object({ title: Str, points: z.array(z.number().int().min(0)) })),
      unknowns: z.array(Str),
    })
    .safeParse(v);
  return ok.success && ok.data.issues.length > 0 ? ok.data : null;
}
