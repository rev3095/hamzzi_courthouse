// 절차 안내 규칙 (F-014 데모 축소판, DEC-021). 순수 함수 — LLM을 쓰지 않는다.
// 질문 문장(이 기기에 있을 때)·결과의 법령 이름·분야 낱말로 홈 예시 질문 섹션에 맞는 타임라인(lib/procedure/steps TRACKS)을 고른다.
// 결과(승패·처벌)를 판정하지 않고, 단계와 난이도 라벨만 고른다 (DEC-002, 절대 규칙 2).
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import {
  DIFFICULTY_LABEL,
  OFFICIAL,
  TRACKS,
  type OfficialLink,
  type ProcedureStep,
  type TrackKey,
} from "./steps";

/** 타임라인 9개 + 타임라인을 숨기는 경우 (형사만, 갚거나 돌려줘야 하는 쪽, 형사 조사를 받는 쪽, 정하지 못함) */
export type CaseType = TrackKey | "criminal" | "defendant" | "accused" | "other";
type NoticeType = Exclude<CaseType, TrackKey>;

type Input = Pick<DemoAnalysisResult, "intent" | "articles"> & {
  mode?: DemoAnalysisResult["mode"];
};

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

// 타임라인은 돈·권리를 요구하는 쪽(피해자·임차인·근로자) 기준이다. 반대쪽 신호가 있으면 타임라인을 숨긴다.
// 형사 조사를 받는 쪽: 신고·고소를 당했다, 사고를 냈다
const ACCUSED = /신고를?당|고소를?당|사고를?냈|사고냈|제가가해|피의자|피고소인/;
// 서류를 받은 쪽: 소장·지급명령·내용증명을 받았다, 소송을 당했다
const DEFENDANT =
  /(지급명령|소장|내용증명|이행권고결정)(정본)?(이|을|를)?(왔|받았|받음|송달|날아)|소송을?당|청구를?당|피소|제가피고|피고가됐|피고가되|피고로/;
// 갚거나 돌려줘야 하는 쪽(빌린 쪽·임대인·사업주·계약금을 받은 쪽)
const COUNTERPART =
  /갚아야하|안갚아도|갚으래|갚으라는데|갚으라고하|돌려달라는|돌려달래|물어내라|빌린돈|빌렸는데|빌렸어|못갚|갚고있|갚으면되|세입자(에게|한테)(보증금|돌려)|세입자가(안나|나가지|보증금을달)|직원이(퇴직금|월급|임금|수당)?(을|를)?달라|직원(에게|한테)(줘야|월급|퇴직금)|직원을해고|해고하려|해고해도되|(제가|저는)(집주인|임대인|사장|사업주|매도인)/;
// "돌려줘야 하나요"는 누가 묻는지에 따라 다르다. 상대방이 주어면 요구하는 쪽 질문이다
const OWE_QUESTION = /돌려줘야하|줘야하나|줘야하는/;
const OTHER_PARTY_SUBJECT =
  /집주인이|임대인이|사장이|회사가|사업주가|상대방이|판매자가|매도인이|매수인이/;
const CREDITOR = /빌려준|빌려줬|돌려받|못받|안받|받을수있|받아야|안돌려|돌려주지않|안줘|안준|안주/;

const DISMISSAL_WORD = /부당해고|해고(됐|되었|당했|통보|통지|를당)|잘렸|해고.*구제신청/;
const WAGE_WORD = /임금|월급|급여|퇴직금|체불|수당/;
const LABOR_LAW = /^(근로기준법|근로자퇴직급여보장법|최저임금법|임금채권보장법)$/;
const TRAFFIC_LAW = /^(교통사고처리특례법|자동차손해배상보장법|도로교통법)$/;
const TRAFFIC_WORD = /교통사고|차에치|차에부딪|차량에|횡단보도|접촉사고|블랙박스/;
const FRAUD_WORD = /사기|중고거래|먹튀|연락이끊|잠수|물건을안보내/;
const LEND_WORD = /빌려준|빌려줬|대여금|대여/;
const NEIGHBOR_WORD = /이웃|옆집|윗집|아랫집|층간/;
const CONTRACT_DEPOSIT_WORD = /계약금/;
const DEPOSIT_WORD = /보증금|전세금/;
const LEASE_WORD = /임대차|전세|월세|집주인|세입자/;
const RESIDENCE_WORD = /갱신|나가라|나가래|계속살|실거주|집을팔|팔았|새집주인|명도/;
const RETURN_WORD = /돌려받|돌려주|돌려줘|못받|안돌려|안줘|안준/;
const MONEY_WORD =
  /돌려받|돌려주|돌려줘|대여금|빌려준|빌려줬|못받|안받|안줘|안준|안주|대금|물건값|환불|배상|미지급|받을수있/;

/**
 * 사건 유형 (규칙). 순서가 곧 우선순위다.
 * 분류에는 질문 문장과 찾은 법령 이름만 쓴다. 분석의 분야·목표 문장은 모델이 쓴 것이라
 * 미리 검증해 둔 예시 재생(replay)일 때만 함께 본다 (DEC-021: 타임라인을 LLM이 정하지 않는다).
 */
export function classifyCase(r: Input, question: string | null): CaseType {
  const fixedIntent = r.mode === "replay" ? [r.intent.area, r.intent.goal] : [];
  const text = norm([question ?? "", ...fixedIntent].join(" "));
  const laws = new Set([...r.intent.laws, ...r.articles.map((a) => a.lawName)].map((l) => norm(l)));
  const hasLaw = (re: RegExp) => [...laws].some((l) => re.test(l));

  if (ACCUSED.test(text)) return "accused";
  if (DEFENDANT.test(text)) return "defendant";
  if (COUNTERPART.test(text)) return CREDITOR.test(text) ? "other" : "defendant";
  if (OWE_QUESTION.test(text) && !OTHER_PARTY_SUBJECT.test(text)) return "defendant";

  const commercial = /상가/.test(text) || laws.has("상가건물임대차보호법");
  const lease = !commercial && (laws.has("주택임대차보호법") || LEASE_WORD.test(text));

  // 해고와 임금 청구가 함께면(해고예고수당·퇴직금을 못 받음) 임금 절차, 해고 자체만 다투면 구제신청
  if (DISMISSAL_WORD.test(text) && !WAGE_WORD.test(text)) return "dismissal";
  if (WAGE_WORD.test(text) || hasLaw(LABOR_LAW)) return "wage";
  if (TRAFFIC_WORD.test(text) || hasLaw(TRAFFIC_LAW)) return "traffic";
  if (CONTRACT_DEPOSIT_WORD.test(text)) return "contract_deposit";
  // 전세사기처럼 주택 보증금 문제면 사기보다 보증금 절차가 먼저다 (이사 전 임차권등기명령·대항력 유지)
  if (lease && DEPOSIT_WORD.test(text) && !RESIDENCE_WORD.test(text)) return "lease_deposit";
  // 빌려준 돈은 연락이 끊겨도 대여금 절차부터 (고소는 별도 안내)
  if (FRAUD_WORD.test(text) && !LEND_WORD.test(text)) return "fraud";
  if (NEIGHBOR_WORD.test(text) || laws.has("동물보호법")) return "neighbor";
  if (lease && RESIDENCE_WORD.test(text)) {
    return DEPOSIT_WORD.test(text) && RETURN_WORD.test(text) ? "lease_deposit" : "lease_residence";
  }
  if (MONEY_WORD.test(text) || (commercial && DEPOSIT_WORD.test(text))) return "money";

  const civil = laws.has("민법") || laws.has("주택임대차보호법") || commercial;
  if (laws.has("형법") && !civil) return "criminal";
  return "other";
}

export type ProcedurePlan =
  | {
      kind: "timeline";
      caseType: TrackKey;
      /** 홈 예시 질문 섹션 이름 */
      section: string;
      title: string;
      steps: ProcedureStep[];
      recommended: ProcedureStep;
      /** 왜 이 단계를 먼저 추천하는지 (고정 문구) */
      reason: string;
      /** 함께 알아 둘 별도 절차 (형사·민사가 겹칠 때 등) */
      note: string | null;
    }
  | {
      kind: "notice";
      caseType: NoticeType;
      title: string;
      body: string;
      links: OfficialLink[];
    };

const NOTICE: Record<NoticeType, { title: string; body: string; links: OfficialLink[] }> = {
  criminal: {
    title: "형사 고소 절차는 이 안내와 달라요",
    body: "고소는 경찰서나 공식 신고 창구에서 안내를 받을 수 있어요. 피해 금액을 돌려받는 민사 절차는 따로 진행돼요.",
    links: [OFFICIAL.police, OFFICIAL.cyberPolice, OFFICIAL.klac],
  },
  defendant: {
    title: "갚거나 돌려줘야 하는 쪽의 대응은 이 안내 범위 밖이에요",
    body: "절차 타임라인은 돈이나 권리를 요구하는 쪽을 기준으로 해요. 소장·지급명령 같은 서류를 받았다면 적힌 기간 안에 답변서·이의신청 등을 내야 할 수 있어요. 받은 서류와 법원 안내를 먼저 확인하고, 필요하면 전문가와 상담하세요.",
    links: [OFFICIAL.proSe, OFFICIAL.klac],
  },
  accused: {
    title: "수사를 받는 쪽의 대응은 이 안내 범위 밖이에요",
    body: "고소·신고를 당했거나 사고를 낸 쪽의 형사 절차는 피해자 절차와 달라요. 출석 요구 등 받은 안내를 먼저 확인하고, 변호사 상담을 검토하세요.",
    links: [OFFICIAL.police, OFFICIAL.klac],
  },
  other: {
    title: "이 질문에 맞는 절차 안내를 정하지 못했어요",
    body: "어떤 절차에 해당하는지 판단하기 어려워 절차 타임라인을 생략했어요. 아래 세부 내용에서 찾은 법령·판례를 확인해 주세요.",
    links: [OFFICIAL.proSe, OFFICIAL.klac],
  },
};

const LEASE_FRAUD_NOTE =
  "집주인을 사기로 고소하는 일은 이 보증금 절차와 따로 진행돼요. 이사 전에는 임차권등기명령과 대항력 유지를 먼저 챙기세요.";
const WAGE_DISMISSAL_NOTE =
  "해고 자체가 부당하다고 다투려면 노동위원회 구제신청이 따로 있고, 신청할 수 있는 기간이 정해져 있어요.";
const CRIMINAL_NOTE = "사기 등 형사 고소를 함께 생각하신다면, 고소는 이 민사 절차와 따로 진행돼요.";

/** 결과 화면에 보일 절차 안내. 섹션별 타임라인이거나, 타임라인을 숨기고 유형 안내만 */
export function procedurePlan(r: Input, question: string | null): ProcedurePlan {
  const caseType = classifyCase(r, question);
  if (caseType in TRACKS) {
    const track = TRACKS[caseType as TrackKey];
    const lawNames = new Set(
      [...r.intent.laws, ...r.articles.map((a) => a.lawName)].map((l) => norm(l)),
    );
    const civilTrack = track.key === "money" || track.key === "contract_deposit";
    const text = norm(question ?? "");
    return {
      kind: "timeline",
      caseType: track.key,
      section: track.section,
      title: track.title,
      steps: track.steps,
      recommended: track.steps.find((s) => s.key === track.recommended)!,
      reason: track.reason,
      note: track.note ?? extraNote(track.key, text, civilTrack && lawNames.has("형법")),
    };
  }
  const type = caseType as NoticeType;
  return { kind: "notice", caseType: type, ...NOTICE[type] };
}

/** 타임라인에 덧붙일 별도 절차 안내 */
function extraNote(key: TrackKey, text: string, criminalLaw: boolean): string | null {
  if (key === "lease_deposit" && FRAUD_WORD.test(text)) return LEASE_FRAUD_NOTE;
  if (key === "wage" && /해고/.test(text)) return WAGE_DISMISSAL_NOTE;
  if ((key === "money" || key === "contract_deposit") && (criminalLaw || FRAUD_WORD.test(text))) {
    return CRIMINAL_NOTE;
  }
  return null;
}

/** 화면에 나갈 수 있는 고정 안내 문구 전부 (숫자·단정 표현 검사용) */
export const NOTICE_TEXTS: string[] = [
  ...Object.values(NOTICE).flatMap((n) => [n.title, n.body]),
  LEASE_FRAUD_NOTE,
  WAGE_DISMISSAL_NOTE,
  CRIMINAL_NOTE,
];

/**
 * '○○ 바로 가기' 대상: 문서 작성 안내(게이트 뒤) 또는 그 단계에 정해 둔 공식 창구.
 * 단계 이름과 어긋나는 곳으로 보내지 않도록, 정해 둔 곳이 없으면 null (카드를 보이지 않는다)
 */
export function shortcutOf(
  step: Pick<ProcedureStep, "document" | "shortcut">,
): { kind: "document"; href: string } | { kind: "official"; href: string; label: string } | null {
  if (step.document) return { kind: "document", href: `/documents/${step.document}` };
  if (step.shortcut)
    return { kind: "official", href: step.shortcut.url, label: step.shortcut.label };
  return null;
}

/** 결과 머리의 사실 요약 (개수만, 판단 없음) */
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
