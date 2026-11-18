// 절차 안내 규칙 (F-014 데모 축소판, DEC-021). 순수 함수 — LLM을 쓰지 않는다.
// 질문 문장(이 기기에 있을 때)·결과의 법령 이름·분야 낱말로 홈 예시 질문 섹션에 맞는 타임라인(lib/procedure/steps TRACKS)을 고른다.
// 결과(승패·처벌)를 판정하지 않고, 단계와 난이도 라벨만 고른다 (DEC-002, 절대 규칙 2).
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { CATEGORIES, type CategoryKey } from "./categories";
import { LIFE_TRACKS, type LifeTrack, type LifeTrackKey } from "./life-tracks";
import { parseSectionLabel } from "./sections";
import {
  DIFFICULTY_LABEL,
  OFFICIAL,
  TRACKS,
  type OfficialLink,
  type ProcedureStep,
  type TrackKey,
} from "./steps";

/**
 * 타임라인 9개 + 생활 분쟁 타임라인 5개(DEC-028, 대면 모욕은 DEC-033) + 타임라인을 숨기는 경우
 * (형사만, 갚거나 돌려줘야 하는 쪽, 형사 조사를 받는 쪽, 정하지 못함)
 */
export type CaseType = TrackKey | LifeTrackKey | "defendant" | "other";
type NoticeType = Exclude<CaseType, TrackKey | LifeTrackKey>;

type Input = Pick<DemoAnalysisResult, "intent" | "articles"> & {
  mode?: DemoAnalysisResult["mode"];
  /** 질문 해석 호출이 고른 절차 섹션 라벨 (DEC-033). 저장된 결과에서 오므로 목록에 있는 값인지 다시 본다 */
  section?: unknown;
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
// 생활 분쟁 섹션 (DEC-028)
const FAMILY_WORD = /이혼|양육비|양육권|친권|재산분할|면접교섭|외도|불륜|혼인관계/;
const FAMILY_LAW = /^(가사소송법|양육비이행확보및지원에관한법률)$/;
const INHERIT_WORD = /상속|유산|유류분|한정승인|유언/;
const DEFAMATION_WORD = /명예훼손|모욕|악플|악성댓글|비방|허위사실|욕설.*(댓글|게시|단톡|대화방)/;
// 온라인 글·메시지인지 (DEC-033). 이 낱말이 없으면 직접 들은 말(대면) 절차로 안내한다 — 게시물 삭제 요청 단계가 맞지 않아서
const ONLINE_WORD =
  /온라인|인터넷|댓글|게시|악플|단톡|대화방|카톡|카카오톡|메신저|메시지|문자|sns|인스타|페이스북|트위터|유튜브|커뮤니티|블로그|맘카페|네이버카페|리뷰|후기|디엠|dm|글(을|이)?올|올린글/i;
// 모욕·명예훼손이라는 말 없이 욕설만 적은 경우 (다른 섹션이 정해지지 않을 때만 본다)
const INSULT_WORD = /욕설|폭언|쌍욕|막말|욕을?(들|먹|했|하|퍼)/;
// 찾은 법령 이름만으로 섹션을 정하지 않게, 질문 문장이 있으면 그 분야 낱말이 함께 있을 때만 쓴다 (DEC-033).
// 검색이 관련 없는 조문 하나를 섞어 와도 타임라인이 바뀌지 않게 하기 위해서다. 질문 문장이 없을 때(다른 기기)는 법령 이름으로 정한다
const LABOR_CONTEXT =
  /근로|직장|회사|사장|알바|아르바이트|근무|퇴사|퇴직|직원|사업주|고용|출근|야근|연차|일했|일하|해고/;
const TRAFFIC_CONTEXT = /차|운전|사고|음주|보험|오토바이|킥보드|자전거|보행/;
const CONSUMER_CONTEXT = /구매|구입|샀|결제|주문|배송|판매|물건|상품|제품|서비스|계약|해지|가입/;
const FAMILY_CONTEXT = /가족|부부|배우자|남편|아내|자녀|아이|부모|혼인|결혼/;
const ANIMAL_CONTEXT = /강아지|고양이|반려|동물|개(가|를|에게|한테)|물렸|물림/;
// 추가 섹션 낱말 (DEC-033)
const DEBT_RELIEF_WORD =
  /개인회생|개인파산|파산신청|면책|채무조정|워크아웃|빚(을|이)?(못갚|감당|너무많)|빚독촉|추심/;
const ADMIN_WORD =
  /영업정지|면허(가|를)?(취소|정지)|과태료|과징금|행정처분|행정심판|행정소송|이행강제금|처분(을|이)?(받|나왔|취소)/;
const SEX_CRIME_WORD = /성폭력|성폭행|성추행|강제추행|강간|불법촬영|몰카|디지털성범죄|성범죄/;
const SCHOOL_VIOLENCE_WORD =
  /학교폭력|학폭|(학교|같은반|학생).*(따돌림|왕따|괴롭힘|폭행)|(따돌림|왕따).*(학교|학생)/;
const DOMESTIC_VIOLENCE_WORD =
  /가정폭력|(남편|아내|배우자|아버지|어머니|부모|아빠|엄마)(이|가|에게|한테)?(저를|나를)?(때|폭행|맞)/;
const STALKING_WORD = /스토킹|따라다니|계속찾아|집앞에(와|서)|접근금지|협박(을|당|받|해|하)/;
const PHISHING_WORD =
  /보이스피싱|피싱|스미싱|대포통장|(검사|검찰|경찰|금감원|은행)(을|를)?사칭|지급정지/;
const HARASSMENT_WORD =
  /직장내괴롭힘|직장괴롭힘|직장갑질|갑질|(상사|팀장|사장|선배)(이|가)?.*(괴롭|따돌)/;
const INDUSTRIAL_WORD =
  /산재|산업재해|업무상재해|요양급여|휴업급여|(일하다|일하다가|작업중|근무중|공사장에서|현장에서).*(다쳤|다쳐|부상|사고|쓰러)/;
const MEDICAL_WORD =
  /의료사고|의료과실|오진|(수술|시술|진료|치료)(을|를)?(받고|받은뒤|후|하고).*(부작용|후유증|악화|사망|잘못)|수술이잘못/;
const PRIVACY_WORD =
  /개인정보.*(유출|도용|침해|무단|털)|명의(를|가)?도용|신상(이|을)?(털|공개|유포)/;
const ASSAULT_WORD = /폭행|상해|맞았|맞아서|때렸|때려|얻어맞|주먹|밀쳐|전치/;
const COMMERCIAL_DISPUTE_WORD = /권리금|갱신|임대료|월세|나가라|나가래|계약해지|명도|재계약/;
const CONSUMER_WORD =
  /환불|청약철회|반품|쇼핑몰|온라인몰|인터넷쇼핑|홈쇼핑|구독해지|이용권|헬스장|필라테스|학원비/;
const CONSUMER_LAW =
  /^(전자상거래등에서의소비자보호에관한법률|할부거래에관한법률|방문판매등에관한법률|소비자기본법)$/;

/**
 * 사건 유형 (규칙). 순서가 곧 우선순위다.
 * 분류에는 질문 문장과 찾은 법령 이름만 쓴다. 분석의 분야·목표 문장은 모델이 쓴 것이라
 * 미리 검증해 둔 예시 재생(replay)일 때만 함께 본다 (DEC-021: 타임라인을 LLM이 정하지 않는다).
 * 사용자가 홈에서 고른 카테고리(DEC-028)는 규칙이 타임라인을 정하지 못할 때(그 밖·형사만·일반 금전)만 쓴다 —
 * 수사를 받는 쪽·서류를 받은 쪽·갚을 쪽 판정은 언제나 규칙이 먼저다.
 * 질문 해석 호출이 고른 섹션 라벨(DEC-033)이 있으면 그 섹션을 쓴다 — 모델은 고정 목록에서 섹션만 고르고 단계 문구는 그대로다.
 * 규칙이 요구를 받는 쪽으로 본 질문은 라벨도 받는 쪽 섹션일 때만 받아들인다(요구하는 쪽 타임라인을 잘못 보여 주지 않게).
 * 라벨이 none이거나 없으면(무료 모드·예시 재생·호출 실패) 규칙과 카테고리로 정한다.
 */
export function classifyCase(
  r: Input,
  question: string | null,
  category?: CategoryKey | null,
): CaseType {
  const ruled = classifyByRules(r, question);
  const label = parseSectionLabel(r.section);
  if (label && label !== "none") {
    if (!RESPONDENT_SIDE.has(ruled) || RESPONDENT_SIDE.has(label)) return label;
    return ruled;
  }
  if (RESPONDENT_SIDE.has(ruled)) return ruled;
  if (!category) return ruled;
  const hinted = CATEGORIES[category].track;
  if (ruled === "other" || ruled === "crime_report") return hinted;
  // 일반 금전 절차는 생활 분쟁 섹션(가족·상속·소비자·명예훼손)을 골랐을 때만 바꾼다 (상가 보증금 등은 그대로)
  if (ruled === "money" && hinted in LIFE_TRACKS) return hinted;
  return ruled;
}

/** 요구를 받는 쪽(수사를 받는 쪽·서류를 받은 쪽·갚아야 하는 쪽·처분을 받은 쪽)의 섹션 */
const RESPONDENT_SIDE: ReadonlySet<CaseType> = new Set<CaseType>([
  "respond_criminal",
  "respond_civil",
  "defendant",
  "debt_relief",
  "admin_appeal",
]);

function classifyByRules(r: Input, question: string | null): CaseType {
  const fixedIntent = r.mode === "replay" ? [r.intent.area, r.intent.goal] : [];
  const text = norm([question ?? "", ...fixedIntent].join(" "));
  const laws = new Set([...r.intent.laws, ...r.articles.map((a) => a.lawName)].map((l) => norm(l)));
  // 질문 문장이 있으면 법령 이름은 그 분야 낱말과 함께일 때만 근거로 쓴다 (DEC-033)
  const hasQuestion = norm(question ?? "").length > 0;
  const hasLaw = (re: RegExp, context: RegExp) =>
    [...laws].some((l) => re.test(l)) && (!hasQuestion || context.test(text));

  if (ACCUSED.test(text)) return "respond_criminal";
  if (DEFENDANT.test(text)) return "respond_civil";
  // 빚을 갚기 어렵다는 질문은 갚을 쪽 낱말(못 갚)과 겹치므로 먼저 본다 (DEC-033)
  if (DEBT_RELIEF_WORD.test(text)) return "debt_relief";
  if (COUNTERPART.test(text)) return CREDITOR.test(text) ? "other" : "defendant";
  if (OWE_QUESTION.test(text) && !OTHER_PARTY_SUBJECT.test(text)) return "defendant";

  // 추가 섹션 (DEC-033): 뚜렷한 낱말이 있을 때만. 기존 섹션보다 먼저 본다 (보이스피싱 → 사기, 직장 내 괴롭힘 → 모욕 등으로 새지 않게)
  if (ADMIN_WORD.test(text)) return "admin_appeal";
  if (SEX_CRIME_WORD.test(text)) return "sex_crime";
  if (SCHOOL_VIOLENCE_WORD.test(text)) return "school_violence";
  if (DOMESTIC_VIOLENCE_WORD.test(text)) return "domestic_violence";
  if (STALKING_WORD.test(text)) return "stalking";
  if (PHISHING_WORD.test(text)) return "voice_phishing";
  if (HARASSMENT_WORD.test(text)) return "workplace_harassment";
  if (INDUSTRIAL_WORD.test(text)) return "industrial_accident";
  if (MEDICAL_WORD.test(text)) return "medical";
  if (PRIVACY_WORD.test(text)) return "privacy";

  // 생활 분쟁 섹션 (DEC-028): 가족·상속·명예훼손은 금전 낱말이 섞여도(재산분할·유류분 반환·위자료) 그 절차가 먼저다
  if (FAMILY_WORD.test(text) || hasLaw(FAMILY_LAW, FAMILY_CONTEXT)) return "family";
  if (INHERIT_WORD.test(text)) return "inheritance";
  // 온라인 글·메시지면 온라인 절차, 아니면 직접 들은 말(대면) 절차 (DEC-033)
  if (DEFAMATION_WORD.test(text)) return ONLINE_WORD.test(text) ? "defamation" : "insult";

  // 폭행은 교통사고·이웃 분쟁 낱말이 없을 때만 (차에 치인 사고, 층간소음 다툼은 그 절차가 먼저)
  if (ASSAULT_WORD.test(text) && !TRAFFIC_WORD.test(text)) return "assault";

  const commercial = /상가/.test(text) || laws.has("상가건물임대차보호법");
  if (commercial && COMMERCIAL_DISPUTE_WORD.test(text) && !DEPOSIT_WORD.test(text)) {
    return "commercial_lease";
  }
  const lease = !commercial && (laws.has("주택임대차보호법") || LEASE_WORD.test(text));

  // 해고와 임금 청구가 함께면(해고예고수당·퇴직금을 못 받음) 임금 절차, 해고 자체만 다투면 구제신청
  if (DISMISSAL_WORD.test(text) && !WAGE_WORD.test(text)) return "dismissal";
  if (WAGE_WORD.test(text) || hasLaw(LABOR_LAW, LABOR_CONTEXT)) return "wage";
  if (TRAFFIC_WORD.test(text) || hasLaw(TRAFFIC_LAW, TRAFFIC_CONTEXT)) return "traffic";
  if (CONTRACT_DEPOSIT_WORD.test(text)) return "contract_deposit";
  // 전세사기처럼 주택 보증금 문제면 사기보다 보증금 절차가 먼저다 (이사 전 임차권등기명령·대항력 유지)
  if (lease && DEPOSIT_WORD.test(text) && !RESIDENCE_WORD.test(text)) return "lease_deposit";
  // 빌려준 돈은 연락이 끊겨도 대여금 절차부터 (고소는 별도 안내)
  if (FRAUD_WORD.test(text) && !LEND_WORD.test(text)) return "fraud";
  if (CONSUMER_WORD.test(text) || hasLaw(CONSUMER_LAW, CONSUMER_CONTEXT)) return "consumer";
  if (NEIGHBOR_WORD.test(text) || hasLaw(/^동물보호법$/, ANIMAL_CONTEXT)) return "neighbor";
  if (lease && RESIDENCE_WORD.test(text)) {
    return DEPOSIT_WORD.test(text) && RETURN_WORD.test(text) ? "lease_deposit" : "lease_residence";
  }
  if (MONEY_WORD.test(text) || (commercial && DEPOSIT_WORD.test(text))) return "money";
  // 욕설만 적은 질문 (DEC-033): 다른 섹션이 정해지지 않았을 때만
  if (INSULT_WORD.test(text)) return ONLINE_WORD.test(text) ? "defamation" : "insult";

  const civil = laws.has("민법") || laws.has("주택임대차보호법") || commercial;
  if (laws.has("형법") && !civil) return "crime_report";
  return "other";
}

type TimelineFields = {
  /** 홈 예시 질문 섹션 이름 */
  section: string;
  title: string;
  steps: ProcedureStep[];
  recommended: ProcedureStep;
  /** 왜 이 단계를 먼저 추천하는지 (고정 문구) */
  reason: string;
  /** 함께 알아 둘 별도 절차 (형사·민사가 겹칠 때 등) */
  note: string | null;
};

/**
 * 생활 분쟁 섹션(DEC-028)은 kind를 따로 둔다 — 기존 섹션(timeline)만 공식 서식 작성기(lib/documents)의
 * 섹션 키(TrackKey)를 쓰므로, 문서 초안 쪽 타입을 바꾸지 않고 새 섹션을 더하기 위해서다.
 */
export type ProcedurePlan =
  | ({ kind: "timeline"; caseType: TrackKey } & TimelineFields)
  | ({ kind: "life_timeline"; caseType: LifeTrackKey } & TimelineFields)
  | {
      kind: "notice";
      caseType: NoticeType;
      title: string;
      body: string;
      links: OfficialLink[];
    };

const NOTICE: Record<NoticeType, { title: string; body: string; links: OfficialLink[] }> = {
  defendant: {
    title: "갚거나 돌려줘야 하는 쪽의 대응은 이 안내 범위 밖이에요",
    body: "절차 타임라인은 돈이나 권리를 요구하는 쪽을 기준으로 해요. 소장·지급명령 같은 서류를 받았다면 적힌 기간 안에 답변서·이의신청 등을 내야 할 수 있어요. 받은 서류와 법원 안내를 먼저 확인하고, 필요하면 전문가와 상담하세요.",
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
  },
  other: {
    title: "이 질문에 맞는 절차 안내를 정하지 못했어요",
    body: "어떤 절차에 해당하는지 판단하기 어려워 절차 타임라인을 생략했어요. 아래 세부 내용에서 찾은 법령·판례를 확인해 주세요.",
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
  },
};

const LEASE_FRAUD_NOTE =
  "집주인을 사기로 고소하는 일은 이 보증금 절차와 따로 진행돼요. 이사 전에는 임차권등기명령과 대항력 유지를 먼저 챙기세요.";
const WAGE_DISMISSAL_NOTE =
  "해고 자체가 부당하다고 다투려면 노동위원회 구제신청이 따로 있고, 신청할 수 있는 기간이 정해져 있어요.";
const CRIMINAL_NOTE = "사기 등 형사 고소를 함께 생각하신다면, 고소는 이 민사 절차와 따로 진행돼요.";

export type TimelinePlan = Extract<ProcedurePlan, { kind: "timeline" | "life_timeline" }>;

/** 타임라인을 보이는 안내인지 (기존 섹션·생활 분쟁 섹션) */
export function hasTimeline(plan: ProcedurePlan): plan is TimelinePlan {
  return plan.kind === "timeline" || plan.kind === "life_timeline";
}

const FAMILY_SUPPORT_NOTE =
  "양육비를 이미 정했는데 받지 못하고 있다면 마지막 단계(양육비 이행 확보)부터 확인하세요.";

/** 결과 화면에 보일 절차 안내. 섹션별 타임라인이거나, 타임라인을 숨기고 유형 안내만 */
export function procedurePlan(
  r: Input,
  question: string | null,
  category?: CategoryKey | null,
): ProcedurePlan {
  const caseType = classifyCase(r, question, category);
  if (caseType in LIFE_TRACKS) {
    const track: LifeTrack = LIFE_TRACKS[caseType as LifeTrackKey];
    const text = norm(question ?? "");
    return {
      kind: "life_timeline",
      caseType: track.key,
      section: track.section,
      title: track.title,
      steps: track.steps,
      recommended: track.steps.find((s) => s.key === track.recommended)!,
      reason: track.reason,
      note:
        track.note ?? (track.key === "family" && /양육비/.test(text) ? FAMILY_SUPPORT_NOTE : null),
    };
  }
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
  FAMILY_SUPPORT_NOTE,
];

/**
 * '○○ 바로 가기' 대상: 문서 작성 안내(게이트 뒤) 또는 그 단계에 정해 둔 공식 창구.
 * 단계 이름과 어긋나는 곳으로 보내지 않도록, 정해 둔 곳이 없으면 null (카드를 보이지 않는다)
 */
export function shortcutOf(
  step: Pick<ProcedureStep, "document" | "shortcut">,
): { kind: "document"; href: string } | { kind: "official"; href: string; label: string } | null {
  // 공식 창구(예: 사이버범죄 신고시스템)를 정해 둔 단계는 그 창구가 먼저다. 서식 작성은 타임라인 단계 팝업에서 연다 (DEC-025)
  if (step.shortcut)
    return { kind: "official", href: step.shortcut.url, label: step.shortcut.label };
  if (step.document) return { kind: "document", href: `/documents/${step.document}` };
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
