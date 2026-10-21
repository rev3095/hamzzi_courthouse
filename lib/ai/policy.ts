// 데모 분석의 순수 규칙 (PRD 8.2 데모 파이프라인, API.md 4.1). LLM 호출 없이 단위 테스트한다.
// - 출력 스키마(구조화 출력)와 검증(zod)
// - 이어 묻기 맥락 자르기 (F-002 AC3, DEC-011)
// - 검색어 PII 재검사 (F-007): 모델이 만든 검색어도 법제처로 보내기 전에 다시 본다
// - 답변 문단 1차 거르기: 근거 키 밖 출처, 단정 표현(N1), 원문에 없는 숫자 (절대 규칙 1·2·3)
// - 검증 전 초안 조립. 인용 검증(원문 대조·재조회)은 lib/citations(P4)가 한다
import { z } from "zod";
import { AI_NOTICE } from "@/lib/api/respond";
import { articlesIn, caseNumbersIn, stripCitations } from "@/lib/citations/patterns";
import { scanInput } from "@/lib/pii";
import type { EvidenceSet } from "@/lib/search/evidence";
import type { ArticleHit, CaseDetail, CaseHit } from "@/lib/search/types";

export const MODELS = {
  intent: "claude-haiku-5-5",
  agent: "claude-opus-5-5",
  answer: "claude-opus-5-5",
} as const;

export const LIMITS = {
  contextTurns: 3,
  contextChars: 600,
  keywords: 3,
  articleRefs: 3,
  searchPerQuery: 5,
  caseDetails: 4,
  agentRounds: 3,
  toolCallsPerRound: 3,
  points: 6,
  queryChars: 80,
  digestChars: 1_500,
  toolResultChars: 400,
} as const;

/** 진행 단계 (API.md 4.1 SSE `step`). message는 고정 문구만 — 입력 원문을 넣지 않는다 */
export type Stage = "intent" | "search" | "agent" | "answer" | "verify";
export type StepEvent = { stage: Stage; message: string; added?: string[] };

export const STEP_MESSAGES = {
  intent: "질문 의도를 분석하고 있어요",
  search: "관련 법령과 판례를 찾고 있어요",
  agent: "근거를 더 찾아보고 있어요",
  answer: "찾은 근거로 답변을 쓰고 있어요",
} as const;

export const SEARCH_SCOPE_NOTE =
  "국가법령정보센터(법제처)에서 이번 질문으로 찾은 현행 법령 조문과 판례만 근거로 썼습니다. 찾지 못한 판례·법령이 없다는 뜻은 아닙니다.";

// ── 이어 묻기 맥락 ─────────────────────────────────────────────

export type FollowupTurn = { question: string; answer: string };

/** 직전 질문·답변 최근 3개만, 각각 길이를 잘라 사연 맥락으로만 쓴다 (DEC-011). 입력은 모두 마스킹본 */
export function recentContext(turns: FollowupTurn[]): FollowupTurn[] {
  const cut = (s: string) =>
    s.length > LIMITS.contextChars ? `${s.slice(0, LIMITS.contextChars)}…` : s;
  return turns
    .slice(-LIMITS.contextTurns)
    .map((t) => ({ question: cut(t.question), answer: cut(t.answer) }));
}

// ── ① 의도 분석 출력 ──────────────────────────────────────────

export const IntentZ = z.object({
  area: z.string().min(1),
  goal: z.string().min(1),
  laws: z.array(z.string()),
  lawKeywords: z.array(z.string()),
  articleRefs: z.array(z.object({ lawName: z.string(), articleNo: z.string() })),
});
export type Intent = z.infer<typeof IntentZ>;

/** 구조화 출력 스키마 (output_config.format). 고정 객체라 요청마다 같다 */
export const INTENT_SCHEMA = {
  type: "object",
  properties: {
    area: { type: "string", description: "법 분야 (예: 주택임대차, 근로, 교통사고)" },
    goal: { type: "string", description: "사용자가 알고 싶은 것 한 문장" },
    laws: { type: "array", items: { type: "string" }, description: "관련될 수 있는 법률 이름" },
    lawKeywords: {
      type: "array",
      items: { type: "string" },
      description: "법령·판례 검색어 2~3개. 법률 용어로, 개인 정보 없이",
    },
    articleRefs: {
      type: "array",
      items: {
        type: "object",
        properties: { lawName: { type: "string" }, articleNo: { type: "string" } },
        required: ["lawName", "articleNo"],
        additionalProperties: false,
      },
      description: "직접 확인할 조문 (예: 주택임대차보호법 제3조의2). 확실하지 않으면 비운다",
    },
  },
  required: ["area", "goal", "laws", "lawKeywords", "articleRefs"],
  additionalProperties: false,
} as const;

// ── ④ 답변 출력 ───────────────────────────────────────────────

export const AnswerZ = z.object({
  points: z.array(z.object({ text: z.string(), source: z.string(), quote: z.string() })),
});
export type DraftPoint = z.infer<typeof AnswerZ>["points"][number];

/** 출처는 이번 요청의 근거 키 중 하나만 고를 수 있다 (enum). 키가 요청마다 달라 이 스키마는 캐시하지 않는다 */
export function answerSchema(keys: string[]) {
  return {
    type: "object",
    properties: {
      points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "답변 문단. 근거 자료로 뒷받침되는 내용만" },
            source: { type: "string", enum: keys, description: "이 문단의 근거 키" },
            quote: { type: "string", description: "근거 원문에서 글자 그대로 옮긴 20~60자 구절" },
          },
          required: ["text", "source", "quote"],
          additionalProperties: false,
        },
      },
    },
    required: ["points"],
    additionalProperties: false,
  };
}

// ── 검색어 PII 재검사 ──────────────────────────────────────────

/**
 * 모델이 만든 검색어를 법제처로 보내기 전에 다시 검사한다 (F-007). 개인정보 가능성이 있거나
 * 마스킹 표시([이름1] 등)가 섞이면 버린다. 민감정보 범주(건강·범죄경력)는 보지 않는다 —
 * "집행유예", "후유증" 같은 법률 검색어를 막게 되고, 해당 질문은 분석 전에 이미 별도 동의를 받았다(F-007 AC2).
 */
export function safeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, LIMITS.queryChars);
  if (q.length < 2 || /[[\]]/.test(q)) return null;
  if (scanInput(q).findings.length > 0) return null;
  return q;
}

export function uniqueQueries(raws: unknown[], max: number): string[] {
  const out: string[] = [];
  for (const r of raws) {
    const q = safeQuery(r);
    if (q && !out.includes(q)) out.push(q);
    if (out.length >= max) break;
  }
  return out;
}

// ── 답변 문단 1차 거르기 ───────────────────────────────────────

const norm = (s: string) => s.normalize("NFKC");

/** 결과 단정 표현 (N1, 절대 규칙 2). NFKC로 바꾼 뒤 본다 (전각 ％ 등) */
const ASSERTIVE = [
  /반드시/,
  /무조건/,
  /틀림없/,
  /(100|백)\s*(%|퍼센트|프로)/,
  /확실(히|합니다|하게)/,
  /분명히\s*(이길|승소|처벌|받)/,
  /(승소|패소|처벌|무죄|유죄|구속)(합니다|됩니다|할 것입니다|하게 됩니다|받습니다|받게 됩니다)/,
  /판결합니다/,
];

export function isAssertive(text: string): boolean {
  const t = norm(text);
  return ASSERTIVE.some((re) => re.test(t));
}

/** 조문 하위 번호·날짜 속 숫자는 숫자 규칙에서 뺀다. 조문·사건번호는 stripCitations가 빼고 citationsIn이 따로 확인한다 */
const IDENTIFIERS = [
  /제\s*\d+\s*[항호목]/g,
  /(?:19|20)\d{2}\s*[.\-]\s*\d{1,2}\s*[.\-]\s*\d{1,2}\.?/g,
];

const UNIT =
  "(년|개월|월|주일|주|일|시간|분|만\\s*원|억\\s*원|천\\s*원|원|%|퍼센트|배|회|명|건|층|평|㎡)";
const NUMBER_TOKEN = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}?`, "g");
/** 한글·한자 수사 + 단위 ("삼 년", "두 달", "열흘", "보름", "반년") */
// 한자어 수사는 "이해", "오해" 같은 낱말과 겹치지 않게 년·개월·주일 앞에서만 본다
const WORD_NUMBER =
  /(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무|서른|마흔|쉰)\s*(?:해|달|개월|주일|배)|(?:일|이|삼|사|오|육|칠|팔|구|십|백)\s*(?:년|개월|주일)|열흘|보름|반년|반달/g;

const compact = (s: string) => s.replace(/\s+/g, "");

/** 숫자 토큰(단위 포함)과 한글 수사 표현. 식별자 속 숫자는 뺀다 */
function numberTokens(text: string): { digits: string[]; words: string[] } {
  let t = stripCitations(norm(text).replace(/(\d),(?=\d{3})/g, "$1"));
  for (const re of IDENTIFIERS) t = t.replace(re, " ");
  const digits = [...t.matchAll(NUMBER_TOKEN)].map((m) => compact(`${m[1]}${m[2] ?? ""}`));
  const words = (t.match(WORD_NUMBER) ?? []).map(compact);
  return { digits, words };
}

/** 본문에 적힌 조문번호·사건번호 */
export function citationsIn(text: string): { articles: string[]; cases: string[] } {
  return { articles: articlesIn(text).map((a) => a.label), cases: caseNumbersIn(text) };
}

export type DropReason =
  "unknown_source" | "unknown_citation" | "assertive" | "number_not_in_source" | "empty";

/**
 * 답변 문단 1차 거르기 (절대 규칙 1·2·3). 원문 구절 일치·재조회는 P4 검증기가 한다.
 * - 출처가 이번 요청에서 출처로 쓸 수 있는 근거 키(citableKeys)가 아니면 뺀다
 * - 본문에 적힌 사건번호·조문번호가 근거에 없으면 뺀다 (P4는 source·quote만 대조하므로 여기서 막는다)
 * - 단정 표현이 있으면 뺀다
 * - 숫자(단위 포함)·한글 수사는 그 문단 출처 원문에 같은 토큰이 있을 때만 쓸 수 있다
 */
export function screenPoints(
  points: DraftPoint[],
  evidence: EvidenceSet,
): { kept: DraftPoint[]; dropped: DropReason[] } {
  const allowed = new Set(citableKeys(evidence));
  const knownArticles = new Set<string>();
  const allSource: string[] = [];
  for (const item of evidence.list()) {
    if (item.kind === "statute") knownArticles.add(compact(item.ref.articleNo));
    allSource.push(evidence.sourceText(item.key));
  }
  // 근거 원문(예: 판례 참조조문·판결요지)에 적힌 조문번호도 근거에 있는 것으로 본다
  for (const no of citationsIn(allSource.join("\n")).articles) knownArticles.add(no);

  const kept: DraftPoint[] = [];
  const dropped: DropReason[] = [];
  for (const p of points.slice(0, LIMITS.points)) {
    const text = p.text.trim();
    if (!text) {
      dropped.push("empty");
      continue;
    }
    if (!allowed.has(p.source)) {
      dropped.push("unknown_source");
      continue;
    }
    const cited = citationsIn(text);
    if (
      cited.cases.some((c) => !evidence.findCase(c)) ||
      cited.articles.some((a) => !knownArticles.has(a))
    ) {
      dropped.push("unknown_citation");
      continue;
    }
    if (isAssertive(text)) {
      dropped.push("assertive");
      continue;
    }
    const source = numberTokens(evidence.sourceText(p.source));
    const mine = numberTokens(text);
    const digits = new Set(source.digits);
    const bare = new Set(source.digits.map((d) => d.replace(/[^\d.]/g, "")));
    const words = new Set(source.words);
    const numberOk =
      mine.digits.every((d) => (/\d$/.test(d) ? bare.has(d) : digits.has(d))) &&
      mine.words.every((w) => words.has(w));
    if (!numberOk) {
      dropped.push("number_not_in_source");
      continue;
    }
    kept.push({ text, source: p.source, quote: p.quote.trim() });
  }
  return { kept, dropped };
}

// ── 근거 요약 (모델 입력) ───────────────────────────────────────

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function describeArticle(a: ArticleHit, maxChars: number): string {
  const head = `[${a.id}] ${a.lawName} ${a.articleNo}${a.title ? `(${a.title})` : ""}`;
  return `${head}\n${clip(a.text, maxChars)}`;
}

export function describeCase(key: string, c: CaseHit | CaseDetail, maxChars: number): string {
  const head = `[${key}] ${c.court} ${c.decidedAt ?? ""} ${c.caseNo} ${c.caseName}`.replace(
    /\s+/g,
    " ",
  );
  if (!("fromBody" in c)) return `${head}\n(판결 요지 없음 — 출처로 쓰지 말 것)`;
  const parts = [
    c.holding && `판시사항: ${c.holding}`,
    c.summary && `판결요지: ${c.summary}`,
    c.fromBody && c.bodyExcerpt && `본문 일부: ${c.bodyExcerpt}`,
  ].filter(Boolean) as string[];
  return `${head}\n${clip(parts.join("\n"), maxChars)}`;
}

/** 답변 모델에 넘길 근거 목록. 키·식별정보·원문(잘라서)만 */
export function evidenceDigest(
  evidence: EvidenceSet,
  maxChars: number = LIMITS.digestChars,
): string {
  return evidence
    .list()
    .map((item) =>
      item.kind === "statute"
        ? describeArticle(item.ref, maxChars)
        : describeCase(item.key, item.ref, maxChars),
    )
    .join("\n\n");
}

/** 답변 출처로 쓸 수 있는 키: 조문, 그리고 판시사항·요지(또는 본문 일부)를 가져온 판례 */
export function citableKeys(evidence: EvidenceSet): string[] {
  return evidence
    .list()
    .filter(
      (item) =>
        item.kind === "statute" || ("fromBody" in item.ref && evidence.sourceText(item.key) !== ""),
    )
    .map((item) => item.key);
}

// ── 초안 조립 ─────────────────────────────────────────────────

export type SearchRecord = { keyword: string; total: number };
export type TraceRecord = {
  round: 1 | 2 | 3;
  tool: "law" | "precedent";
  query: string;
  added: string[];
};

/** API.md 4.1 DemoAnalysisResult에서 검증 결과(check·recheck)를 뺀 것. P4가 검증해 채운다 */
export type DemoDraft = {
  outcome: "grounded" | "no_result_in_scope";
  aiNotice: typeof AI_NOTICE;
  intent: { area: string; goal: string; laws: string[]; lawKeywords: string[] };
  answer: { points: DraftPoint[] };
  articles: {
    id: string;
    lawName: string;
    articleNo: string;
    title: string;
    effectiveFrom: string | null;
    sourceUrl: string;
    used: boolean;
  }[];
  cases: {
    id: string;
    caseNo: string;
    caseName: string;
    court: string;
    decidedAt: string | null;
    sourceUrl: string;
    fromBody: boolean;
    used: boolean;
  }[];
  searches: SearchRecord[];
  trace: TraceRecord[];
  searchScopeNote: string;
};

/**
 * 의도 요약(모델이 만든 문장)도 화면에 나가므로 같은 규칙을 건다.
 * 단정 표현이 있거나 질문에 없는 숫자를 만들어 넣었으면 비운다. 관련 법률은 근거로 가져온 법령만 남긴다.
 */
export function screenIntent(intent: Intent, maskedText: string, evidence: EvidenceSet) {
  const asked = numberTokens(maskedText);
  const askedDigits = new Set(asked.digits);
  const askedWords = new Set(asked.words);
  const clean = (s: string) => {
    const n = numberTokens(s);
    const ok =
      !isAssertive(s) &&
      n.digits.every((d) => askedDigits.has(d)) &&
      n.words.every((w) => askedWords.has(w));
    return ok ? s : "";
  };
  const lawNames = new Set(
    evidence.list().flatMap((i) => (i.kind === "statute" ? [compact(i.ref.lawName)] : [])),
  );
  return {
    area: clean(intent.area),
    goal: clean(intent.goal),
    laws: intent.laws.filter((l) => lawNames.has(compact(norm(l)))),
    lawKeywords: intent.lawKeywords.map(clean).filter(Boolean),
  };
}

export function assembleDraft(input: {
  maskedText: string;
  intent: Intent;
  points: DraftPoint[];
  evidence: EvidenceSet;
  searches: SearchRecord[];
  trace: TraceRecord[];
}): DemoDraft {
  const used = new Set(input.points.map((p) => p.source));
  const articles: DemoDraft["articles"] = [];
  const cases: DemoDraft["cases"] = [];
  for (const item of input.evidence.list()) {
    if (item.kind === "statute") {
      const a = item.ref;
      articles.push({
        id: a.id,
        lawName: a.lawName,
        articleNo: a.articleNo,
        title: a.title,
        effectiveFrom: a.effectiveFrom,
        sourceUrl: a.sourceUrl,
        used: used.has(item.key),
      });
    } else {
      const c = item.ref;
      cases.push({
        id: c.id,
        caseNo: c.caseNo,
        caseName: c.caseName,
        court: c.court,
        decidedAt: c.decidedAt,
        sourceUrl: c.sourceUrl,
        fromBody: "fromBody" in c ? c.fromBody : false,
        used: used.has(item.key),
      });
    }
  }
  return {
    outcome: input.points.length > 0 ? "grounded" : "no_result_in_scope",
    aiNotice: AI_NOTICE,
    intent: screenIntent(input.intent, input.maskedText, input.evidence),
    answer: { points: input.points },
    articles,
    cases,
    searches: input.searches,
    trace: input.trace,
    searchScopeNote: SEARCH_SCOPE_NOTE,
  };
}
