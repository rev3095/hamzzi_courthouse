// 문서 초안 도우미 순수 규칙 (DEC-023). legal_documents 게이트 뒤 — 화면·API 모두 게이트가 열렸을 때만 쓴다.
// 규칙으로 채우는 칸(사건명·제목·입증방법)과, Haiku가 사연을 시간 순서로 정리한 사실관계 문장을 거르는 검사.
// 이름·주소·금액은 사용자가 화면에서 직접 적는다 — 이 모듈과 모델은 그 값을 보지 않는다 (F-007).
import { citationsIn, isAssertive } from "@/lib/ai/policy";
import type { DocumentKind } from "@/lib/procedure/steps";
import { TRACKS, type TrackKey } from "@/lib/procedure/steps";

/** 사실관계 문장 수·길이 (모델 출력 상한과 맞춘다) */
export const DRAFT_LIMITS = { sentences: 8, sentenceChars: 140, missing: 4, missingChars: 60 };

/** 사건명 추천 (소장). 타임라인 섹션으로 고른 고정 문구 — 모르면 비워 둔다 */
const CASE_NAMES: Partial<Record<TrackKey, string>> = {
  lease_deposit: "임대차보증금 반환 청구의 소",
  contract_deposit: "계약금 반환 청구의 소",
  wage: "임금 청구의 소",
  fraud: "손해배상 청구의 소",
  traffic: "손해배상 청구의 소",
  neighbor: "손해배상 청구의 소",
};

/** 제목 추천 (내용증명) */
const SUBJECTS: Partial<Record<TrackKey, string>> = {
  lease_deposit: "임대차보증금 반환 요청",
  contract_deposit: "계약금 반환 요청",
  wage: "체불 임금 지급 요청",
  traffic: "손해배상 요청",
  neighbor: "피해 중단 및 배상 요청",
};

const LEND = /빌려준|빌려줬|대여금|대여/;

/** 사실관계를 넣을 칸 (화면에서도 쓰므로 가벼운 policy.ts에 둔다) */
export { FACTS_FIELD } from "./policy";

export type RuleSuggestions = Record<string, string>;

/**
 * 규칙으로 채우는 칸. 타임라인 섹션(lib/procedure classifyCase)과 그 섹션 첫 단계 '준비할 것' 목록만 쓴다.
 * 증거 번호(갑 제1호증…)는 코드가 매긴다 — 모델이 숫자를 만들지 않는다 (절대 규칙 3).
 */
export function ruleSuggestions(
  kind: DocumentKind,
  track: TrackKey | null,
  maskedStory: string,
): RuleSuggestions {
  const out: RuleSuggestions = {};
  if (!track) return out;
  const lend = track === "money" && LEND.test(maskedStory.replace(/\s+/g, ""));
  if (kind === "complaint") {
    const name = CASE_NAMES[track] ?? (lend ? "대여금 청구의 소" : undefined);
    if (name) out.caseName = name;
    const prepare = TRACKS[track].steps[0]?.prepare ?? [];
    const items = prepare.filter((p) => !/이름|연락처|주소/.test(p));
    if (items.length) {
      out.evidence = items.map((p, i) => `갑 제${i + 1}호증  ${p}`).join("\n");
    }
  } else if (kind === "demand-letter") {
    const subject = SUBJECTS[track] ?? (lend ? "대여금 반환 요청" : undefined);
    if (subject) out.subject = subject;
  }
  // 임차권등기명령·지급명령: 규칙 칸 없음 (당사자·금액·날짜는 사용자가 직접 적는다)
  return out;
}

const PARTY_WORDS: Record<DocumentKind, { me: string; other: string }> = {
  complaint: { me: "원고", other: "피고" },
  "demand-letter": { me: "본인", other: "귀하" },
  "lease-registration": { me: "신청인", other: "피신청인" },
  "payment-order": { me: "채권자", other: "채무자" },
  "criminal-complaint": { me: "고소인", other: "피고소인" },
  "compensation-order": { me: "신청인", other: "피고인" },
  "wage-petition": { me: "진정인", other: "피진정인" },
  "wage-advance": { me: "청구인", other: "사업주" },
  "dismissal-remedy": { me: "신청인", other: "피신청인" },
  "dismissal-review": { me: "재심신청인", other: "재심피신청인" },
  "lease-mediation": { me: "신청인", other: "피신청인" },
  "civil-mediation": { me: "신청인", other: "피신청인" },
  "financial-mediation": { me: "신청인", other: "피신청인" },
  "property-disclosure": { me: "채권자", other: "채무자" },
};

/** 원고·피고 / 보내는 사람·받는 사람 / 신청인·피신청인 / 채권자·채무자를 문장에서 부르는 말 */
export function partyWords(kind: DocumentKind): { me: string; other: string } {
  return PARTY_WORDS[kind];
}

const digitsOf = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/(\d),(?=\d{3})/g, "$1")
    .match(/\d+/g) ?? [];
const masksOf = (s: string) => s.match(/\[[^\]\s]{1,12}\]/g) ?? [];

/** 법률 판단·평가 낱말 — 사용자가 직접 쓴 낱말이 아니면 사실관계 문장에 넣지 않는다 */
const JUDGMENT_WORDS = [
  "위법",
  "불법",
  "부당",
  "책임이 있",
  "책임을 져",
  "과실",
  "의무가 있",
  "청구할 수 있",
  "권리가 있",
  "배상해야",
  "갚아야",
  "돌려줘야",
  "인정됩니다",
  "해당합니다",
  "성립",
  // 범죄 성립을 단정하는 표현 — 사용자가 직접 쓰지 않았으면 빼낸다 (무고 위험)
  "속였",
  "속여",
  "기망",
  "편취",
  "사기를 쳤",
  "처음부터",
];
/** 법령·판례를 끌어오는 문장 — 사실관계에는 쓰지 않는다 (인용 검증 대상이 아니므로 아예 막는다, 절대 규칙 1) */
const LEGAL_REF =
  /제\s*\d+\s*조|판례|판결|대법원|법원은|[가-힣]+법\s*(?:에|상|에서|에 따라|에 의하면)/;

export type FactDrop =
  "number" | "mask" | "assertive" | "judgment" | "citation" | "length" | "empty";

/**
 * 모델이 쓴 사실관계 문장 거르기 (절대 규칙 1·2·3, F-007).
 * - 숫자: 사연(마스킹본)에 같은 숫자가 있을 때만. 날짜·금액을 지어내지 않는다
 * - 가림 표시([이름1] 등): 사연에 있는 것만. 가린 값을 추측하지 않는다
 * - 단정 표현·법률 판단 낱말·법령·판례 언급이 있으면 뺀다
 */
export function screenFacts(
  sentences: string[],
  maskedStory: string,
): { kept: string[]; dropped: FactDrop[] } {
  const storyDigits = new Set(digitsOf(maskedStory));
  const storyMasks = new Set(masksOf(maskedStory));
  const story = maskedStory.normalize("NFKC");
  const kept: string[] = [];
  const dropped: FactDrop[] = [];
  for (const raw of sentences.slice(0, DRAFT_LIMITS.sentences)) {
    const s = raw.replace(/\s+/g, " ").trim();
    const reason: FactDrop | null = !s
      ? "empty"
      : s.length > DRAFT_LIMITS.sentenceChars
        ? "length"
        : digitsOf(s).some((d) => !storyDigits.has(d))
          ? "number"
          : masksOf(s).some((m) => !storyMasks.has(m))
            ? "mask"
            : isAssertive(s)
              ? "assertive"
              : LEGAL_REF.test(s) ||
                  citationsIn(s).articles.length > 0 ||
                  citationsIn(s).cases.length > 0
                ? "citation"
                : JUDGMENT_WORDS.some((w) => s.includes(w) && !story.includes(w))
                  ? "judgment"
                  : null;
    if (reason) dropped.push(reason);
    else kept.push(s);
  }
  return { kept, dropped };
}

/** 더 적으면 좋은 내용(질문형 안내). 숫자를 넣지 않는다 */
export function screenMissing(items: string[]): string[] {
  return items
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && s.length <= DRAFT_LIMITS.missingChars && !/\d/.test(s) && !isAssertive(s))
    .slice(0, DRAFT_LIMITS.missing);
}

/** 사실관계 칸에 넣을 글. 문단 번호는 코드가 매긴다 */
export function factsText(kind: DocumentKind, kept: string[]): string {
  if (kind === "complaint" || kind === "payment-order")
    return kept.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return kept.join("\n");
}
