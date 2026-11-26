// 검색 '물어보기' AI 답 (DEC-076) — 타입과 고정 문구. 순수 모듈이라 브라우저 묶음에서도 쓴다.
// 검색(/search)은 처음 찾는 사람용 '한눈에 답', 리서치(/research)는 업무용 '리서치 브리프'로 같은 재료를 다르게 짠다.
// 모델(Haiku)이 쓰는 것은 문장(해석·요약·쓰이는 곳·성립 조건·쟁점·더 찾을 검색어·가상 사례)뿐이고,
// 찾은 법령·판례 목록과 건수는 법제처·각국 공식 사이트 검색 결과를 코드가 센 것이다.
import type { CountryCode } from "@/lib/search/world/types";

export type AnswerMode = "search" | "research";
/** 검색어를 받은 자료 종류 — 판례 탭이면 판례를, 법령 탭이면 법령을 더 많이 싣는다 */
export type AnswerFocus = "cases" | "laws";

export type AnswerLaw = {
  name: string;
  /** 법령구분명 또는 해외 출처의 종류 */
  kind: string | null;
  country: CountryCode;
  /** 사이트 안 주소 (국내 법령은 /laws/{이름}) */
  href: string | null;
  sourceUrl: string;
  source: string;
  /** 해외 법령의 한국어 이름 (catalog에 직접 적은 것만) */
  titleKo?: string;
  /** 자주 쓰는 법령 표(lib/search/rank.ts)에 있는지 */
  core?: boolean;
};

export type AnswerCase = {
  id: string;
  caseNo: string;
  caseName: string;
  court: string;
  decidedAt: string | null;
  sourceUrl: string;
};

/** 성립 조건 한 줄. cite는 모델이 댄 근거 조문, confirmed는 법제처에서 실존을 확인한 것만 (DEC-071) */
export type AnswerCondition = {
  text: string;
  cite: { lawName: string; articleNo: string } | null;
  confirmed: { label: string; href: string } | null;
};

export type AnswerVirtualCase = { title: string; situation: string; point: string };

export type SearchAnswer = {
  mode: AnswerMode;
  focus: AnswerFocus;
  /** 정규화한 검색어 (화면 제목) */
  query: string;
  /** 분야 이름 (예: 보건의료) — 구조도 맨 위 상자 */
  field: string;
  /** "이렇게 이해했어요" 한 문장 */
  intent: string;
  summary: string[];
  /** 어디서 쓰이나요 — 이 법령·쟁점이 문제 되는 장면 */
  usage: string[];
  conditions: AnswerCondition[];
  /** 리서치: 검토할 쟁점 (묻는 말) */
  issues: string[];
  /** 리서치: 더 찾아볼 검색어 */
  nextQueries: string[];
  laws: { domestic: AnswerLaw[]; foreign: AnswerLaw[] };
  cases: AnswerCase[];
  /** 법제처 판례 검색의 전체 건수 (주지 않으면 null) */
  casesTotal: number | null;
  /** 실제 판례가 없을 때만 — AI가 만든 가상 사례 */
  virtualCases: AnswerVirtualCase[];
  /** 실제로 검색에 쓴 말 (화면에 "이렇게 찾았어요"로 보인다) */
  searched: { ko: string[]; en: string[]; ja: string[] };
  /** 처음 만든 시각·마지막으로 덧붙인 시각 (ISO) */
  createdAt: string;
  updatedAt: string;
};

export type AnswerAiReason =
  "free_mode" | "budget" | "rate_limited" | "cost_cap" | "model_failed" | "off_topic";

export type SearchAnswerView = {
  /** AI 답을 만들지 못했으면 null (화면은 검색 결과만 보인다) */
  answer: SearchAnswer | null;
  ai: { used: true } | { used: false; reason: AnswerAiReason };
  /** 저장해 둔 답을 다시 썼는지 (DEC-076) */
  reused: boolean;
  notice: string;
  virtualNotice: string | null;
};

export const ANSWER_LIMITS = {
  field: 20,
  intent: 120,
  summary: { max: 3, chars: 220 },
  usage: { max: 4, chars: 140 },
  conditions: { max: 5, chars: 160 },
  issues: { max: 5, chars: 120 },
  nextQueries: { max: 5, chars: 30 },
  virtual: { max: 2, title: 40, chars: 260 },
  domesticLaws: 8,
  foreignLaws: 6,
  cases: { search: 4, research: 6 },
} as const;

/** 실제 판례가 이 수보다 적을 때만 가상 사례를 보인다 (법령 쉬운 설명과 같은 기준) */
export const ANSWER_REAL_CASES_ENOUGH = 1;

export const ANSWER_VIRTUAL_NOTICE =
  "이해를 돕기 위해 AI가 만든 가상 사례예요. 실제 판례나 실제 사건이 아니에요.";
export const ANSWER_VIRTUAL_TAG = "AI가 만든 가상 사례 · 실제 판례 아님";
/** 답 아래 한 줄 — 무엇이 AI 문장이고 무엇이 검색 결과인지 */
export const ANSWER_SOURCE_NOTE =
  "요약·쓰이는 곳·성립 조건은 AI(Light · Haiku 5.5)가 쓴 설명이에요. 법령·판례 목록과 건수는 법제처와 각 나라 공식 사이트에서 찾은 그대로예요.";
/** 저장해 둔 답을 다시 보여 줄 때 */
export const ANSWER_REUSED_NOTE = "같은 검색어로 만들어 둔 답을 다시 보여 드려요.";

export const ANSWER_REASON_TEXT: Record<AnswerAiReason, string> = {
  free_mode: "지금은 AI 답을 쓰지 않는 모드예요. 아래 검색 결과를 봐 주세요.",
  budget: "이번 주 AI 사용량을 다 써서 AI 답을 만들지 못했어요. 아래 검색 결과를 봐 주세요.",
  rate_limited: "잠시 AI 답을 너무 많이 만들었어요. 조금 뒤에 다시 물어봐 주세요.",
  cost_cap: "AI 답을 비용 한도 안에서 만들지 못했어요. 검색어를 짧게 바꿔 보세요.",
  model_failed: "AI 답을 만들지 못했어요. 아래 검색 결과를 봐 주세요.",
  off_topic: "법률과 관련된 검색어가 아니라서 AI 답을 만들지 않았어요.",
};
