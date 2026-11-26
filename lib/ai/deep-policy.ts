// DeepSearch 심층 분석 — 순수 규칙 (DEC-041). 여러 사정이 얽힌 사연을 "구조화 → 쟁점별 검색 → 쟁점별 답변 → 시각화"로 다룬다.
// - 구조(당사자·사실 순서·쟁점·확인할 사실)는 Haiku 1회가 뽑고, 여기서 거른 뒤에만 검색어·화면에 쓴다.
// - 구조에는 사용자가 적은 사실만 담는다. 질문에 없는 숫자·단정 표현·개인정보 패턴·조문이나 사건번호가 든 항목은 버린다
//   (절대 규칙 1·2·3·4). 법률 판단은 구조에 넣지 않는다 — 판단은 인용 검증을 거치는 답변 문단에만 있다.
// - 시각자료(사건 구조도 등)는 이 구조와 검증을 통과한 문단으로 코드가 그린다. 그림을 위해 모델을 더 부르지 않는다.
import { z } from "zod";
import { scanInput } from "@/lib/pii";
import type { DocumentKind } from "@/lib/procedure/steps";
import {
  MODEL_SOURCE,
  citationsIn,
  isAssertive,
  numberTokens,
  safeQuery,
  sourceEnum,
} from "./policy";

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
  // 한글 수사 기간("두 달", "열흘")도 사용자가 적은 것만 (절대 규칙 3, DEC-062 legal-reviewer)
  const asked = new Set(numberTokens(question).words);
  if (numberTokens(t).words.some((w) => !asked.has(w))) return null;
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
  /** 사건 정리판 (DEC-062). 없으면 정리판 없이 그린다 — 예전 결과·일반 답변으로 내려간 경우 */
  plan: z
    .object({
      kinds: z.array(z.string()),
      sides: z.array(
        z.object({ party: Str, side: Str, actions: z.array(Str), stance: Str.optional() }),
      ),
      prep: z.array(z.object({ item: Str, why: Str })),
      // DEC-065: 예상 반론과 대응, 지금 작성할 문서
      rebuttals: z
        .array(z.object({ issue: z.number().int(), by: Str, point: Str, reply: Str }))
        .optional(),
      docs: z.array(z.object({ kind: Str, why: Str })).optional(),
    })
    .optional(),
});
export type DeepDraftPoint = z.infer<typeof DeepAnswerZ>["points"][number];
export type DeepPlanRaw = NonNullable<z.infer<typeof DeepAnswerZ>["plan"]>;

// ── 사건 정리판 (DEC-062): 사건 종류 · 당사자 자리와 대응 · 준비 자료 ─────────────
// 100자를 넘는 질문의 7개 탭(개요·자료·사실관계·구조도·쟁점·리서치·노트) 그림 재료. 답변 모델이 함께 낸다.
// 판정(승패·유불리·책임 비율)은 담지 않는다. 대응 문장은 상담 의견이라 허용하지만(DEC-055) 단정 표현·질문에 없는 숫자·
// 조문/사건번호(근거 문단에만 있어야 검증된다)·개인정보 꼴은 그 줄째 버린다.

/** 사건 종류. 화면 이름은 고정 문안 */
export const CASE_KINDS = {
  civil: "민사",
  criminal: "형사",
  administrative: "행정",
  family: "가사",
  labor: "노동",
  other: "기타",
} as const;
export type CaseKind = keyof typeof CASE_KINDS;

/** 당사자가 절차에서 서는 자리. 판정이 아니라 사연에서의 위치다 */
export const CASE_SIDES = {
  claimant: "청구하는 쪽 (원고·신청인)",
  respondent: "청구받는 쪽 (피고·피신청인)",
  complainant: "고소·신고하는 쪽",
  accused: "고소·신고당한 쪽",
  agency: "행정기관·공공기관",
  third: "그 밖의 관계인",
} as const;
export type CaseSide = keyof typeof CASE_SIDES;

export const PLAN_LIMITS = {
  kinds: 3,
  sides: 4,
  actions: 4,
  prep: 8,
  rebuttals: 6,
  docs: 3,
} as const;

/**
 * 지금 내용으로 작성해 볼 문서 (DEC-065). 햄찌법원 문서 작성 화면(/documents/[kind])이 있는 서식만 고를 수 있다.
 * 이름은 고정 문안이다.
 */
export const PLAN_DOCS = {
  "demand-letter": "내용증명",
  complaint: "소장",
  "payment-order": "지급명령 신청서",
  "criminal-complaint": "고소장",
  "compensation-order": "배상명령 신청서",
  "lease-registration": "임차권등기명령 신청서",
  "wage-petition": "임금체불 진정서",
  "dismissal-remedy": "부당해고 구제신청서",
  "civil-mediation": "민사조정 신청서",
} as const satisfies Partial<Record<DocumentKind, string>>;
export type PlanDocKind = keyof typeof PLAN_DOCS;

/** 정리판은 판정을 담지 않는다 (DEC-062): 유불리·승패·가능성·책임 크기 표현이 든 줄은 버린다 */
const PLAN_JUDGMENT =
  /유리|불리|승산|승소|패소|승패|우세|이길|이기[기는]|이긴다|질 수|질 것|진다|패할|기각|받아들여지|인정되(?:기 어렵|지 않)|가능성|확률|책임이\s*(?:크|작|더|많|적|있|없)/;
const planText = (raw: string, max: number, question: string): string | null => {
  const t = cleanText(raw, max, question);
  return t && !PLAN_JUDGMENT.test(t) ? t : null;
};

export type DeepPlan = {
  kinds: CaseKind[];
  /** stance = 그 당사자가 내세우는 입장 한 문장 (DEC-065) */
  sides: { party: string; side: CaseSide; actions: string[]; stance?: string }[];
  prep: { item: string; why: string }[];
  /** 쟁점마다 상대방이 내세울 수 있는 예상 반론과 대응 방향 (DEC-065). issue는 쟁점 번호(1부터) */
  rebuttals?: { issue: number; by: string; point: string; reply: string }[];
  /** 지금 내용으로 작성해 볼 문서 (DEC-065) */
  docs?: { kind: PlanDocKind; why: string }[];
};

/** 답변 모델이 낸 정리판을 거른다. 당사자는 구조에서 뽑은 이름만, 숫자는 사용자가 적은 글에 있는 것만 */
export function screenPlan(
  raw: DeepPlanRaw | undefined,
  partyLabels: string[],
  question: string,
  /** 쟁점 수. 주면 예상 반론의 쟁점 번호를 이 범위로 거른다 */
  issueCount?: number,
): DeepPlan | null {
  if (!raw) return null;
  const kinds = [
    ...new Set(raw.kinds.filter((k): k is CaseKind => Object.hasOwn(CASE_KINDS, k))),
  ].slice(0, PLAN_LIMITS.kinds);
  const labels = new Set(partyLabels);
  const sides: DeepPlan["sides"] = [];
  for (const s of raw.sides) {
    const party = squash(s.party);
    if (!labels.has(party) || !Object.hasOwn(CASE_SIDES, s.side)) continue;
    if (sides.some((x) => x.party === party)) continue;
    const actions = s.actions
      .map((a) => planText(a, 90, question))
      .filter((a): a is string => !!a)
      .slice(0, PLAN_LIMITS.actions);
    const stance = s.stance ? planText(s.stance, 110, question) : null;
    sides.push({ party, side: s.side as CaseSide, actions, ...(stance && { stance }) });
    if (sides.length >= PLAN_LIMITS.sides) break;
  }
  const prep: DeepPlan["prep"] = [];
  for (const p of raw.prep) {
    const item = planText(p.item, 40, question);
    if (!item || prep.some((x) => x.item === item)) continue;
    prep.push({ item, why: planText(p.why, 80, question) ?? "" });
    if (prep.length >= PLAN_LIMITS.prep) break;
  }
  const rebuttals: NonNullable<DeepPlan["rebuttals"]> = [];
  for (const r of raw.rebuttals ?? []) {
    const by = squash(r.by);
    if (!labels.has(by) || r.issue < 1 || (issueCount !== undefined && r.issue > issueCount))
      continue;
    const point = planText(r.point, 110, question);
    const reply = planText(r.reply, 110, question);
    if (!point || !reply || rebuttals.some((x) => x.point === point)) continue;
    rebuttals.push({ issue: r.issue, by, point, reply });
    if (rebuttals.length >= PLAN_LIMITS.rebuttals) break;
  }
  const docs: NonNullable<DeepPlan["docs"]> = [];
  for (const d of raw.docs ?? []) {
    if (!Object.hasOwn(PLAN_DOCS, d.kind) || docs.some((x) => x.kind === d.kind)) continue;
    docs.push({ kind: d.kind as PlanDocKind, why: planText(d.why, 90, question) ?? "" });
    if (docs.length >= PLAN_LIMITS.docs) break;
  }
  if (kinds.length === 0 && sides.length === 0 && prep.length === 0) return null;
  return {
    kinds,
    sides,
    prep,
    ...(rebuttals.length > 0 && { rebuttals }),
    ...(docs.length > 0 && { docs }),
  };
}

export function planSchema(partyLabels: string[], issueCount?: number) {
  const party =
    partyLabels.length > 0
      ? { type: "string", enum: partyLabels, description: "사건 구조의 당사자" }
      : { type: "string", description: "사건 구조의 당사자" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["kinds", "sides", "prep", "rebuttals", "docs"],
    description: "사건 정리판. 판정(승패·유불리·책임 비율)은 쓰지 않는다",
    properties: {
      kinds: {
        type: "array",
        items: { type: "string", enum: Object.keys(CASE_KINDS) },
        description: "이 사건이 걸리는 절차 종류 1~3개 (민사·형사가 함께 걸리면 둘 다)",
      },
      sides: {
        type: "array",
        description: "당사자마다 절차에서 서는 자리와 할 수 있는 대응",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["party", "side", "stance", "actions"],
          properties: {
            party,
            side: { type: "string", enum: Object.keys(CASE_SIDES) },
            stance: {
              type: "string",
              description:
                "그 당사자가 이 사건에서 내세우는 입장 한 문장, 100자 이내. 조문·사건번호·숫자는 쓰지 않는다",
            },
            actions: {
              type: "array",
              items: { type: "string" },
              description:
                "그 당사자가 할 수 있는 대응 1~4개, 각 90자 이내. 민사와 형사가 함께 걸리면 '민사: …', '형사: …'로 나눠 쓴다. 조문·사건번호·숫자는 쓰지 않는다",
            },
          },
        },
      },
      prep: {
        type: "array",
        description: "질문자가 준비하면 좋은 자료 3~8개",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["item", "why"],
          properties: {
            item: { type: "string", description: "자료 이름, 40자 이내 (예: 임대차계약서 사본)" },
            why: { type: "string", description: "어디에 쓰이는지, 80자 이내" },
          },
        },
      },
      rebuttals: {
        type: "array",
        description: "쟁점마다 상대방이 내세울 수 있는 예상 반론과 그에 대한 대응 방향 3~6개",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["issue", "by", "point", "reply"],
          properties: {
            issue: {
              type: "integer",
              ...(issueCount && { enum: Array.from({ length: issueCount }, (_, i) => i + 1) }),
              description: "이 반론이 걸린 쟁점 번호",
            },
            by: { ...party, description: "이 반론을 내세울 당사자" },
            point: { type: "string", description: "예상 반론 한 문장, 100자 이내" },
            reply: {
              type: "string",
              description: "그 반론에 대비해 질문자가 준비·대응할 방향 한 문장, 100자 이내",
            },
          },
        },
      },
      docs: {
        type: "array",
        description: "지금 내용으로 질문자가 작성해 볼 문서 1~3개. 맞는 서식이 없으면 빈 배열",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "why"],
          properties: {
            kind: { type: "string", enum: Object.keys(PLAN_DOCS) },
            why: { type: "string", description: "이 문서를 지금 쓰는 까닭, 80자 이내" },
          },
        },
      },
    },
  };
}

/** 출처는 이번 요청의 근거 키 중 하나 또는 MODEL_SOURCE(DEC-055), 쟁점은 구조에서 뽑은 번호 중 하나만 고를 수 있다.
 * partyLabels를 주면 사건 정리판(DEC-062) 칸도 받는다 */
export function deepAnswerSchema(keys: string[], issueCount: number, partyLabels?: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: partyLabels ? ["points", "plan"] : ["points"],
    properties: {
      ...(partyLabels && { plan: planSchema(partyLabels, issueCount) }),
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
  /** 사건 정리판 (DEC-062). 100자를 넘는 질문의 답변에만 있다 */
  plan?: DeepPlan;
};

/**
 * 구조 + (쟁점 번호가 붙은) 초안 문단 + 검증을 통과해 남은 문단 → 화면용 사건 구조.
 * 문단은 글자가 같은 것으로 다시 찾는다 — 검증에서 빠진 문단은 쟁점에서도 빠진다.
 */
export function buildDeepMap(
  struct: DeepStruct,
  drafted: { issue: number; text: string }[],
  finalPoints: { text: string }[],
  plan?: DeepPlan | null,
): DeepMap {
  const issueOf = new Map(drafted.map((d) => [d.text.trim(), d.issue]));
  const issues = struct.issues.map((i) => ({ title: i.title, points: [] as number[] }));
  finalPoints.forEach((p, index) => {
    const n = issueOf.get(p.text.trim());
    if (n && issues[n - 1]) issues[n - 1].points.push(index);
  });
  return {
    parties: struct.parties,
    events: struct.events,
    issues,
    unknowns: struct.unknowns,
    ...(plan && { plan }),
  };
}

const PlanZ = z.object({
  kinds: z.array(z.enum(Object.keys(CASE_KINDS) as [CaseKind, ...CaseKind[]])),
  sides: z.array(
    z.object({
      party: Str,
      side: z.enum(Object.keys(CASE_SIDES) as [CaseSide, ...CaseSide[]]),
      actions: z.array(Str),
      stance: Str.optional(),
    }),
  ),
  prep: z.array(z.object({ item: Str, why: Str })),
  rebuttals: z
    .array(z.object({ issue: z.number().int().min(1), by: Str, point: Str, reply: Str }))
    .optional(),
  docs: z
    .array(
      z.object({
        kind: z.enum(Object.keys(PLAN_DOCS) as [PlanDocKind, ...PlanDocKind[]]),
        why: Str,
      }),
    )
    .optional(),
});

/** 저장된 결과를 다시 읽을 때 형식 확인 (모양이 다르면 그림을 그리지 않는다) */
export function parseDeepMap(v: unknown): DeepMap | null {
  const ok = z
    .object({
      parties: z.array(z.object({ label: Str, role: Str })),
      events: z.array(z.object({ when: Str, who: Str, what: Str })),
      issues: z.array(z.object({ title: Str, points: z.array(z.number().int().min(0)) })),
      unknowns: z.array(Str),
      plan: PlanZ.optional().catch(undefined),
    })
    .safeParse(v);
  return ok.success && ok.data.issues.length > 0 ? ok.data : null;
}
