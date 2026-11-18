// 햄찌 안내 챗봇 고정 문안 (DEC-030). Claude 호출 없음 · 비용 0 · 대화 저장·로그 없음.
// 문안은 저장소 문서에 있는 내용만 쓴다. 바꿀 때는 각 항목의 `source`(근거 문서·절)를 먼저 고치고 문안을 맞춘다.
// - 승패·가능성·위법 여부를 단정하지 않는다 (절대 규칙 2, N1). 변호사법 항목은 "지금 운영 방식"만 말한다.
// - 계획(Phase 2·3)은 "계획·검토 중"으로만 쓴다. 가격·요금은 문서에 확정된 값이 없으므로 쓰지 않는다.
// - 숫자는 GUIDE_LIMITS에서만 가져온다. 값은 코드 상수와 같아야 한다 (policy.test.ts가 대조).
// 검사: lib/guide/policy.test.ts (단정·승률 표현, 숫자, 실제 페이지 링크, 하위 질문 참조)

import { AI_NOTICE, SEARCH_NOTICE } from "@/lib/api/respond";

/** 정해진 안내라 AI 생성물이 아니다. SEARCH_NOTICE·DOCUMENT_NOTICE와 같은 방식 */
export const GUIDE_NOTICE = "정해진 안내 · AI 생성 아님 · 법률 자문 아님";

/**
 * 안내에 쓰는 횟수. 브라우저 묶음에 서버 모듈(lib/inquiries/policy·lib/auth/rate-limit)을 끌어오지 않으려고
 * 값을 옮겨 두고, policy.test.ts가 원래 상수와 같은지 확인한다.
 */
export const GUIDE_LIMITS = {
  /** 비로그인 하루 질문 (DEC-024, ANON_QUESTION_LIMIT) */
  anonDaily: 5,
  /** 같은 네트워크 24시간 분석 (DEC-024, ANON_IP_DAILY_LIMIT) */
  ipDaily: 10,
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
} as const;

const L = GUIDE_LIMITS;

/** 개발자 이메일 (사용자 요청 2026-11-18). 페이지 HTML을 긁는 봇이 바로 못 읽게 조각으로 두고 누를 때 합친다 */
const EMAIL_PARTS = ["mimmzy28", "gmail.com"] as const;
export const guideEmail = () => EMAIL_PARTS.join("@");

export const MENU_IDS = [
  "rules",
  "terms",
  "pricing",
  "lawyer-act",
  "matching",
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
  /** 근거 문서·절. 문안을 바꿀 때 이 문서와 맞춘다 */
  source: string;
};

const TERMS: GuideLink = { href: "/terms", label: "이용약관" };
const PRIVACY: GuideLink = { href: "/privacy", label: "개인정보처리방침" };
const SOURCES: GuideLink = { href: "/sources", label: "출처 표기" };
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
      "햄찌법원은 법령·판례를 찾아 정리해 보여 드리는 참고용 서비스예요.",
      `로그인 없이 하루 ${L.anonDaily}번(이어 묻기 포함) 질문할 수 있고, 한국 시간 0시가 지나면 다시 ${L.anonDaily}번이 돼요. 분석에 실패한 시도는 세지 않아요.`,
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
    next: ["rules-examples", "rules-search"],
  },
  "rules-search": {
    label: "판례 검색도 횟수를 써요?",
    source: "DEC-017 · lib/auth/rate-limit.ts SEARCH_RATE·LOOKUP_RATE",
    lines: [
      "판례·법령 직접 검색은 질문 횟수와 따로 세요.",
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

  // ── ② 이용약관 ───────────────────────────────────────────
  terms: {
    label: "이용약관",
    source: "app/terms 1~4절",
    lines: ["이용약관의 핵심을 정리해 드릴게요. 지금 약관은 초안이고, 법무 검토 후 확정해요."],
    list: [
      "법률 정보를 찾아 정리해 보여 드리는 참고용 서비스이고, 법률 자문이 아니에요.",
      "햄찌 판사는 AI 캐릭터이고 실제 판사·변호사가 아니에요.",
      "사건의 결과를 예측하거나 보장하지 않아요. 중요한 결정 전에는 전문가와 상담해 주세요.",
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
    lines: ["책임 범위와 분쟁 해결 방법은 법무 검토 후 이용약관에 적을 예정이에요."],
    links: [TERMS],
  },
  "terms-sources": {
    label: "법령·판례는 어디서 가져와요?",
    source: "app/sources · DEC-009",
    lines: [
      "법제처 국가법령정보센터 Open API에서 가져와요. 결과 화면의 법령·판례에는 원문 링크가 있어요.",
      "답변에 인용한 조문·사건번호는 법제처에 다시 조회해 실제로 있는지 확인하고, 인용 구절이 원문과 같은지 비교해요. 다르면 '확인 필요'로 표시해요. 예시 답변은 만들 때 확인한 결과를 보여 드려요.",
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

  // ── ③ 요금제 ─────────────────────────────────────────────
  pricing: {
    label: "요금제",
    source: "PRD 10·11장 · F-013 · DEC-001",
    lines: [
      "지금 햄찌법원은 이용자에게 요금을 받지 않아요.",
      "결제·과금 기능은 없고, 법률 검토가 끝나기 전에는 만들거나 열지 않아요. 정해진 요금제나 가격도 아직 없어요.",
    ],
    next: ["pricing-future", "pricing-cost"],
  },
  "pricing-future": {
    label: "나중에는 유료가 되나요?",
    source: "PRD 10장 수익모델 후보 · 11장 · OQ-002 · DEC-001",
    lines: [
      "수익 모델은 후보만 있고 모두 법률 검토 중이에요. 우선 검토하는 후보는 변호사 광고·정액 구독과 변호사용 도구 구독이에요.",
      "사건마다 받는 요금(건별 과금)이나 변호사 선임이 이뤄졌을 때 받는 수수료는 검토가 끝나기 전에는 하지 않아요.",
    ],
    next: ["lawyer-act"],
  },
  "pricing-cost": {
    label: "운영 비용은 누가 내요?",
    source: "DEC-015 · DEC-026",
    lines: [
      "AI 답변을 켠 기간에는 그 비용을 운영자가 내고, 일주일에 쓸 수 있는 금액에 상한을 두어요. 상한에 닿으면 그 주에는 AI 답변 없이 법제처 검색 결과만 보여 드려요.",
      "예시 질문은 미리 분석해 둔 답변이라 비용이 들지 않아요.",
    ],
  },

  // ── ④ 변호사법과 이 사이트 ──────────────────────────────────
  // 위법 여부를 판단하지 않는다. 운영 사실(DEC-001, F-013, 게이트)과 검토 대상 조항 이름만 쓴다.
  "lawyer-act": {
    label: "변호사법과 이 사이트",
    source: "DEC-001 · F-013 · PRD 3·10장 · docs/research/03_규제_쟁점.md",
    lines: [
      "이 사이트가 법에 걸리는지 아닌지는 햄찌가 판단해 드릴 수 없어요. 대신 지금 어떻게 운영하고 있는지 사실만 알려 드릴게요.",
      "아래는 운영 방식일 뿐이고, 이것만으로 법 위반 여부가 정해지지는 않아요. 법률 검토는 아직 끝나지 않았어요.",
    ],
    list: [
      "법률 정보를 찾아 보여 드리는 참고용 서비스이고, 법률 자문이 아니며 변호사·법무사의 상담을 대신하지 않아요.",
      "이용자에게 돈을 받지 않아요.",
      "플랫폼이 변호사를 골라 배정하지 않고, 변호사 선임에 연동해 수수료를 받지 않아요.",
      "변호사 연결·과금 기능은 아직 만들지 않았고, 법률문서 작성 도구는 만들어 두었지만 법률 검토가 끝나기 전까지 꺼 두었어요.",
    ],
    links: [TERMS],
    next: ["lawyer-act-articles", "lawyer-act-review", "matching"],
  },
  // 조문 번호는 분석 결과가 아닌 고정 인용(docs/research/03 [확실] 항목) — 법제처 원문 링크를 함께 단다 (DEC-030)
  "lawyer-act-articles": {
    label: "어떤 법 조항을 살펴보고 있어요?",
    source: "docs/research/03_규제_쟁점.md 1-1·2·3절 · PRD 10장 표",
    lines: [
      "변호사법에서는 제109조(변호사가 아닌 사람의 법률사무 취급)와 제34조(법률사건 수임의 소개·알선) 두 조항을 중심으로 검토하고 있어요. 조문 원문은 아래 링크에서 법제처 자료로 볼 수 있어요.",
      "그 밖에 개인정보 보호법(민감정보 별도 동의)과 인공지능 기본법(생성형 AI 사용 고지)도 함께 살펴보고 있어요.",
    ],
    links: [LAWYER_ACT],
    next: ["lawyer-act-review"],
  },
  "lawyer-act-review": {
    label: "법률 검토는 어디까지 됐어요?",
    source: "PRD 0절 · 16.1 OQ-001~OQ-004 · docs/research/03_규제_쟁점.md 머리말·5절",
    lines: [
      "변호사 연결 조건, 수익 모델, AI 문서 범위, 게시할 정보 범위가 모두 아직 '검토 대기' 상태예요.",
      "법률 검토가 끝나기 전에는 해당 기능을 열지 않아요.",
    ],
    next: ["roadmap"],
  },

  // ── ⑤ 변호사 연결(중계) 방식 ────────────────────────────────
  matching: {
    label: "변호사 연결 방식",
    source: "PRD 1·4장 · F-008~F-012 · N5 · DEC-001",
    lines: ["변호사 연결은 아직 열리지 않은 기능이에요. 지금 계획하고 있는 순서는 이래요."],
    list: [
      "질문 내용을 정리한 사건 요약서를 직접 확인해요.",
      "공개 범위를 보고 동의해요.",
      "이름처럼 알아볼 수 있는 정보를 뺀 사건 개요만 게시돼요.",
      "자격이 확인된 변호사가 상담을 제안해요.",
      "내가 고른 변호사에게만 자세한 내용이 보여요.",
    ],
    next: ["matching-assign", "matching-verify", "matching-data"],
  },
  "matching-assign": {
    label: "플랫폼이 변호사를 정해 주나요?",
    source: "PRD 3장 N5 · F-012 AC1 · DEC-001",
    lines: [
      "아니요. 플랫폼은 변호사를 배정하지 않고, 제안을 받은 이용자가 직접 고르도록 계획하고 있어요.",
      "변호사 선임에 연동한 수수료도 받지 않는 것으로 계획하고 있어요.",
    ],
    next: ["lawyer-act"],
  },
  "matching-verify": {
    label: "변호사인지 어떻게 확인해요?",
    source: "F-010 · OQ-006",
    lines: [
      "자격이 확인되고 승인된 변호사 계정만 게시판을 볼 수 있게 할 계획이에요.",
      "자격·소속을 확인하는 절차는 아직 정하는 중이에요.",
    ],
  },
  "matching-data": {
    label: "내 정보는 누가 보게 돼요?",
    source: "F-009 · F-011 · F-012 AC2 · OQ-004",
    lines: [
      "게시판에는 동의한 항목만 알아볼 수 없게 줄여 올리고, 자세한 내용은 내가 고른 변호사에게만 보여 주도록 계획하고 있어요.",
      "어떤 항목을 게시하고 얼마나 보관할지는 법률 검토 중이에요.",
    ],
    links: [PRIVACY],
  },

  // ── ⑥ 앞으로의 운영 방안 ───────────────────────────────────
  roadmap: {
    label: "앞으로의 운영 방안",
    source: "PRD 0절 · 6장 로드맵",
    lines: [
      "지금은 첫 단계 데모예요. 법령·판례를 근거로 정보를 정리하고, 인용한 조문·판례를 다시 확인해 보여 드려요.",
      "다음 단계는 모두 계획·검토 중이에요.",
    ],
    list: [
      "상담 연결: 사건 요약서 확인·동의 → 알아볼 수 없게 줄인 사건 게시 → 변호사 제안, 절차 단계 안내(지금은 결과 화면에 데모판으로 제공)",
      "고도화: 시각 타임라인, 자료 관리, 고급 검색, 상담 기록 (운영 데이터로 확인한 뒤)",
    ],
    next: ["roadmap-documents", "roadmap-login", "roadmap-quality"],
  },
  "roadmap-documents": {
    label: "문서 작성은 언제 열려요?",
    source: "DEC-022 · DEC-025 · OQ-003",
    lines: [
      "공식 기관 서식에 직접 적은 내용을 채워 넣는 문서 작성 도구를 만들어 두었지만, 법률 검토 전이라 꺼 두었어요.",
      "지금은 작성 요령과 공식 양식 링크만 보여 드려요. 언제 열지는 법률 검토 결과에 따라 정해요.",
    ],
  },
  "roadmap-login": {
    label: "로그인은 어떻게 해요?",
    source: "DEC-032 · DEC-033",
    lines: [
      "로그인은 Google 계정으로만 할 수 있어요. 마이페이지(오른쪽 위 프로필)에 Google 로그인 버튼이 있어요. 버튼이 '준비 중'으로 보이면 아직 열기 전이에요.",
      "로그인하지 않아도 지금처럼 쓸 수 있고, 로그인하면 하루 질문 횟수가 늘어나요.",
    ],
    links: [{ href: "/me", label: "마이페이지" }],
  },
  "roadmap-quality": {
    label: "답변 품질은 어떻게 확인해요?",
    source: "PRD 8.4 출시 기준 · F-005",
    lines: [
      "정식 출시 기준으로 허위 판례·조문 인용 0건, 확정 표현 0건, 개인정보 노출 0건을 두고 있어요.",
      "지금도 답변에 인용한 조문·판례는 법제처에 다시 조회해 확인한 것만 보여 드려요.",
    ],
    links: [SOURCES],
  },

  // ── ⑦ 개발자 연락처 ──────────────────────────────────────
  contact: {
    label: "개발자 연락처",
    source: "사용자 요청 2026-11-18 · app/privacy 5절",
    lines: [
      "햄찌법원 개발자에게 이메일로 연락할 수 있어요. 메일에는 개인정보나 사건 내용을 적지 말아 주세요.",
      "개인정보 보호 책임자 연락처는 정식 출시 전에 개인정보처리방침에 적을 예정이에요.",
    ],
    contact: true,
  },
};

export const GREETING = "무엇이 궁금한가요? 아래에서 골라 주세요!";

export function guideTopic(id: string): GuideTopic | undefined {
  return Object.hasOwn(GUIDE_TOPICS, id) ? GUIDE_TOPICS[id] : undefined;
}
