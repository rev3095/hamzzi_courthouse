// 법령 쉬운 설명 (DEC-074) — 타입과 고정 문구. 순수 모듈이라 브라우저 묶음에서도 쓴다.
// 거르기 규칙은 policy.ts(서버·테스트), 모델 호출은 lib/ai/law-easy.ts(server-only).

/** 조문 한 개 — 쉬운 설명이 근거로 삼는 원문 */
export type EasyArticle = { articleNo: string; title: string; text: string };

export type EasyKeyPoint = { title: string; body: string; articleNo: string | null };
export type EasyIssue = { question: string; articleNo: string | null };
export type EasyVirtualCase = {
  title: string;
  situation: string;
  lawSays: string;
  articleNo: string | null;
};

export type EasyLaw = {
  lawName: string;
  /** 한눈에: 이 법이 무엇을 정하는지 2~4문장 */
  summary: string[];
  /** 핵심 내용 3~6개: 짧은 제목 + 쉬운 설명 + 근거 조문(그 법의 실제 조문 번호만) */
  keyPoints: EasyKeyPoint[];
  /** 자주 문제 되는 쟁점 2~5개 (묻는 말로) */
  issues: EasyIssue[];
  /** 누구에게 해당하나요 (1~3줄) */
  who: string[];
  /** 가상 사례 — 실제 사례가 2건 미만일 때만 채운다 */
  virtualCases: EasyVirtualCase[];
};

/** 모델이 낸 그대로의 모양 (거르기 전) */
export type EasyRaw = Omit<EasyLaw, "lawName">;

export const EASY_VIRTUAL_NOTICE =
  "이해를 돕기 위해 AI가 만든 가상 사례예요. 실제 판례나 실제 사건이 아니에요.";
export const EASY_SOURCE_NOTE =
  "쉬운 설명은 AI가 법령 원문을 풀어 쓴 것이에요. 정확한 내용은 원문에서 확인해 주세요.";
/** 가상 사례 카드에 붙이는 꼬리표 */
export const EASY_VIRTUAL_TAG = "AI가 만든 가상 사례 · 실제 판례 아님";
/** AI 설명을 못 만들어 조문 제목으로 정리했을 때의 한 줄 */
export const EASY_FALLBACK_NOTE = "지금은 AI 설명을 만들 수 없어 조문 제목으로 정리했어요.";

/** 실제 판례가 이 수보다 적을 때만 가상 사례를 만든다·보인다 */
export const EASY_REAL_CASES_ENOUGH = 2;

export const EASY_LIMITS = {
  summary: { max: 4, chars: 200 },
  keyPoints: { max: 6, title: 40, body: 320 },
  issues: { max: 5, chars: 120 },
  who: { max: 3, chars: 140 },
  virtual: { max: 2, title: 40, chars: 320 },
} as const;

/** AI를 쓰지 않은 이유 */
export type EasyAiReason =
  "free_mode" | "budget" | "cost_cap" | "model_failed" | "empty" | "no_articles";
export type EasyAiState = { used: true } | { used: false; reason: EasyAiReason };

/** 실제 판례 한 줄 (법제처 검색 결과 — 모델이 만들지 않는다) */
export type EasyRealCase = {
  id: string;
  caseNo: string;
  caseName: string;
  court: string;
  decidedAt: string | null;
  sourceUrl: string;
};

/** 해외 공개 기록 한 줄 (공식 공개 API가 준 글 그대로 — 모델이 만들지 않는다) */
export type EasyForeignRecord = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  date?: string;
  sourceUrl: string;
  source: string;
};
/** 해외 공개 기록 묶음 제목 */
export const EASY_FOREIGN_TITLE = "해외 공개 기록 · 미국 FDA 의료기기 리콜";
export const EASY_FOREIGN_NOTE =
  "미국 식품의약국(FDA)이 공개한 최근 의료기기 회수 기록이에요. 원문(영어) 그대로이고, 우리나라 법령이 적용된 사례는 아니에요.";

/** GET /api/v1/laws/{name}/easy 응답 */
export type EasyLawView = {
  lawName: string;
  easy: EasyLaw;
  /** 원문 조문 — 화면이 근거 조문·원문 전체 보기를 접어 둔 채로 보여 준다 */
  articles: (EasyArticle & { effectiveFrom: string | null })[];
  realCases: EasyRealCase[];
  /** 법제처 판례 검색이 실패했는지 — 실패는 "판례 없음"이 아니다. 실패하면 가상 사례도 만들지 않는다 */
  realCasesFailed?: boolean;
  /** 해외 공개 기록 (지금은 의료기기 법령일 때 미국 FDA 리콜 기록). 출처 원문 그대로, 번역·판단 없음 */
  foreignRecords?: EasyForeignRecord[];
  ai: EasyAiState;
  /** AI 문장이 있으면 AI_NOTICE, 없으면 SEARCH_NOTICE */
  notice: string;
  /** 가상 사례가 있을 때만 EASY_VIRTUAL_NOTICE */
  virtualNotice: string | null;
  /** AI 문장이 있을 때만 EASY_SOURCE_NOTE */
  sourceNote: string | null;
  sourceUrl: string;
};
