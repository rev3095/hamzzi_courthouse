// 절차 안내 규칙 (F-014 데모 축소판, DEC-021). 순수 함수 — LLM을 쓰지 않는다.
// 사건 유형과 '먼저 추천할 단계'는 질문 문장(이 기기에 있을 때)·결과의 법령 이름·분야 낱말로 규칙에 따라 정한다.
// 결과(승소·처벌 등)를 판정하지 않고, 단계와 난이도 라벨만 고른다 (DEC-002, 절대 규칙 2).
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  DIFFICULTY_LABEL,
  LEASE_DEPOSIT_STEPS,
  MONEY_STEPS,
  OFFICIAL,
  stepsOf,
  type OfficialLink,
  type ProcedureStep,
  type StepKey,
} from "./steps";

/**
 * money = 돈을 돌려받는 민사 절차, lease_deposit = 주택 임대차 보증금,
 * labor = 임금·퇴직금·해고, criminal = 형사 고소만, defendant = 소장·지급명령·고소를 받은 쪽, other = 정하지 못함
 */
export type CaseType = "money" | "lease_deposit" | "labor" | "criminal" | "defendant" | "other";

type Input = Pick<DemoAnalysisResult, "intent" | "articles">;

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

// 받은 쪽(갚아야 하는 쪽) 신호. 서류를 받았다·소송·고소를 당했다
const DEFENDANT =
  /(지급명령|소장|내용증명|고소장|이행권고결정)(정본)?(이|을|를)?(왔|받았|받음|송달|날아)|소송을?당|고소를?당|청구를?당|피소|제가피고|피고가됐|피고가되|피고로/;
// 갚으라는 요구를 받은 쪽 신호. 돈을 받는 쪽 신호와 함께 나오면 어느 쪽인지 알 수 없어 타임라인을 숨긴다
const DEBTOR = /갚아야하|안갚아도|갚으래|갚으라는데|갚으라고하|돌려달라는|돌려달래|물어내라/;
const CREDITOR = /빌려준|빌려줬|돌려받|못받|안받|받을수있|받아야|안돌려|돌려주지않|안줘|안준|안주/;
const COMMERCIAL = /상가/;
const LABOR_WORD = /임금|월급|급여|퇴직금|해고|체불|수당/;
const LABOR_LAW = /^(근로기준법|근로자퇴직급여보장법|최저임금법|임금채권보장법)$/;
const MONEY_WORD =
  /돌려받|돌려주|돌려줘|보증금|계약금|대여금|빌려준|빌려줬|갚|못받|안받|안줘|안준|안주|대금|물건값|환불|배상|미지급|받을수있/;
const DEPOSIT_WORD = /보증금|전세금/;

/** 사건 유형 (규칙). 질문 문장이 없으면 결과의 법령·분야만으로 정한다 */
export function classifyCase(r: Input, question: string | null): CaseType {
  const text = norm([question ?? "", r.intent.area, r.intent.goal].join(" "));
  const laws = new Set([...r.intent.laws, ...r.articles.map((a) => a.lawName)].map((l) => norm(l)));
  const hasLaw = (re: RegExp) => [...laws].some((l) => re.test(l));

  if (DEFENDANT.test(text)) return "defendant";
  if (DEBTOR.test(text)) return CREDITOR.test(text) ? "other" : "defendant";
  if (hasLaw(LABOR_LAW) || LABOR_WORD.test(text)) return "labor";
  const civil =
    laws.has("민법") || laws.has("주택임대차보호법") || laws.has("상가건물임대차보호법");
  if (laws.has("형법") && !civil) return "criminal";
  if (!MONEY_WORD.test(text)) return "other";
  // 상가 임대차는 임차권등기명령 준비물(주민등록)이 달라 일반 금전 절차로 안내한다
  const commercial = COMMERCIAL.test(text) || laws.has("상가건물임대차보호법");
  if (
    !commercial &&
    DEPOSIT_WORD.test(text) &&
    (laws.has("주택임대차보호법") || /임대차|전세|월세/.test(text))
  ) {
    return "lease_deposit";
  }
  return "money";
}

export type ProcedurePlan =
  | {
      kind: "timeline";
      caseType: "money" | "lease_deposit";
      steps: ProcedureStep[];
      recommended: ProcedureStep;
      /** 왜 이 단계를 먼저 추천하는지 (고정 문구) */
      reason: string;
      /** 형사 절차가 따로 있다는 안내 (사기 등 형사·민사가 겹칠 때) */
      note: string | null;
    }
  | {
      kind: "notice";
      caseType: Exclude<CaseType, "money" | "lease_deposit">;
      title: string;
      body: string;
      links: OfficialLink[];
    };

const RECOMMENDED: StepKey = "notice";

const REASON: Record<"money" | "lease_deposit", string> = {
  money:
    "상대방에게 돈을 돌려 달라고 요구하는 상황으로 보여서, 요구 내용을 문서로 남기는 단계부터 안내해요. 증거 정리는 함께 해 두면 좋아요.",
  lease_deposit:
    "보증금을 돌려 달라고 요구하는 상황으로 보여서, 요구 내용을 문서로 남기는 단계부터 안내해요. 이사 계획이 있으면 임차권등기명령도 함께 살펴보세요.",
};

const NOTICE: Record<
  Exclude<CaseType, "money" | "lease_deposit">,
  { title: string; body: string; links: OfficialLink[] }
> = {
  labor: {
    title: "임금·퇴직금·해고 문제는 절차가 따로 있어요",
    body: "고용노동부 진정이나 노동위원회 구제신청처럼 민사 소송과 다른 절차가 있어요. 신청할 수 있는 기간이 정해져 있는 절차도 있으니 공식 안내에서 서둘러 확인해 주세요.",
    links: [OFFICIAL.moel, OFFICIAL.nlrc, OFFICIAL.klac],
  },
  criminal: {
    title: "형사 고소 절차는 이 안내와 달라요",
    body: "고소는 경찰서나 공식 신고 창구에서 안내를 받을 수 있어요. 피해 금액을 돌려받는 민사 절차는 따로 진행돼요.",
    links: [OFFICIAL.police, OFFICIAL.cyberPolice, OFFICIAL.klac],
  },
  defendant: {
    title: "받은 소장·지급명령에 답하는 절차는 이 안내 범위 밖이에요",
    body: "서류에 적힌 기간 안에 답변서·이의신청 등을 내야 할 수 있어요. 받은 서류와 법원 안내를 먼저 확인하고, 필요하면 전문가와 상담하세요.",
    links: [OFFICIAL.proSe, OFFICIAL.klac],
  },
  other: {
    title: "이 질문에 맞는 절차 안내를 정하지 못했어요",
    body: "돈을 돌려받는 민사 절차인지 판단하기 어려워 절차 타임라인을 생략했어요. 아래 세부 내용에서 찾은 법령·판례를 확인해 주세요.",
    links: [OFFICIAL.proSe, OFFICIAL.klac],
  },
};

/** 결과 화면에 보일 절차 안내. 타임라인이거나, 타임라인을 숨기고 유형 안내만 */
export function procedurePlan(r: Input, question: string | null): ProcedurePlan {
  const caseType = classifyCase(r, question);
  if (caseType === "money" || caseType === "lease_deposit") {
    const steps = stepsOf(caseType === "money" ? MONEY_STEPS : LEASE_DEPOSIT_STEPS);
    const lawNames = new Set(
      [...r.intent.laws, ...r.articles.map((a) => a.lawName)].map((l) => norm(l)),
    );
    return {
      kind: "timeline",
      caseType,
      steps,
      recommended: steps.find((s) => s.key === RECOMMENDED)!,
      reason: REASON[caseType],
      note: lawNames.has("형법")
        ? "사기 등 형사 고소를 함께 생각하신다면, 고소는 이 민사 절차와 따로 진행돼요."
        : null,
    };
  }
  return { kind: "notice", caseType, ...NOTICE[caseType] };
}

/** 결과 머리의 사실 요약 (확률·가능성 없이 개수만) */
export function evidenceSummary(r: Pick<DemoAnalysisResult, "articles" | "cases" | "answer">) {
  const answered = r.answer.points.length > 0;
  const cases = answered ? r.cases.filter((c) => c.used).length : r.cases.length;
  const articles = answered ? r.articles.filter((a) => a.used).length : r.articles.length;
  return answered
    ? `근거 판례 ${cases}건 · 관련 조문 ${articles}개`
    : `찾은 판례 ${cases}건 · 찾은 조문 ${articles}개`;
}

export const difficultyLabel = (s: Pick<ProcedureStep, "difficulty">) =>
  DIFFICULTY_LABEL[s.difficulty];

/** 첫 단계 추천 문장 */
export function recommendText(step: Pick<ProcedureStep, "label">): string {
  return `현재 위 내용을 기반으로 먼저 ${step.label}${josaEulReul(step.label)} 추천드립니다`;
}

/** 받침 있으면 "을", 없으면 "를" (한글 마지막 글자 기준, 괄호 안 설명은 뺀다) */
export function josaEulReul(word: string): "을" | "를" {
  const w = word.replace(/\s*\(.*\)\s*$/, "").trim();
  const code = w.charCodeAt(w.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "를";
  return code % 28 === 0 ? "를" : "을";
}
