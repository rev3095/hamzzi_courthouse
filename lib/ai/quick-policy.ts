// 빠른 답 먼저 (DEC-064) — 순수 규칙. 유료 분석이 근거를 찾고 답을 쓰는 동안(30초~3분) 로딩 화면에 먼저 보이는 짧은 요약.
// 인용 검증 전에 나가는 글이라 조문 번호·사건번호를 쓰지 못하게 하고(근거는 완성된 답에만), 사용자가 적지 않은 숫자(한글 수사 포함)·
// 단정 표현·개인정보 꼴이 든 문장은 버린다. 저장하지 않고, 완성된 답이 오면 화면에서 사라진다.
import { z } from "zod";
import { scanInput } from "@/lib/pii";
import { citationsIn, isAssertive, numberTokens } from "./policy";

export type QuickPreview = {
  /** 어떤 문제로 보이는지 1~2문장 */
  summary: string;
  /** 답이 달라질 수 있어 먼저 확인할 것 */
  checks: string[];
  /** 지금 해 둘 수 있는 일 */
  nextSteps: string[];
};

/** Haiku 요약 1건 상한: 입력 약 4,000토큰 $0.0004 + 출력 700토큰 $0.00035 → 여유를 두고 $0.002 */
export const QUICK_CAP_USD = 0.002;

export const QUICK_LIMITS = { summary: 200, item: 80, checks: 3, nextSteps: 3 } as const;

/** 화면에 늘 붙는 고정 문구 */
export const QUICK_NOTICE = "근거를 확인하는 중이에요 — 완성된 답변으로 곧 바뀌어요";

export const QuickRawZ = z.object({
  summary: z.string(),
  checks: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

/** 고정 객체라 요청마다 같다 */
export const QUICK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "checks", "nextSteps"],
  properties: {
    summary: { type: "string", description: "어떤 법률 문제로 보이는지 1~2문장, 200자 이내" },
    checks: {
      type: "array",
      items: { type: "string" },
      description: "답이 달라질 수 있어 먼저 확인할 사실 1~3개, 각 80자 이내",
    },
    nextSteps: {
      type: "array",
      items: { type: "string" },
      description: "지금 해 둘 수 있는 일 1~3개, 각 80자 이내",
    },
  },
} as const;

/** 날짜·항호목까지 원문의 숫자열을 모두 센다 (numberTokens는 날짜·조문 조각을 미리 지워서 따로 본다, legal-reviewer) */
const digitRuns = (t: string) =>
  t
    .normalize("NFKC")
    .replace(/\[[^\]]*\]/g, " ")
    .match(/\d+(?:[.,]\d+)*/g) ?? [];
/** numberTokens가 잡지 못하는 한글 수사 기간·금액 (이 거르기에만 쓴다) */
const WORD_EXTRA =
  /하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|(?:한|두|세|네)\s*주|[일이삼사오육칠팔구십]+\s*일(?![가-힣])|[일이삼사오육칠팔구십백천]+\s*(?:만|억)?\s*원/g;
const wordsExtra = (t: string) => (t.match(WORD_EXTRA) ?? []).map((w) => w.replace(/\s+/g, ""));
/** 검증 전 글이라 판정·확률 표현도 막는다 */
const JUDGMENT = /확률|가능성|승산|승소|패소|이길|질 수|유리|불리/;

/** 한 문장이 화면에 나가도 되는지. 통과하지 못하면 null */
export function quickLine(raw: string, max: number, question: string): string | null {
  const t = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > max) return null;
  if (scanInput(t).findings.length > 0 || isAssertive(t) || JUDGMENT.test(t)) return null;
  // 검증 전 글이라 조문 번호·사건번호는 쓰지 않는다 (근거는 완성된 답에만)
  const cited = citationsIn(t);
  if (cited.articles.length > 0 || cited.cases.length > 0 || /제\s*\d+\s*[조항호목]/.test(t))
    return null;
  // 숫자(단위 포함)·한글 수사는 사용자가 적은 것만 (절대 규칙 3)
  const q = numberTokens(question);
  const allowed = new Set([...q.digits, ...q.words]);
  const n = numberTokens(t);
  if (![...n.digits, ...n.words].every((x) => allowed.has(x))) return null;
  // 날짜 꼴·한글 수사 기간·금액도 질문에 같은 꼴이 있을 때만
  const qRuns = new Set(digitRuns(question));
  const qWords = new Set(wordsExtra(question));
  if (!digitRuns(t).every((d) => qRuns.has(d))) return null;
  return wordsExtra(t).every((w) => qWords.has(w)) ? t : null;
}

/** 모델이 쓴 요약을 거른다. 요약 문장이 빠지면 미리보기를 내지 않는다 */
export function screenQuick(raw: z.infer<typeof QuickRawZ>, question: string): QuickPreview | null {
  const summary = quickLine(raw.summary, QUICK_LIMITS.summary, question);
  if (!summary) return null;
  const list = (items: string[], max: number) =>
    [
      ...new Set(
        items.map((s) => quickLine(s, QUICK_LIMITS.item, question)).filter((s): s is string => !!s),
      ),
    ].slice(0, max);
  return {
    summary,
    checks: list(raw.checks, QUICK_LIMITS.checks),
    nextSteps: list(raw.nextSteps, QUICK_LIMITS.nextSteps),
  };
}
