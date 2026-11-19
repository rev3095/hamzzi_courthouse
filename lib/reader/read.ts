// 오프라인 판독기 (DEC-048) — 인터넷·AI·법령 데이터 없이 질문 문장만으로 정리한다. 순수 함수.
// 순서: 개인정보 가리기 → 위급 신호 → 입장(받는 쪽인지) → 섹션 점수(낱말 사전 + 기존 절차 규칙) → 확신 정도
//      → 절차 타임라인(고정 문안) → 적어 준 사실·더 확인할 것 → 비슷한 예시.
// 하지 않는 것: 법령·판례 인용, 조문 번호, 새 숫자(기간·금액), 승패·유불리·처벌 가능성 판단 (절대 규칙 1·2·3).
import type { CategoryKey } from "@/lib/procedure/categories";
import { CATEGORIES } from "@/lib/procedure/categories";
import { classifyCase, procedurePlan, type ProcedurePlan } from "@/lib/procedure/policy";
import type { SectionLabel } from "@/lib/procedure/sections";
import { scanInput } from "@/lib/pii";
import { checklistFor, type Checklist } from "./checklist";
import { similarExamples, type ExampleRef } from "./examples";
import { extractFacts, type Facts } from "./facts";
import {
  LEXICON,
  MILITARY_CONTEXT,
  NEEDS_MILITARY,
  PRECEDENCE,
  normText,
  type Section,
} from "./lexicon";
import { detectRole, isPlaintiff, ROLE_TEXT, type Role } from "./role";

/** 판독 결과에 붙이는 고지 — AI가 만들지 않았으므로 AI_NOTICE 대신 쓴다 */
export const READER_NOTICE = "규칙으로 정리한 안내 · AI 생성 아님 · 법률 자문 아님";
/** 법령·판례 데이터가 없을 때 안내 */
export const NO_DATA_NOTE =
  "지금은 인터넷 없이 정리했어요. 관련 법령과 판례는 인터넷에 연결한 뒤 햄찌법원에서 확인할 수 있어요.";
export const URGENT_NOTE =
  "지금 위험하다면 이 안내보다 경찰 긴급신고가 먼저예요. 마음이 많이 힘들다면 자살예방 상담전화나 정신건강 상담전화로 바로 연락해 주세요.";

/** 절차를 정하지 못했을 때 (웹 안내는 찾은 법령을 보라고 하지만, 인터넷 없이는 찾은 법령이 없다) */
export const OFFLINE_OTHER_BODY =
  "어떤 절차에 해당하는지 정하지 못해 절차 순서를 생략했어요. 아래에서 가까운 분야를 골라 보세요. 법·제도에 대한 생각이나 궁금증이라면 인터넷에 연결한 뒤 햄찌법원 커뮤니티에서 이야기해 볼 수 있어요.";

export const MIN_CHARS = 8;

export type Confidence =
  /** 한 섹션이 뚜렷하다 */
  | "clear"
  /** 두세 섹션이 비슷하게 걸린다 — 고를 수 있게 함께 보인다 */
  | "multiple"
  /** 힌트는 있지만 약하다 — 맞는지 고르게 한다 */
  | "tentative"
  /** 사용자가 직접 고른 분야 */
  | "chosen"
  /** 정하지 못했다 */
  | "unknown";

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  clear: "이 절차에 해당하는 이야기로 보여요.",
  multiple: "여러 절차가 함께 걸려 보여요. 가장 가까운 것부터 보여 드려요.",
  tentative: "이 절차일 수 있어요. 맞지 않으면 아래에서 다른 분야를 골라 주세요.",
  chosen: "고르신 분야의 절차로 안내해요.",
  unknown: "어떤 절차인지 정하지 못했어요. 아래에서 가까운 분야를 골라 주세요.",
};

export type ReaderInput = {
  question: string;
  /** 사용자가 고른 분야. 요구하는 쪽 질문이면 판독 결과보다 먼저 쓴다 */
  category?: CategoryKey | null;
};

export type ScoredSection = { section: Section; score: number };

export type ReaderResult =
  | { status: "too_short"; notice: string; minChars: number }
  | {
      status: "read";
      /** 화면·평가용 대표 라벨 (none = 절차 섹션을 정하지 않음) */
      label: SectionLabel;
      section: Section | null;
      confidence: Confidence;
      confidenceText: string;
      role: Role;
      roleText: string;
      /** 함께 걸린 섹션 (최대 2) */
      also: Section[];
      /** 점수 상위 (분야 고르기 버튼용, 최대 4) */
      candidates: ScoredSection[];
      plan: ProcedurePlan;
      facts: Facts;
      checklist: Checklist;
      examples: ExampleRef[];
      masked: string;
      /** 가린 개인정보 종류 수 (0이면 가린 것 없음) */
      maskedCount: number;
      /** 건강·범죄경력 등 민감정보로 보이는 내용이 있음 */
      sensitive: boolean;
      urgent: boolean;
      notes: string[];
      notice: string;
    };

const URGENT =
  /(지금|당장|계속|또)(때리|때려|죽이|찌르|위협|협박|쫓아|따라와)|죽이겠다|죽여버|칼(을|로)|흉기|죽고싶|자살|자해|살려주|목숨/;

// 법·제도 의견, 가정해 보는 질문, 뉴스 이야기 (DEC-047 커뮤니티로 안내). 내 일이라는 표현이 함께 있으면 보지 않는다
const CHATTER =
  /만약에?|가정해|궁금해서|궁금한데|궁금합니다|궁금하네|어떻게생각|여러분|님들|다들어떻게|형량(이|은)?(너무|왜|적)|법(이|은)?왜|판결(이|은)?(너무|왜)|뉴스|기사(에|를|보니)|판사(는|들|가되)|이게말이|말이됨|말이되나|법공부|공부하는데|차이가뭐|왜(자꾸|이렇게|저렇게|다들)|이중잣대|아님$|아니냐|냐고|하는거임|인거임|대법원장|판사(한테|야|님|이름)|법원게시판|법안|개정(안|해야|하자)|현행법|입법|아이디어|구상해|제도개선/;
const PERSONAL =
  /저희|저를|저한테|제(남편|아내|아이|돈|집|차|명의|가게|회사)|우리(집|애|아이|엄마|아빠|가족|회사)|당했|받았|당하고|생겼|겪고|보냈|빌려줬|맞았|다쳤|잘렸|돌아가셨|못받|안줘|안준|들어왔/;

const COURT_PAPER = /소장|지급명령|이행권고|법원|소송|민사/;

/** 의견·가정 표현이 하나라도 있고 내 일이라는 표현이 없거나, 의견 표현이 여럿이면 잡담으로 본다 */
export function isChatter(text: string): boolean {
  const hits = new Set(text.match(new RegExp(CHATTER.source, "g")) ?? []).size;
  return (hits >= 1 && !PERSONAL.test(text)) || hits >= 3;
}

/** 기존 절차 규칙(lib/procedure/policy)이 보는 받는 쪽 결과 */
const RESPONDENT: ReadonlySet<string> = new Set([
  "military_criminal",
  "respond_criminal",
  "respond_civil",
  "defendant",
]);
/** 기존 규칙의 결과 가운데 넓게 걸리는 것 — 낱말 점수가 더 뚜렷하면 그쪽을 따른다 */
const GENERIC: ReadonlySet<string> = new Set(["money", "contract_deposit", "crime_report"]);
const RULE_BONUS = 2;
const GENERIC_BONUS = 1;
const CLEAR_AT = 3;
/** 이보다 긴 질문(공백 뺀 글자 수)은 LONG_CLEAR_AT 이상이어야 뚜렷하다고 본다 */
const LONG_AT = 160;
const LONG_CLEAR_AT = 6;

const BARE = {
  intent: { area: "", goal: "", laws: [] as string[], lawKeywords: [] as string[] },
  articles: [],
};

const ASKING = /[?？]|나요|까요|가요|되나|있나|없나|맞나|할지|해야|방법|어떻게|어떡|알려/;

/**
 * 긴 글에서 무게를 둘 부분: 첫 줄(제목)과 묻는 문장. 사연이 길면 지나가며 쓴 낱말(옛날 일, 남의 일)이
 * 섹션을 바꾸지 않게 이 부분에 나온 신호를 한 번 더 센다. 두 문장 이하인 질문은 빈 문자열(전부가 같은 무게).
 */
export function focusText(masked: string): string {
  const parts = masked
    .split(/\n+|(?<=[.!?？])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length <= 2) return "";
  return normText([parts[0], ...parts.slice(1).filter((x) => ASKING.test(x))].join(" "));
}

/** 섹션별 낱말 점수 (군 섹션은 군 맥락이 있을 때만). focus(제목·묻는 문장)에 나온 강한 신호는 한 번 더 센다 */
export function scoreSections(text: string, focus = ""): Map<Section, number> {
  const military = MILITARY_CONTEXT.test(text);
  const scores = new Map<Section, number>();
  for (const [section, signals] of Object.entries(LEXICON) as [
    Section,
    (typeof LEXICON)[Section],
  ][]) {
    if (NEEDS_MILITARY.has(section) && !military) continue;
    let sum = 0;
    for (const sig of signals) {
      if (sig.re.test(text)) sum += sig.w;
      if (focus && sig.w >= 2 && sig.re.test(focus)) sum += 1;
    }
    if (sum > 0) scores.set(section, sum);
  }
  return scores;
}

const rank = (scores: Map<Section, number>): ScoredSection[] =>
  [...scores.entries()]
    .map(([section, score]) => ({ section, score }))
    .sort(
      (a, b) => b.score - a.score || PRECEDENCE.indexOf(a.section) - PRECEDENCE.indexOf(b.section),
    );

/** 받는 쪽 섹션 (입장이 claimant가 아닐 때 고른다) */
function respondentSection(role: Role, text: string, scores: Map<Section, number>): Section | null {
  if (role === "accused")
    return MILITARY_CONTEXT.test(text) ? "military_criminal" : "respond_criminal";
  if (role === "sued") return "respond_civil";
  // 갚을 쪽이어도 빚 정리·상속(상속 빚을 갚으라는 요구) 절차는 그 사람의 절차다
  if (role === "owes") {
    for (const k of ["debt_relief", "inheritance"] as Section[]) if ((scores.get(k) ?? 0) >= CLEAR_AT) return k;
  }
  return null;
}

/** 질문 하나를 판독한다 */
export function readOffline(input: ReaderInput): ReaderResult {
  const scan = scanInput(input.question ?? "");
  const masked = scan.maskedText.normalize("NFKC").trim();
  if (masked.replace(/\s+/g, "").length < MIN_CHARS) {
    return { status: "too_short", notice: READER_NOTICE, minChars: MIN_CHARS };
  }
  const text = normText(masked);
  const urgent = URGENT.test(text);

  // 입장: 이 판독기의 규칙과 기존 절차 규칙 가운데 받는 쪽 신호가 있으면 받는 쪽이다
  const ruled = classifyCase(BARE, masked);
  let role = detectRole(text);
  // 기존 규칙은 내용증명만 받아도 서류를 받은 쪽으로 본다 — 법원 서류가 아니므로 이 판독기는 갚을 쪽 여부만 본다
  if (role === "claimant" && RESPONDENT.has(ruled) && !isPlaintiff(text)) {
    const onlyNotice = ruled === "respond_civil" && !COURT_PAPER.test(text);
    role = onlyNotice ? "claimant" : ruled === "respond_civil" ? "sued" : ruled === "defendant" ? "owes" : "accused";
  }

  // 섹션 점수: 낱말 사전 + 기존 규칙이 고른 섹션에 보너스
  const scores = scoreSections(text, focusText(masked));
  // 받는 쪽 섹션의 뚜렷한 낱말(군무이탈·지급명령 송달 등)도 입장으로 본다
  if (role === "claimant") {
    if (
      (scores.get("military_criminal") ?? 0) >= CLEAR_AT ||
      (scores.get("respond_criminal") ?? 0) >= CLEAR_AT
    )
      role = "accused";
    else if (
      (scores.get("respond_civil") ?? 0) >= CLEAR_AT &&
      COURT_PAPER.test(text) &&
      !isPlaintiff(text)
    )
      role = "sued";
  }
  if (ruled !== "other" && !RESPONDENT.has(ruled)) {
    const key = ruled as Section;
    scores.set(key, (scores.get(key) ?? 0) + (GENERIC.has(ruled) ? GENERIC_BONUS : RULE_BONUS));
  }
  // 받는 쪽 섹션은 입장으로만 고른다 (낱말 점수만으로 받는 쪽 절차를 보이지 않게)
  for (const k of ["respond_criminal", "respond_civil", "military_criminal"] as Section[]) {
    if (role === "claimant") scores.delete(k);
  }
  const ranked = rank(scores);

  let section: Section | null;
  let confidence: Confidence;
  const forced = respondentSection(role, text, scores);
  if (isChatter(text)) {
    // 내 사건이 아닌 이야기(법·제도 의견, 가정, 뉴스)는 절차 섹션을 고르지 않는다 — 화면이 커뮤니티와 분야 고르기를 안내
    section = null;
    confidence = "unknown";
  } else if (forced) {
    section = forced;
    confidence = "clear";
  } else if (role === "owes") {
    // 서류 없이 갚아야 하는 쪽은 타임라인 범위 밖 (요구하는 쪽 절차를 보이지 않는다)
    section = null;
    confidence = "clear";
  } else {
    const top = ranked[0];
    const second = ranked[1];
    // 긴 사연은 지나가며 쓴 낱말이 많아 뚜렷하다고 보는 기준을 높인다 (커뮤니티 묶음에서 확인, 2026-11-20)
    const long = text.length > LONG_AT;
    const clearAt = long ? LONG_CLEAR_AT : CLEAR_AT;
    if (top && top.score >= CLEAR_AT) {
      section = top.section;
      const close = second && second.score >= CLEAR_AT && second.score >= top.score - 1;
      confidence = close ? "multiple" : top.score >= clearAt ? "clear" : "tentative";
    } else if (top && top.score >= 2) {
      section = top.section;
      confidence = "tentative";
    } else {
      section = null;
      confidence = "unknown";
    }
  }
  // 사용자가 직접 고른 분야는 판독보다 먼저다. 단 받는 쪽(수사·소송 서류·갚을 쪽)으로 읽힌 질문은 그 입장의 절차를 지킨다
  if (input.category && role === "claimant") {
    section = CATEGORIES[input.category].track as Section;
    confidence = "chosen";
  }

  const also = ranked
    .filter((r) => r.section !== section && r.score >= 2)
    .slice(0, 2)
    .map((r) => r.section);
  const candidates = ranked.filter((r) => r.section !== section).slice(0, 4);

  const basePlan = procedurePlan(
    { ...BARE, section: section ?? "none" },
    section ? masked : null,
    confidence === "chosen" ? input.category : null,
  );
  const plan: ProcedurePlan =
    basePlan.kind === "notice" && basePlan.caseType === "other"
      ? { ...basePlan, body: OFFLINE_OTHER_BODY }
      : basePlan;
  const facts = extractFacts(masked);
  const checklist = checklistFor(section, role, facts, text);
  const notes: string[] = [NO_DATA_NOTE];
  if (urgent) notes.unshift(URGENT_NOTE);

  return {
    status: "read",
    label: section ?? "none",
    section,
    confidence,
    confidenceText: CONFIDENCE_TEXT[confidence],
    role,
    roleText: ROLE_TEXT[role],
    also,
    candidates,
    plan,
    facts,
    checklist,
    examples: similarExamples(section, masked),
    masked,
    maskedCount: scan.findings.length,
    sensitive: scan.sensitive.length > 0,
    urgent,
    notes,
    notice: READER_NOTICE,
  };
}
