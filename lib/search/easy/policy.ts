// 법령 쉬운 설명 (DEC-074) — 순수 규칙: 모델 입력 고르기, 모델 출력 거르기, AI 없는 정리.
// 쉬운 설명은 그 법의 조문 원문만 근거로 한다. 조문에 없는 조문 번호·숫자, 판례처럼 보이는 문장, 단정 표현은 화면에 가지 않는다
// (절대 규칙 1·2·3). 가상 사례는 실제 판례로 보이면 안 되므로 더 엄격히 거른다.
import { isAssertive, numberBag, numbersWithin, type NumberBag } from "@/lib/ai/policy";
import { articlesIn, caseNumbersIn } from "@/lib/citations/patterns";
import { scanInput } from "@/lib/pii";
import {
  EASY_LIMITS,
  type EasyAlternative,
  type EasyArticle,
  type EasyIssue,
  type EasyKeyPoint,
  type EasyLaw,
  type EasyRaw,
  type EasyRequirement,
  type EasyVirtualCase,
} from "./types";

export * from "./types";

/** 모델 입력(목차 + 주요 조문 본문)의 글자 수 상한 — Haiku 1회가 비용 상한 안에 들게 */
export const EASY_INPUT_CHARS = 12_000;
/** 조문 하나를 이만큼까지만 넣는다. 목적·정의 조문은 조금 더 */
const ARTICLE_CLIP = 700;
const LEAD_CLIP = 1_200;
/** 목차가 입력의 절반을 넘지 않게 한다 (조문이 아주 많은 법) */
const TOC_SHARE = 0.5;

const compact = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const LEAD = new Set(["제1조", "제2조"]);
/** 사람들이 실제로 부딪히는 조문 제목 */
const KEY_TITLE = /허가|인증|신고|금지|준수|의무|벌칙|과태료|회수|표시|광고/;

/** 본문을 넣을 순서: 목적·정의 → 제목에 주요 낱말이 든 조문 → 나머지(조문 순서) */
function bodyOrder(articles: EasyArticle[]): EasyArticle[] {
  const lead = articles.filter((a) => LEAD.has(compact(a.articleNo)));
  const key = articles.filter((a) => !LEAD.has(compact(a.articleNo)) && KEY_TITLE.test(a.title));
  const picked = new Set([...lead, ...key]);
  return [...lead, ...key, ...articles.filter((a) => !picked.has(a))];
}

/**
 * 모델 입력을 만든다: 모든 조문의 번호·제목(목차) + 글자 수 안에서 고른 조문 본문.
 * included는 본문이 들어간 조문 번호.
 */
export function digestArticles(
  articles: EasyArticle[],
  maxChars: number = EASY_INPUT_CHARS,
): { text: string; included: string[] } {
  const tocLines: string[] = [];
  let tocLen = 0;
  const tocBudget = Math.floor(maxChars * TOC_SHARE);
  const MORE = "(이하 조문 제목 생략)";
  for (const a of articles) {
    const line = a.title ? `${a.articleNo} ${a.title}` : a.articleNo;
    if (tocLen + line.length + 1 > tocBudget - MORE.length - 1) {
      tocLines.push(MORE);
      break;
    }
    tocLines.push(line);
    tocLen += line.length + 1;
  }
  const head = `<목차>\n${tocLines.join("\n")}\n</목차>\n<조문>\n`;
  const tail = "</조문>";
  let left = maxChars - head.length - tail.length;
  const blocks: string[] = [];
  const included: string[] = [];
  for (const a of bodyOrder(articles)) {
    const label = `[${a.articleNo}]${a.title ? ` ${a.title}` : ""}\n`;
    const room = left - label.length - 1;
    // 남은 자리가 너무 적으면 반쪽짜리 조문을 넣지 않고 끝낸다
    if (room < 120) break;
    const limit = LEAD.has(compact(a.articleNo)) ? LEAD_CLIP : ARTICLE_CLIP;
    const body = clip(a.text.trim(), Math.min(limit, room));
    blocks.push(`${label}${body}\n`);
    included.push(a.articleNo);
    left -= label.length + body.length + 1;
  }
  return { text: `${head}${blocks.join("")}${tail}`, included };
}

// ── 모델 출력 거르기 ───────────────────────────────────────────

export type EasyDrop =
  | "empty"
  | "too_long"
  | "unknown_article"
  | "case_like"
  | "assertive"
  | "number_not_in_source"
  | "pii"
  | "percent"
  | "person_name"
  | "number_in_virtual"
  | "other_law_article"
  | "no_article"
  | "over_limit"
  | "evasion";

/** 법원·재판부를 가리키는 낱말 (긴 것부터). 그 낱말이 법 원문에 있을 때만 설명에 남긴다 */
const COURT =
  /대법원|고등법원|지방법원|가정법원|행정법원|회생법원|특허법원|헌법재판소|재판부|헌재|법원|대법/g;
/** 판례를 가리키는 낱말 — 원문과 상관없이 언제나 버린다 */
const PRECEDENT_ALWAYS = /판례|판결례|결정례|판시/;
/** 그 낱말이 법 원문에 있을 때만 설명에 남기는 낱말 (예: 결격사유의 "형을 선고받고") */
const PRECEDENT_SOFT = /판결|선고/g;
/** 가상 사례에 쓰지 않는 재판·수사 꼴과 결과 서술 — 실제 사건처럼 읽히지 않게 */
const VIRTUAL_TRIAL =
  /재판|소송|(?<![가-힣])(?:수사|기소|고소|고발)|경찰|검찰|조사를\s?받|당했|(?<![가-힣])졌어요|이겼어요|(?:과태료|벌금|징역|영업정지|처벌|처분|명령|정지|회수)[^.]{0,12}(?:냈|물었|받았|당했|됐|되었|나왔)|취소(?:됐|되었|돼요|당했)|적발(?:됐|되었|당했)|단속에\s?걸/;
/** 해요체 단정·결과 확정 표현 (isAssertive는 합니다체만 본다). "~할 수 있어요"는 남는다 */
const EASY_ASSERTIVE =
  /(?:승소|패소|처벌|무죄|유죄|구속|징역형?|벌금형?)(?:을|를|이|가)?\s?(?:해요|돼요|되어요|받아요|받게\s?(?:돼요|될\s?거예요)|당해요|나와요|이에요|예요)|꼭\s|확실해요|확실히|분명\s|분명히|틀림없|피할 수 없|가능성이\s?(?:높|크|커|큰|낮|작|적)|확률|이길 수 있어요|(?:^|\s)이겨요|(?:소송|재판)[^.]*(?<![가-힣])져요/;
/**
 * 한글로 쓴 금액·기간·횟수 (숫자 토큰으로 잡히지 않는다). 다른 낱말("이사회", "만일", "이 원칙")을 잡지 않게
 * 한자어 수는 두 글자 이상 + 좁은 단위로, 고유어 수는 띄어 쓴 꼴로만 본다.
 */
const KOREAN_NUMBER =
  /(?<![가-힣])[일이삼사오육칠팔구십백천만억]{2,}\s?(?:원|년|개월|배|일(?![가-힣]))|(?<![가-힣])[일이삼사오육칠팔구십백천만억]\s(?:원|년|개월)(?![가-힣])|(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s(?:번|달|주|차례|배|해)(?![가-힣])|(?:두|세|네)(?:번|달|차례)(?![가-힣])|수(?:십|백|천|백만|천만|억)|하루|이틀|사흘|나흘|열흘|보름|(?<![가-힣])[십백천만억]원(?![가-힣])/g;
/** 실제 있었던 일처럼 읽히는 말 — 그 말이 법 원문에 있을 때만 설명에 남긴다. 가상 사례에는 쓰지 않는다 */
const REAL_EVENT =
  /실제로|실제\s?(?:사건|사례)|사례(?:가|도|는)\s?(?:있|많|늘)|적발(?:된|되|돼|됐)|재판에서|소송에서/g;
/** 가상 사례에 쓰지 않는 때·횟수 낱말 (실제 있었던 일처럼 읽힌다) */
const VIRTUAL_TIME =
  /작년|올해|내년|최근|얼마\s?전|예전|지난번|지난\s?(?:달|해|주)|이번\s?(?:달|주)|어제|오늘|며칠|몇\s?(?:번|달|년|일)|여러\s?(?:번|차례)|(?<![가-힣])(?:봄|여름|가을|겨울)에/;
/** 유불리를 말하는 낱말 — 그 낱말이 법 원문에 있을 때만 남긴다 ("불리한 처우" 같은 조문 인용 보호) */
const FAVOR = /(?:유리|불리)(?:해|하|할|한|합)/g;
/** 조문 표기(제5조, 제5조의2, 제1항, 제2호) — 가상 사례의 숫자 검사에서만 뺀다 */
const ARTICLE_MARK = /제\s*\d+\s*(?:조(?:\s*의\s*\d+)?|항|호)/g;
/** 다른 법령의 조문을 가리키는 꼴 */
const LOWER_LAW_ARTICLE = /(?:시행령|시행규칙|같은\s?법)\s*제\s*\d+\s*조/;
const NAMED_LAW_ARTICLE = /([가-힣]+(?:법|법률))\s*제\s*\d+\s*조/g;
/** 사람 이름처럼 보이는 꼴: "김○○", "박 모 씨", "홍길동 씨" — 가상 사례는 역할(판매업자 A)로만 쓴다 */
const PERSON =
  /[가-힣]\s?(?:○○|OO|XX|모)\s?(?:씨|님|군|양)|[가-힣]{2,4}\s?(?:씨|님)(?=[이가은는를을의도와과에께]|[\s.,]|$)|[가-힣]{1,2}[○O]{1,2}(?![가-힣])/;
/** 대안 칸에 쓰지 않는 말 — 법을 피하거나 걸리지 않는 요령으로 읽힌다 */
const EVASION = /피하|빠져나|회피|우회|걸리지\s?않|들키|숨기|편법|꼼수|빈틈|단속을/;
/** 회사 이름 꼴 */
const COMPANY = /\(주\)|㈜|주식회사|유한회사|\(유\)/;

type Ctx = {
  known: Set<string>;
  bag: NumberBag;
  sourceText: string;
  sourceCompact: string;
  lawName: string | null;
};

function contextOf(articles: EasyArticle[], lawName?: string): Ctx {
  const sourceText = articles.map((a) => `${a.title}\n${a.text}`).join("\n");
  return {
    known: new Set(articles.map((a) => compact(a.articleNo))),
    bag: numberBag(sourceText),
    sourceText: sourceText.normalize("NFKC"),
    sourceCompact: compact(sourceText),
    lawName: lawName ? compact(lawName) : null,
  };
}

/** 문장 하나를 화면에 내도 되는지. 안 되면 이유 */
function lineDrop(raw: string, ctx: Ctx, maxChars: number, virtual: boolean): EasyDrop | null {
  const text = raw.normalize("NFKC").trim();
  if (!text) return "empty";
  if (text.length > maxChars) return "too_long";
  // 확률처럼 읽히는 표시는 내지 않는다 (절대 규칙 2)
  if (/%|퍼센트/.test(text)) return "percent";
  if (caseNumbersIn(text).length > 0) return "case_like";
  const courts = text.match(COURT) ?? [];
  // 법원 이름은 그 법 조문이 직접 쓰는 낱말일 때만 설명에 남긴다. 가상 사례에는 어떤 경우에도 쓰지 않는다
  if (courts.some((c) => virtual || !ctx.sourceText.includes(c))) return "case_like";
  if (PRECEDENT_ALWAYS.test(text)) return "case_like";
  const soft = text.match(PRECEDENT_SOFT) ?? [];
  if (soft.some((w) => virtual || !ctx.sourceText.includes(w))) return "case_like";
  const events = text.match(REAL_EVENT) ?? [];
  if (events.some((w) => virtual || !ctx.sourceText.includes(w))) return "case_like";
  if (virtual && VIRTUAL_TRIAL.test(text)) return "case_like";
  if (isAssertive(text) || EASY_ASSERTIVE.test(text)) return "assertive";
  const favor = text.match(FAVOR) ?? [];
  if (favor.some((w) => virtual || !ctx.sourceText.includes(w.slice(0, 2)))) return "assertive";
  if (articlesIn(text).some((a) => !ctx.known.has(a.label))) return "unknown_article";
  // 번호가 이 법에 있어도 다른 법령의 조문을 가리키면 근거가 아니다
  if (LOWER_LAW_ARTICLE.test(text)) return "other_law_article";
  for (const m of text.matchAll(NAMED_LAW_ARTICLE)) {
    if (ctx.lawName && compact(m[1]) !== ctx.lawName) return "other_law_article";
  }
  const koreanNumbers = text.match(KOREAN_NUMBER) ?? [];
  if (virtual) {
    // 가상 사례에는 숫자·날짜를 넣지 않는다 (조문 표기만 예외)
    if (
      /\d/.test(text.replace(ARTICLE_MARK, "")) ||
      koreanNumbers.length > 0 ||
      VIRTUAL_TIME.test(text)
    ) {
      return "number_in_virtual";
    }
  } else if (koreanNumbers.some((n) => !ctx.sourceCompact.includes(compact(n)))) {
    return "number_not_in_source";
  }
  if (!numbersWithin(text, ctx.bag)) return "number_not_in_source";
  if (virtual && (PERSON.test(text) || COMPANY.test(text))) return "person_name";
  if (scanInput(text).findings.length > 0) return "pii";
  return null;
}

/** 원문이 없는 글(검색 답, DEC-076)에 쓰는 빈 바탕 — 숫자·조문 번호·법원 이름·판례 낱말·유불리 낱말을 모두 받지 않는다 */
const BARE_CTX = contextOf([]);
/** 원문 없이 모델이 쓴 한 줄을 거른다 (DEC-076 검색 답). 통과하면 null */
export const bareLineDrop = (text: string, maxChars: number, virtual = false): EasyDrop | null =>
  lineDrop(text, BARE_CTX, maxChars, virtual);

/** 근거 조문 번호: 이 법에 실제로 있는 조문이면 "제N조[의M]", 아니면 null */
function articleNoOf(raw: unknown, ctx: Ctx): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const found = articlesIn(raw)[0]?.label ?? compact(raw);
  return ctx.known.has(found) ? found : null;
}

// 남기는 글은 모델이 쓴 그대로 둔다 (검사할 때만 NFKC로 바꿔 본다)
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * 모델(또는 저장된 자료)의 쉬운 설명을 거른다. 한 줄이라도 규칙에 걸리면 그 항목 전체를 뺀다.
 * allowVirtual이 false면 가상 사례를 모두 뺀다 (실제 판례가 충분할 때).
 */
export function screenEasy(
  raw: unknown,
  articles: EasyArticle[],
  opts: { allowVirtual?: boolean; lawName?: string } = {},
): { easy: EasyRaw; dropped: EasyDrop[] } {
  const ctx = contextOf(articles, opts.lawName);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dropped: EasyDrop[] = [];
  const L = EASY_LIMITS;

  const lines = (items: unknown[], max: number, chars: number): string[] => {
    const out: string[] = [];
    for (const item of items) {
      const text = str(item);
      const why = lineDrop(text, ctx, chars, false);
      if (why) dropped.push(why);
      else if (out.length >= max) dropped.push("over_limit");
      else if (!out.includes(text)) out.push(text);
    }
    return out;
  };

  const summary = lines(list(r.summary), L.summary.max, L.summary.chars);
  const who = lines(list(r.who), L.who.max, L.who.chars);

  const keyPoints: EasyKeyPoint[] = [];
  for (const item of list(r.keyPoints)) {
    const k = (item ?? {}) as Record<string, unknown>;
    const title = str(k.title);
    const body = str(k.body);
    const why =
      lineDrop(title, ctx, L.keyPoints.title, false) ??
      lineDrop(body, ctx, L.keyPoints.body, false);
    const articleNo = articleNoOf(k.articleNo, ctx);
    if (why) dropped.push(why);
    // 근거 조문을 댈 수 없는 핵심 내용은 싣지 않는다
    else if (!articleNo) dropped.push("no_article");
    else if (keyPoints.length >= L.keyPoints.max) dropped.push("over_limit");
    else keyPoints.push({ title, body, articleNo });
  }

  const issues: EasyIssue[] = [];
  for (const item of list(r.issues)) {
    const k = (item ?? {}) as Record<string, unknown>;
    const question = str(k.question);
    const why = lineDrop(question, ctx, L.issues.chars, false);
    if (why) dropped.push(why);
    else if (issues.length >= L.issues.max) dropped.push("over_limit");
    else issues.push({ question, articleNo: articleNoOf(k.articleNo, ctx) });
  }

  const virtualCases: EasyVirtualCase[] = [];
  if (opts.allowVirtual !== false) {
    for (const item of list(r.virtualCases)) {
      const k = (item ?? {}) as Record<string, unknown>;
      const title = str(k.title);
      const situation = str(k.situation);
      const lawSays = str(k.lawSays);
      const why =
        lineDrop(title, ctx, L.virtual.title, true) ??
        lineDrop(situation, ctx, L.virtual.chars, true) ??
        lineDrop(lawSays, ctx, L.virtual.chars, true);
      const articleNo = articleNoOf(k.articleNo, ctx);
      if (why) dropped.push(why);
      else if (!articleNo) dropped.push("no_article");
      else if (virtualCases.length >= L.virtual.max) dropped.push("over_limit");
      else virtualCases.push({ title, situation, lawSays, articleNo });
    }
  }

  const requirements: EasyRequirement[] = [];
  for (const item of list(r.requirements)) {
    const k = (item ?? {}) as Record<string, unknown>;
    const text = str(k.text);
    const why = lineDrop(text, ctx, L.requirements.chars, false);
    const articleNo = articleNoOf(k.articleNo, ctx);
    if (why) dropped.push(why);
    // 근거 조문을 댈 수 없는 요건은 싣지 않는다
    else if (!articleNo) dropped.push("no_article");
    else if (requirements.length >= L.requirements.max) dropped.push("over_limit");
    else requirements.push({ text, articleNo });
  }

  const alternatives: EasyAlternative[] = [];
  for (const item of list(r.alternatives)) {
    const k = (item ?? {}) as Record<string, unknown>;
    const title = str(k.title);
    const body = str(k.body);
    const why =
      lineDrop(title, ctx, L.alternatives.title, false) ??
      lineDrop(body, ctx, L.alternatives.body, false) ??
      (EVASION.test(`${title} ${body}`) ? ("evasion" as const) : null);
    if (why) dropped.push(why);
    else if (alternatives.length >= L.alternatives.max) dropped.push("over_limit");
    else alternatives.push({ title, body, articleNo: articleNoOf(k.articleNo, ctx) });
  }

  return {
    easy: { summary, keyPoints, issues, who, virtualCases, requirements, alternatives },
    dropped,
  };
}

/** 화면에 낼 만큼 남았는지: 한눈에 보기 한 줄 이상 + 핵심 내용 한 개 이상 */
export const easyUsable = (easy: EasyRaw): boolean =>
  easy.summary.length > 0 && easy.keyPoints.length > 0;

// ── AI 없는 정리 ───────────────────────────────────────────────

/** 조문 본문의 첫 문장 (조문 번호·제목 머리는 뗀다) */
export function firstSentence(text: string, maxChars = 200): string {
  const body = text
    .replace(/^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?\s*(?:\([^)]*\))?\s*/, "")
    .replace(/^\s*[①-⑳]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  const end = body.search(/다\.(?:\s|$)/);
  return clip(end >= 0 ? body.slice(0, end + 2) : body, maxChars);
}

const FALLBACK_POINTS = 6;

/**
 * 규칙만으로 만든 정리 (AI 없음): 한눈에 보기는 목적 조문(제1조)의 첫 문장, 핵심 내용은 제목이 있는 앞쪽 조문의 첫 문장.
 * 조문 원문을 그대로 옮긴 것이라 숫자·조문 번호 거르기를 하지 않는다 (인용, 절대 규칙 3).
 */
export function fallbackEasy(lawName: string, articles: EasyArticle[]): EasyLaw {
  const purpose =
    articles.find((a) => compact(a.articleNo) === "제1조" && /목적/.test(a.title)) ??
    articles.find((a) => /목적/.test(a.title));
  const summary = purpose ? [firstSentence(purpose.text, EASY_LIMITS.summary.chars)] : [];
  const keyPoints = articles
    .filter((a) => a !== purpose && a.title.trim())
    .slice(0, FALLBACK_POINTS)
    .map((a) => ({
      title: clip(a.title.trim(), EASY_LIMITS.keyPoints.title),
      body: firstSentence(a.text, EASY_LIMITS.keyPoints.body),
      articleNo: a.articleNo,
    }));
  return {
    lawName,
    summary: summary.filter(Boolean),
    keyPoints,
    issues: [],
    who: [],
    virtualCases: [],
    requirements: [],
    alternatives: [],
  };
}

/** 성립 요건·대안까지 채워졌는지 (DEC-076). 모자라면 그 두 칸만 모델로 더 채운다 */
export const easyComplete = (easy: EasyRaw): boolean =>
  easy.requirements.length > 0 && easy.alternatives.length > 0;

/**
 * 앞서 만든 설명(미리 만든 자료·저장해 둔 설명)에 새로 만든 칸을 덧붙인다 (DEC-076). 앞의 칸이 비어 있을 때만 새 것을 쓴다 —
 * 이미 검토한 문장을 모델이 다시 쓴 것으로 바꾸지 않는다.
 */
export function mergeEasy(base: EasyLaw, extra: EasyRaw): EasyLaw {
  const pick = <T>(a: T[], b: T[]) => (a.length > 0 ? a : b);
  return {
    ...base,
    summary: pick(base.summary, extra.summary),
    who: pick(base.who, extra.who),
    keyPoints: pick(base.keyPoints, extra.keyPoints),
    issues: pick(base.issues, extra.issues),
    virtualCases: pick(base.virtualCases, extra.virtualCases),
    requirements: pick(base.requirements, extra.requirements),
    alternatives: pick(base.alternatives, extra.alternatives),
  };
}
