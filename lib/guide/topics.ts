// 햄찌 안내 챗봇 고정 문안 (DEC-030). Claude 호출 없음 · 비용 0 · 대화 저장·로그 없음.
// 문안은 저장소 문서에 있는 내용만 쓴다. 바꿀 때는 각 항목의 `source`(근거 문서·절)를 먼저 고치고 문안을 맞춘다.
// - 결과를 확정하지 않는다 (절대 규칙 2, N1). 변호사법 항목은 "지금 운영 방식"만 말한다.
// - DEC-055(2026-11-25): 전면 무료(수익 0원, 유료화 계획 없음), 무료 상담·문서 대리 작성, 변호사 연결(Phase 2) 폐기.
//   자문 변호사·법무법인 정보는 싣지 않는다(사용자 결정 2026-11-25).
// - 계획(Phase 2·3)은 "계획·검토 중"으로만 쓴다. 가격·요금은 문서에 확정된 값이 없으므로 쓰지 않는다.
// - 숫자는 GUIDE_LIMITS에서만 가져온다. 값은 코드 상수와 같아야 한다 (policy.test.ts가 대조).
// 검사: lib/guide/policy.test.ts (단정·승률 표현, 숫자, 실제 페이지 링크, 하위 질문 참조)

import { AI_NOTICE, SEARCH_NOTICE } from "@/lib/api/respond";
import { developerEmail } from "@/lib/contact/policy";
import { PROCEDURE_NOTICE } from "@/lib/procedure/steps";

/** 정해진 안내라 AI 생성물이 아니다. SEARCH_NOTICE·DOCUMENT_NOTICE와 같은 방식 */
export const GUIDE_NOTICE = "정해진 안내 · AI 생성 아님";

/**
 * 안내에 쓰는 횟수. 브라우저 묶음에 서버 모듈(lib/inquiries/policy·lib/auth/rate-limit)을 끌어오지 않으려고
 * 값을 옮겨 두고, policy.test.ts가 원래 상수와 같은지 확인한다.
 */
export const GUIDE_LIMITS = {
  /** 비로그인 하루 질문 (DEC-024·055, ANON_QUESTION_LIMIT) */
  anonDaily: 10,
  /** 로그인 사용자 하루 질문 (DEC-035·055, USER_QUESTION_LIMIT) */
  userDaily: 30,
  /** 같은 네트워크 24시간 분석 (DEC-024, ANON_IP_DAILY_LIMIT) */
  ipDaily: 100,
  /** 예시 질문 재생 1시간 (DEC-027, EXAMPLE_RATE) */
  exampleHourly: 30,
  /** 판례 목록 검색 1시간 (DEC-017, SEARCH_RATE) */
  searchHourly: 60,
  /** 판례·조문 상세 1시간 (DEC-017, LOOKUP_RATE) */
  lookupHourly: 120,
  /** 같은 네트워크 분석 상한의 창 길이(시간) (DEC-024, app/privacy 1절) */
  ipWindowHours: 24,
  /** 질문·결과 보관 기간(일) (DEC-018, app/privacy 4절 — 파기 배치는 supabase 마이그레이션) */
  retentionDays: 30,
  /** 커뮤니티 글 하나에 쌓이는 씨앗 (DEC-047, SEEDS.post) */
  seedPost: 10,
  /** 커뮤니티 댓글 하나에 쌓이는 씨앗 (DEC-047, SEEDS.comment) */
  seedComment: 5,
  /** 서류 분석에 붙일 수 있는 사진 수 (DEC-052, CASEFILE_LIMITS.maxImages) */
  casefileImages: 30,
  /** 이만큼 넘게 적은 질문은 자세히 분석(DeepSearch)으로 답한다 (DEC-062, LONG_QUESTION_CHARS) */
  longQuestionChars: 100,
} as const;

const L = GUIDE_LIMITS;

/** 개발자 이메일 (사용자 요청 2026-11-18). 페이지 HTML을 긁는 봇이 바로 못 읽게 조각으로 두고 누를 때 합친다 (lib/contact/policy, DEC-051) */
export const guideEmail = developerEmail;

export const MENU_IDS = [
  "assistants",
  "rules",
  "features",
  "terms",
  "pricing",
  "lawyer-act",
  "roadmap",
  "contact",
] as const;

export type GuideLink = { href: string; label: string };

export type GuideTopic = {
  /** 버튼 글자 = 내가 고른 말풍선 */
  label: string;
  /** 햄찌 말풍선 문단 */
  lines: string[];
  /** 문단 아래 목록 (순서 있는 안내) */
  list?: string[];
  links?: GuideLink[];
  /** 하위 질문 버튼 */
  next?: string[];
  /** 개발자 연락처 — 누르면 이메일 표시 */
  contact?: true;
  /** 분야별 비서 고르기 버튼 (DEC-057) — 누르면 이 창이 그 비서와의 대화로 바뀐다 */
  assistants?: true;
  /** 근거 문서·절. 문안을 바꿀 때 이 문서와 맞춘다 */
  source: string;
};

const TERMS: GuideLink = { href: "/terms", label: "이용약관" };
const PRIVACY: GuideLink = { href: "/privacy", label: "개인정보처리방침" };
const SOURCES: GuideLink = { href: "/sources", label: "출처 표기" };
const CONTACT_FORM: GuideLink = { href: "/about/developer#contact", label: "문의 남기기" };
const LAWYER_ACT: GuideLink = {
  href: `/laws/${encodeURIComponent("변호사법")}`,
  label: "변호사법 조문 보기 (법제처)",
};

export const GUIDE_TOPICS: Record<string, GuideTopic> = {
  // ── ① 사이트 규정 ─────────────────────────────────────────
  rules: {
    label: "사이트 규정",
    source: "DEC-024, DEC-010 · app/terms 2절",
    lines: [
      "햄찌법원은 법령·판례를 근거로 바로 상담해 드리고 문서도 대신 작성해 드리는 전면 무료 서비스예요.",
      `로그인 없이 하루 ${L.anonDaily}번(이어 묻기 포함), Google로 로그인하면 하루 ${L.userDaily}번 질문할 수 있고, 한국 시간 0시가 지나면 다시 채워져요. 분석에 실패한 시도는 세지 않아요.`,
    ],
    links: [TERMS, PRIVACY],
    next: ["rules-examples", "rules-network", "rules-search", "rules-admin", "rules-privacy"],
  },
  "rules-examples": {
    label: "예시 질문도 횟수에 들어가요?",
    source: "DEC-027 · lib/auth/rate-limit.ts EXAMPLE_RATE",
    lines: [
      "예시 질문은 미리 분석해 둔 답변을 다시 보여 드리는 거라 하루 질문 횟수에서 빼요.",
      `대신 같은 네트워크에서 1시간에 ${L.exampleHourly}번까지 열 수 있어요.`,
    ],
    next: ["rules-network", "rules-admin"],
  },
  "rules-network": {
    label: "같은 와이파이에서 여러 명이 써요",
    source: "DEC-024 · OQ-009 · app/privacy 1절",
    lines: [
      `질문 횟수는 브라우저마다 세고, 같은 네트워크에서는 ${L.ipWindowHours}시간에 ${L.ipDaily}번까지 분석할 수 있어요.`,
      "햄찌법원 데이터베이스에는 IP 주소 대신 비밀값을 섞어 바꾼 값만 저장해요(웹 서버·데이터베이스 운영 업체의 접속 기록에는 IP 주소가 남을 수 있어요). 이 상한은 데모 기간 임시 값이라 바뀔 수 있어요.",
    ],
    links: [PRIVACY],
    next: ["rules-examples", "rules-search", "rules-abuse"],
  },
  "rules-abuse": {
    label: "법률과 상관없는 질문도 되나요?",
    source: "DEC-072 · lib/inquiries/abuse.ts",
    lines: [
      "햄찌법원은 법률 문제만 상담해요. 음식 추천, 코드·게임·앱 만들기, 그림 만들기, 글짓기·번역 같은 요청은 답하지 않아요.",
      "같은 글을 여러 번 붙여 넣은 질문도 받지 않아요. 반복을 지우고 한 번만 적어 주세요.",
      "지시문을 바꾸려는 글이나 AI가 법률과 상관없다고 본 요청이 짧은 시간에 여러 번 쌓이면 잠시 질문을 받지 않아요.",
      "자료를 붙이지 않은 같은 질문을 방금 분석했다면 새로 분석하지 않고, 웹 질문창에서는 앞의 답변으로 바로 가요.",
    ],
    next: ["rules-network", "rules-examples"],
  },
  "rules-search": {
    label: "판례 검색도 횟수를 써요?",
    source: "DEC-017 · DEC-070 · lib/auth/rate-limit.ts SEARCH_RATE·LOOKUP_RATE",
    lines: [
      "판례·법령 직접 검색은 질문 횟수와 따로 세요. 검색·리서치·판례 상세 화면의 '궁금한 점 바로 묻기'로 보낸 질문은 AI가 답하는 상담이라 질문 횟수에서 세요(Light 단계 고정).",
      `같은 네트워크에서 1시간에 목록 검색 ${L.searchHourly}번, 상세 보기 ${L.lookupHourly}번까지 쓸 수 있어요. 검색 결과는 법제처에서 가져온 자료를 AI 없이 보여 드려요(결정문은 요지만).`,
    ],
    links: [{ href: "/search", label: "판례·법령 검색" }],
    next: ["rules-examples"],
  },
  "rules-admin": {
    label: "관리자 모드가 뭐예요?",
    source: "DEC-024",
    lines: [
      "운영자가 서비스를 시험할 때 쓰는 모드예요. 운영자만 아는 비밀번호가 있어야 켜져요.",
      "관리자 모드가 켜진 브라우저는 질문 횟수 제한을 받지 않지만, AI 비용 상한은 그대로 적용돼요.",
    ],
    next: ["rules-network"],
  },
  "rules-privacy": {
    label: "적으면 안 되는 내용이 있어요?",
    source: "app/terms 3절 · app/privacy 1절 · DEC-006",
    lines: [
      "다른 사람을 알아볼 수 있는 정보는 빼고 적어 주세요. 서비스를 자동으로 반복 호출하거나 제한을 피하려는 행위도 하지 말아 주세요.",
      "이름·전화번호·주민등록번호·계좌번호처럼 보이는 부분은 가린 문장만 저장하고, 적으신 원문은 저장하지 않아요.",
    ],
    links: [PRIVACY],
  },

  // ── ② 기능 안내 (DEC-036·038·039·041·042) ─────────────────
  // ── 분야별 비서 (DEC-057) ─────────────────────────────────
  // 이 항목까지는 정해진 안내다. 비서를 고르면 같은 창이 비서 대화로 바뀌고, 그때부터만 자유 입력·AI 답변이 켜진다
  assistants: {
    label: "전문 에이전트와 대화하기",
    source: "DEC-057 · F-018",
    lines: [
      "집 계약, 온라인 명예훼손·성적 괴롭힘, 중고거래 사기를 맡는 전문 에이전트가 있어요. 아래에서 고르면 이 창에서 바로 대화할 수 있어요.",
      "전문 에이전트와의 대화는 AI가 상담하듯 먼저 정리하고, 답변 속 조문·판례는 법제처에서 확인하는 답변이에요. 분석이 끝난 질문마다 질문 한 번으로 세고(예시 질문 제외), 이름·연락처처럼 보이는 부분은 가려서 저장해요.",
    ],
    assistants: true,
    links: [{ href: "/assistants", label: "전문 에이전트 페이지에서 크게 보기" }],
  },
  features: {
    label: "기능 안내",
    source: "DEC-036 · DEC-038 · DEC-039 · DEC-041 · DEC-042 · DEC-052 · DEC-053 · DEC-058",
    lines: [
      "위쪽 메뉴(휴대폰은 아래 탭)는 상담 · 판례·법령 · 문서 작성 · 사건 · 광장 다섯 가지예요. '사건'에서는 사건 진행과 서류 분석(정리)을 골라 들어가요. 소개·문의는 오른쪽 위 메뉴 아이콘에, 로그인과 내 세션은 프로필 아이콘에 있어요.",
      "질문창에서 쓸 수 있는 기능을 골라 보세요. 답변 모드, 여러 사정이 얽힌 사연을 위한 DeepSearch, 예시 답변, 절차 안내, 내 세션이 있어요.",
    ],
    links: [{ href: "/about/features", label: "기능 가이드 전체 보기" }],
    next: [
      "features-tiers",
      "features-deep",
      "features-casefile",
      "features-materials",
      "features-matters",
      "features-examples",
      "features-procedure",
      "features-history",
      "features-community",
    ],
  },
  "features-tiers": {
    label: "Light · Pro · Pro Max는 뭐예요?",
    source: "DEC-036 · components/ask/TierSlider.tsx",
    lines: [
      "질문창 아래에서 답변 모드를 골라요. 요금제가 아니라 답변을 쓰는 AI 모델을 고르는 것이고, 지금은 어느 모드든 무료예요.",
      "세 모드 모두 답변을 먼저 쓰고 그 속의 조문·사건번호를 법제처에서 확인해요. 답변을 쓰는 모델만 달라요. Light는 가장 빠른 모델, Pro는 그 중간 모델, Pro Max는 답하기 전에 더 오래 생각하는 모델이에요. 처음에는 Pro로 맞춰져 있어요.",
      "고른 모드는 이 기기에만 기억해요. 운영자가 AI 답변을 꺼 둔 동안에는 모드 선택이 보이지 않아요. 비용 상한에 닿은 동안에는 어느 모드를 골라도 법제처 검색 결과만 보여 드려요.",
    ],
    next: ["features-deep", "pricing"],
  },
  "features-deep": {
    label: "DeepSearch는 언제 써요?",
    source: "DEC-038 · DEC-041",
    lines: [
      "여러 사정이 얽힌 사연은 질문창 아래 답변 모드 옆의 DeepSearch 버튼으로 물어보세요. 양식(있었던 일·상대방·지금까지 한 일·가지고 있는 자료·알고 싶은 것)이나 직접 입력으로 적어요.",
      `AI 답변이 켜져 있으면 질문창에 ${L.longQuestionChars}자 넘게 적었을 때 버튼을 누르지 않아도 자세히 분석(DeepSearch)으로 답해요. 이때는 답변 모드 슬라이더가 잠기고, 일반 질문보다 시간이 더 걸려요.`,
      "보내기 전에 시점·상대방처럼 빠진 내용이 있는지 알려 드려요. 적은 내용이 맞는지나 사건이 어떻게 될지는 판단하지 않아요.",
      "AI 답변이 켜져 있으면 결과에 쟁점별 답변과 사건 구조도·사실관계 흐름·쟁점별 근거·확인할 사실이 함께 나와요. 사연을 정리하지 못하면 일반 답변으로 보여 드려요. 그림에는 적어 주신 사실만 담아요.",
      "DeepSearch도 질문 한 번으로 세요. 창에 적는 중인 내용은 브라우저에 따로 저장하지 않고, 보낸 뒤에는 일반 질문처럼 가린 문장만 저장해요.",
    ],
    links: [{ href: "/examples/deep-lease-01", label: "DeepSearch 예시 보기" }],
    next: ["features-tiers", "rules"],
  },
  "features-casefile": {
    label: "서류 사진으로도 물어볼 수 있어요?",
    source: "DEC-052 · PRD F-015 · lib/casefile/limits.ts",
    lines: [
      `질문창 왼쪽의 붙이기 버튼이나 질문창 아래 '자료 올리기'로 내용증명·소장·계약서 같은 서류 사진이나 문서 파일(PDF·한글·워드·파워포인트·엑셀·텍스트)을 모두 합쳐 ${L.casefileImages}개까지 붙일 수 있어요. 끌어다 놓거나 붙여넣어도 돼요. 사진과 PDF는 그대로 AI에게 가고, 한글·워드 같은 문서는 글만 꺼내 개인정보를 가린 뒤 보내요.`,
      "사진은 동의를 받은 뒤에만 AI에게 보내 글자를 읽고, 서버에 저장하지 않아요. 읽은 내용은 개인정보를 가린 사건 개요로 정리해요. 첫 화면에서 올리면 읽은 내용으로 곧바로 분석하고, 서류 분석 화면('사건' 메뉴의 '정리')에서는 직접 고친 뒤에 분석을 시작해요.",
      "당사자는 서류에 적힌 역할로만 나눠 보여 드려요. 누가 옳은지, 사건이 어떻게 될지는 판단하지 않아요. 개인은 이름을 보여 주지 않고 찾아보지도 않아요.",
      "서류 분석 화면의 '예제로 먼저 보기'에서는 직접 쓴 가상 서류를 같은 순서로 미리 분석해 둔 예시를 질문 횟수와 상관없이 바로 볼 수 있어요.",
      "서류 분석도 질문 한 번으로 세요. AI 답변이 꺼져 있거나 비용 상한에 닿은 동안에는 사진을 읽지 못해서, 서류 내용을 글로 적어 물어봐 주세요.",
    ],
    links: [{ href: "/casefile", label: "서류 분석" }],
    next: ["features-materials", "features-deep", "rules"],
  },
  "features-materials": {
    label: "대화 캡처나 현장 사진도 붙일 수 있어요?",
    source: "DEC-058 · PRD F-017 · lib/materials/limits.ts",
    lines: [
      `DeepSearch·이어 묻기·판례 검색에서 대화 캡처·영수증·현장 사진 같은 자료 사진·문서를 ${L.casefileImages}개까지 붙일 수 있어요. 홈 질문창에 올린 자료는 곧바로 서류 분석으로 가요.`,
      "사진·파일은 동의를 받은 뒤에만 AI에게 보내 읽고, 서버에 저장하지 않아요. 사진과 PDF는 가리지 않은 채 그대로 가고, 한글·워드 같은 문서는 글만 꺼내 개인정보를 가린 뒤 보내요. 읽은 내용은 개인정보를 가려 보여 드리고, 직접 고친 뒤에 질문과 함께 보내요.",
      "자료 내용은 내 자료로만 답변에 쓰여요. 답변 속 조문·사건번호는 법제처에서 있는지 확인하고, 자료가 증거로서 어떤 의미가 있는지는 판단하지 않아요.",
      "자료를 붙인 질문도 한 번으로 세요. 판례 검색에서는 읽은 내용으로 검색어를 골라 법제처 자료만 찾아요.",
    ],
    links: [{ href: "/", label: "질문하러 가기" }],
    next: ["features-casefile", "rules"],
  },
  "features-matters": {
    label: "사건 진행은 뭐예요?",
    source: "DEC-053 · PRD F-016 · lib/matters/model.ts",
    lines: [
      "위쪽 메뉴의 '사건'(휴대폰은 아래 탭)에서 '진행'을 고르면 열려요. 맡은 사건을 순서대로 정리하는 도구예요. 서류를 읽어 사실관계와 당사자를 나누고, 구조도와 쟁점, 찾은 내용을 노트로 계속 덧붙여요.",
      "내 사건을 만들고 저장하려면 로그인해야 해요. 로그인하지 않았을 때는 미리 채워 둔 가상 사건으로 기능을 둘러볼 수 있어요(고친 내용은 저장되지 않아요). 사건 자료는 계정에 저장되고 본인만 볼 수 있어요. 본인 사건을 정리하는 도구라 서류에 적힌 이름은 그대로 두고, 연락처·주소·계좌·등록번호는 가려서 저장해요. 서류 사진은 저장하지 않아요.",
      "내 사건 목록에는 AI가 사건 자료를 읽고 법 분야와 한 줄 요약을 붙여요. 사건 이름을 비워 두고 만들면 제목도 지어요. 이때 AI에는 이름·연락처를 가린 글만 보내요.",
      "사건 자료를 정리하는 도구라 어느 쪽이 옳은지는 따로 정하지 않아요. AI 쟁점 정리에는 법제처에서 있다고 확인된 근거만 붙여요. 서류에서 읽은 법령 조문·사건번호도 법제처에서 확인된 것만 남기고 나머지는 가려요.",
      "기업 조사는 회사가 무엇을 하고 무엇을 파는지를 공개 자료에서 찾아 출처와 함께 정리해요. 회사만 조사하고, 사람 이름으로 보이는 이름은 받지 않아요. 상호·기관 표시가 없는 이름은 회사·기관 이름이라고 확인해야 조사해요.",
    ],
    links: [{ href: "/matters", label: "사건 진행" }],
    next: ["features-casefile", "rules"],
  },
  "features-examples": {
    label: "예시 답변은 어디서 봐요?",
    source: "DEC-027 · DEC-028",
    lines: [
      "홈 질문창 아래 '가이드'를 열고 '예시 답변'을 고른 뒤 분야 묶음을 누르면 그 묶음의 예시 질문과 답변을 볼 수 있어요.",
      "예시는 미리 분석해 두고 인용을 확인한 답변을 다시 보여 드리는 거라 질문 횟수에 들어가지 않아요.",
      "여러 예시는 화면에서 원고·피고, 고소인·피의자 쪽을 골라 볼 수 있고, 쪽마다 자세한 상황과 답변이 있고, 문서 작성 절차와 초안이 있는 쪽도 있어요.",
    ],
    links: [{ href: "/#examples", label: "예시 질문 보기" }],
    next: ["rules-examples", "features-procedure"],
  },
  "features-procedure": {
    label: "절차 안내는 어떻게 정해져요?",
    source: "DEC-021 · DEC-042 · DEC-043 · lib/procedure/steps.ts PROCEDURE_NOTICE",
    lines: [
      "결과 화면에는 비슷한 사건이 보통 거치는 절차 단계를 함께 보여 드려요. 분야를 고르지 않고 물어도 질문을 읽어 맞는 절차를 골라요.",
      "AI 답변이 켜져 있을 때 여러 문제가 섞인 사연이면 '함께 살펴볼 절차'가 나와요. 위 안내는 가장 먼저 물으신 문제 기준이고, 누르면 그 분야로 따로 물어볼 수 있어요.",
      `절차 단계 문구는 미리 정해 둔 문안이고, 화면에 '${PROCEDURE_NOTICE}'라고 함께 표시해요. 사건이 어떻게 될지는 판단하지 않아요.`,
      "맞는 절차가 없는 사연은 운영자가 빠진 분야를 살펴볼 수 있게 절차 이름과 낱말만 저장하고, 질문 문장은 저장하지 않아요.",
    ],
    next: ["features-examples", "features-deep"],
  },
  "features-community": {
    label: "광장과 씨앗은 뭐예요?",
    source: "DEC-047 · lib/community/policy.ts SEEDS·COMMUNITY_NOTICE",
    lines: [
      "광장(커뮤니티)은 법과 제도에 대한 의견, 가정해 보는 질문, 가벼운 이야기를 나누는 게시판이에요. 로그인하지 않아도 글과 댓글을 쓸 수 있어요.",
      "로그인하지 않고 쓸 때는 비밀번호를 정하고, 그 비밀번호로 수정하거나 지워요. Google로 로그인하고 쓰면 비밀번호 없이 그 계정으로 수정하고 지워요.",
      "글과 댓글은 이용자 의견이에요. AI가 쓰지 않고, 이름이나 연락처로 보이는 부분은 올릴 때 가려져요.",
      `로그인하고 쓰면 글 하나에 씨앗 ${L.seedPost}개, 댓글 하나에 ${L.seedComment}개가 쌓여요. 씨앗은 활동 기록이고, 돈이나 할인으로 바꾸지 않아요.`,
    ],
    links: [{ href: "/community", label: "광장" }],
    next: ["features-history", "pricing-future"],
  },
  "features-history": {
    label: "내 세션은 어떻게 남겨요?",
    source: "DEC-039 · DEC-035 · DEC-056",
    lines: [
      "Google로 로그인하면 질문창 아래에 '내 기록에 남기기'가 보여요. 켜고 보낸 질문과 답변이 마이페이지의 '내 세션'에 모여요. 사건 진행에서 만든 사건도 함께 보여요.",
      "마이페이지 왼쪽 목록에서 최근 세션을 날짜별로 보고 '더보기'로 더 볼 수 있어요. 오른쪽에서는 질문·사건으로 나눠 쪽 번호로 넘겨 보고, 세션 찾기로 글을 찾을 수 있어요.",
      "예시 질문은 기록 남기기를 켜도 남지 않아요. 질문은 가린 문장과 답변만 보관하고 보관 기간이 지나면 지워져요. 사건은 지우기 전까지 계정에 남아요.",
    ],
    links: [{ href: "/me", label: "마이페이지" }],
    next: ["roadmap-login", "rules-privacy"],
  },

  // ── ③ 이용약관 ───────────────────────────────────────────
  terms: {
    label: "이용약관",
    source: "app/terms 1~4절",
    lines: ["이용약관의 핵심을 정리해 드릴게요. 지금 약관은 초안이에요."],
    list: [
      "무료 법률 상담·문서 대리 작성 서비스예요. 이용료는 받지 않아요.",
      "햄찌 판사는 AI 캐릭터이고 실제 판사·변호사가 아니에요.",
      "답변은 AI가 써서 빠진 자료가 있을 수 있고, 사건의 결과를 예측하거나 보장하지 않아요.",
      "데모 기간에는 기능과 횟수가 바뀌거나 서비스가 멈출 수 있어요.",
    ],
    links: [TERMS],
    next: ["terms-privacy", "terms-liability", "terms-sources", "terms-ai"],
  },
  "terms-privacy": {
    label: "개인정보는 어떻게 처리해요?",
    source: "app/privacy 1·4절 · DEC-006 · DEC-018",
    lines: [
      "질문은 이름·전화번호 같은 부분을 가린 문장만 저장하고, 적으신 원문은 저장하지 않아요.",
      `저장한 질문과 결과는 ${L.retentionDays}일 동안 보관한 뒤 매일 자동으로 지워요. 언제든 직접 지울 수도 있어요.`,
    ],
    links: [PRIVACY, { href: "/privacy#delete", label: "내 기록 지우기" }],
    next: ["terms-ai"],
  },
  "terms-liability": {
    label: "책임 범위는 어떻게 돼요?",
    source: "app/terms 4절",
    lines: ["책임 범위와 분쟁 해결 방법은 이용약관에 적을 예정이에요."],
    links: [TERMS],
  },
  "terms-sources": {
    label: "법령·판례는 어디서 가져와요?",
    source: "app/sources · DEC-009",
    lines: [
      "법제처 국가법령정보센터 Open API에서 가져와요. 결과 화면의 법령·판례에는 원문 링크가 있어요.",
      "AI가 먼저 답하고, 답변에 적힌 조문·사건번호는 법제처에서 다시 조회해 실제로 있는지 확인해요. 없다고 확인된 인용이 든 문단은 빼고, 있다고 확인된 것에는 '법제처 확인'을 달아요. 확인하지 못한 인용은 표시 없이 남아요.",
    ],
    links: [SOURCES],
  },
  "terms-ai": {
    label: "답변은 AI가 쓴 건가요?",
    source: "CLAUDE.md 절대 규칙 6 · PRD 10장 고지 · lib/api/respond.ts",
    lines: [
      `AI가 만든 답변 문단에는 '${AI_NOTICE}'을 표시해요. 법제처 검색 결과에는 '${SEARCH_NOTICE}'을 표시해요.`,
      "지금 햄찌가 드리는 안내도 미리 정해 둔 문구라 'AI 생성 아님'으로 표시하고 있어요.",
    ],
  },

  // ── ④ 요금제 ─────────────────────────────────────────────
  pricing: {
    label: "요금제",
    source: "DEC-055 · DEC-001",
    lines: [
      "햄찌법원은 전면 무료라 이용자에게 요금을 받지 않아요.",
      "결제·과금 기능은 없고 만들 계획도 없어요. 요금제나 가격도 없어요.",
    ],
    next: ["pricing-future", "pricing-cost", "features-tiers"],
  },
  "pricing-future": {
    label: "나중에는 유료가 되나요?",
    source: "DEC-055 · DEC-001",
    lines: [
      "아니요. 햄찌법원은 수익을 받지 않는 전면 무료 서비스이고, 유료로 바꿀 계획이 없어요.",
      "구독·광고·건별 요금·변호사 수수료 모두 받지 않아요.",
    ],
    next: ["lawyer-act"],
  },
  "pricing-cost": {
    label: "운영 비용은 누가 내요?",
    source: "DEC-015 · DEC-026 · DEC-040",
    lines: [
      "AI 답변 비용은 운영자가 내고, 정해 둔 기간에 쓸 수 있는 금액에 상한을 두어요. 상한에 닿으면 그 기간에는 AI 답변 없이 법제처 검색 결과만 보여 드려요.",
      "예시 질문은 미리 분석해 둔 답변이라 비용이 들지 않아요.",
    ],
  },

  // ── ⑤ 변호사법과 이 사이트 ──────────────────────────────────
  // 운영 사실(DEC-001, DEC-055)과 살펴본 조항 이름만 쓴다.
  "lawyer-act": {
    label: "변호사법과 이 사이트",
    source: "DEC-001 · DEC-055 · docs/research/03_규제_쟁점.md",
    lines: ["지금 어떻게 운영하고 있는지 사실을 알려 드릴게요."],
    list: [
      "무료 법률 상담과 문서 대리 작성을 하고, 이용자에게 돈을 받지 않아요. 수익을 받지 않고 유료로 바꿀 계획도 없어요.",
      "플랫폼이 변호사를 골라 배정하지 않고, 변호사를 소개·알선하거나 수수료를 받지 않아요.",
    ],
    links: [TERMS],
    next: ["lawyer-act-articles", "lawyer-act-review"],
  },
  // 조문 번호는 분석 결과가 아닌 고정 인용(docs/research/03 [확실] 항목) — 법제처 원문 링크를 함께 단다 (DEC-030)
  "lawyer-act-articles": {
    label: "어떤 법 조항을 살펴보고 있어요?",
    source: "docs/research/03_규제_쟁점.md 1-1·2·3절 · PRD 10장 표",
    lines: [
      "변호사법에서는 제109조(변호사가 아닌 사람의 법률사무 취급)와 제34조(법률사건 수임의 소개·알선) 두 조항을 살펴봤어요. 햄찌법원은 돈을 받지 않고 변호사를 알선하지 않는 방식으로 운영해요. 조문 원문은 아래 링크에서 법제처 자료로 볼 수 있어요.",
      "그 밖에 개인정보 보호법(민감정보 별도 동의)과 인공지능 기본법(생성형 AI 사용 고지)도 함께 지키고 있어요.",
    ],
    links: [LAWYER_ACT],
    next: ["lawyer-act-review"],
  },
  "lawyer-act-review": {
    label: "법률 검토는 어떻게 했어요?",
    source: "DEC-055",
    lines: [
      "무료 법률 상담과 문서 대리 작성을 열었어요. 수익을 받지 않는 방식이에요.",
      "변호사 연결(사건 게시와 변호사 제안) 기능은 만들지 않기로 했어요.",
    ],
    next: ["roadmap"],
  },

  // ── ⑦ 앞으로의 운영 방안 ───────────────────────────────────
  roadmap: {
    label: "앞으로의 운영 방안",
    source: "PRD 0절 · 6장 로드맵",
    lines: [
      "지금은 무료 법률 상담과 문서 대리 작성을 제공해요. AI가 먼저 답하고, 답변에 적힌 조문·판례는 법제처에서 다시 확인해 보여 드려요.",
      "앞으로도 모두 무료로 두고, 다음 단계는 계획 중이에요.",
    ],
    list: [
      "고도화: 시각 타임라인, 자료 관리, 고급 검색, 상담 기록 (운영 데이터로 확인한 뒤)",
      "자체 판례 색인으로 법제처에서 찾지 못하는 자료 보완",
    ],
    links: [{ href: "/about/roadmap", label: "향후 계획 보기" }],
    next: ["roadmap-documents", "roadmap-login", "roadmap-quality"],
  },
  "roadmap-documents": {
    label: "소장 같은 문서도 써 줘요?",
    source: "DEC-022 · DEC-023 · DEC-055",
    lines: [
      "네. 소장·내용증명·지급명령 같은 문서를 햄찌법원이 무료로 대신 작성해 드려요. 위쪽 메뉴의 '문서 작성'(휴대폰은 아래 탭)에서 서식을 고르고, 결과 화면의 '바로 가기'에서 들어가면 질문한 사연으로 사실관계와 법적 근거·주장까지 AI가 채워요(고소장은 AI 초안 없이 직접 채워요).",
      "다 쓴 문서는 한글·워드·PDF로 내려받을 수 있어요. 이름·주소·금액은 화면에서 직접 적고 서버로 보내지 않아요. 내기 전에 내용을 한 번 더 읽어 봐 주세요.",
    ],
    links: [{ href: "/documents", label: "문서 작성" }],
  },
  "roadmap-login": {
    label: "로그인은 어떻게 해요?",
    source: "DEC-032 · DEC-035",
    lines: [
      "로그인은 Google 계정으로만 할 수 있어요. 마이페이지(오른쪽 위 프로필)에 Google 로그인 버튼이 있어요. 버튼이 '준비 중'으로 보이면 아직 열기 전이에요.",
      `로그인하지 않아도 지금처럼 쓸 수 있고, 로그인하면 하루 질문 횟수가 ${L.anonDaily}번에서 ${L.userDaily}번으로 늘어나요.`,
    ],
    links: [{ href: "/me", label: "마이페이지" }],
  },
  "roadmap-quality": {
    label: "답변 품질은 어떻게 확인해요?",
    source: "PRD 8.4 출시 기준 · F-005",
    lines: [
      "확정 표현 0건, 개인정보 노출 0건을 기준으로 두고 있어요.",
      "법제처 자료로 인용한 조문·판례는 다시 조회해 확인해요. 법제처에서 찾지 못해 AI가 채운 판례·조문은 자체 판례 색인으로 보완해 갈 계획이에요.",
    ],
    links: [SOURCES],
  },

  // ── ⑧ 개발자 연락처 ──────────────────────────────────────
  contact: {
    label: "문의 · 개발자 연락처",
    source: "사용자 요청 2026-11-18 · DEC-051 · app/privacy 5절",
    lines: [
      "햄찌법원 개발자에게 이메일로 연락하거나, 사이트에서 바로 문의를 남길 수 있어요. 개인정보나 사건 내용은 적지 말아 주세요. 사이트에서 남긴 문의는 이름·연락처처럼 보이는 부분을 가려서 보내요.",
      "개인정보 보호 책임자 연락처는 정식 출시 전에 개인정보처리방침에 적을 예정이에요.",
    ],
    contact: true,
    links: [CONTACT_FORM, { href: "/about", label: "햄찌법원 소개" }],
  },
};

export const GREETING = "무엇이 궁금한가요? 아래에서 골라 주세요!";

export function guideTopic(id: string): GuideTopic | undefined {
  return Object.hasOwn(GUIDE_TOPICS, id) ? GUIDE_TOPICS[id] : undefined;
}
