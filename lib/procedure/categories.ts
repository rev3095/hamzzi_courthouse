// 홈 카테고리 버튼 (DEC-028, 묶음·추가 섹션은 DEC-034). 순수 상수·규칙 — LLM을 쓰지 않는다.
// 버튼 분류는 법제처 찾기쉬운 생활법령정보 분야를 따르고, 판례 사건 종류(민사·가사·형사·행정)는
// 각 카테고리에서 찾는 판례의 범위 설명(caseKinds)에만 쓴다 (docs/research/06_카테고리_분류_조사.md).
// 카테고리는 ① 질문 입력 안내(placeholder·문장 시작) ② 분류 보조(classifyCase가 규칙으로 정하지 못할 때만)
// ③ 무료 법제처 판례 검색에 고정 검색어 하나를 더하는 데만 쓴다. 모델이 카테고리를 정하지 않는다 (DEC-021).
import type { LifeTrackKey } from "./life-tracks";
import type { TrackKey } from "./steps";

export const CATEGORY_KEYS = [
  "lease",
  "deposit",
  "labor",
  "fraud",
  "traffic",
  "neighbor",
  "loan",
  "family",
  "inheritance",
  "consumer",
  "defamation",
  // 추가 섹션 (DEC-033·034)
  "insult",
  "assault",
  "stalking",
  "sex_crime",
  "voice_phishing",
  "crime_report",
  "workplace_harassment",
  "industrial_accident",
  "domestic_violence",
  "school_violence",
  "medical",
  "privacy",
  "commercial_lease",
  "respond_civil",
  "respond_criminal",
  "admin_appeal",
  "debt_relief",
  // 추가 섹션 (DEC-043)
  "auction",
  "registration",
  "fine_objection",
  "business_permit",
  // 추가 섹션 (DEC-045)
  "insurance_claim",
  "copyright",
  // 추가 섹션 (2026-11-19 3차: 복지·부동산 매매·세금·군 복무)
  "welfare_appeal",
  "property_defect",
  "tax_appeal",
  "military_discharge",
  "military_criminal",
  "military_abuse",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export type Category = {
  key: CategoryKey;
  /** 버튼 이름 */
  label: string;
  /** 버튼 한 줄 설명 */
  description: string;
  /** 질문을 고른 뒤 질문창 위 안내 */
  guide: string;
  /** 질문창 placeholder */
  placeholder: string;
  /** 질문창에 넣는 문장 시작 (사용자가 이어 적는다) */
  starters: string[];
  /** 분류 보조: 규칙이 타임라인을 정하지 못할 때 쓸 타임라인 */
  track: TrackKey | LifeTrackKey;
  /** 무료 법제처 판례 검색에 더하는 고정 검색어 (법률 용어) */
  caseQuery: string;
  /** 찾는 판례의 사건 종류 (법원 사건부호 기준, 설명용) */
  caseKinds: string;
  /**
   * 무료 법제처 조문 검색에 더하는 고정 법령과 조문 번호. 일상 낱말로 묻는 분야는 자연어 법령 검색이
   * 엉뚱한 조문을 가져와서(2026-11-19 예시 생성: 빌려준 돈·폭행 상해), 그 분야의 기본 조문을 먼저 가져온다.
   * 카테고리마다 셋까지. 조문이 실제로 있는지는 tests/live/law-hints.live.test.ts가 법제처 무료 조회로 확인한다
   */
  lawHints?: LawHint[];
  /** 이 카테고리의 예시 답변 (lib/demo/examples.json id) */
  examples: string[];
};

/** 그 분야의 기본 조문. 조문 번호를 정해 두고 법제처에서 그대로 가져온다 (낱말 점수 검색은 엉뚱한 조문을 고르는 일이 있다) */
export type LawHint = { lawName: string; articleNos: string[] };

export const CATEGORIES: Record<CategoryKey, Category> = {
  lease: {
    key: "lease",
    label: "임대차",
    description: "전세·월세 보증금, 계약 갱신, 집주인 변경",
    guide:
      "집을 빌린 쪽(세입자) 기준으로 안내해요. 계약이 언제 끝났는지, 무엇이 문제인지 적어 주세요.",
    placeholder: "예: 전세 계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.",
    starters: [
      "전세 계약이 끝났는데 보증금을 돌려받지 못하고 있어요. ",
      "집주인이 계약 갱신을 거절했어요. ",
      "살고 있는 집의 주인이 바뀌었어요. ",
    ],
    track: "lease_deposit",
    caseQuery: "임대차보증금",
    caseKinds: "민사",
    lawHints: [{ lawName: "주택임대차보호법", articleNos: ["제3조", "제3조의3", "제6조"] }],
    examples: ["lease-01", "lease-02", "lease-03", "deep-lease-01"],
  },
  deposit: {
    key: "deposit",
    label: "계약금",
    description: "매매·임대 계약금, 가계약금 반환",
    guide: "계약금을 낸 쪽 기준으로 안내해요. 어떤 계약인지, 누가 계약을 깨려는지 적어 주세요.",
    placeholder: "예: 가계약금을 보냈는데 계약을 취소하고 싶어요.",
    starters: ["계약금을 보냈는데 상대방이 계약을 깨자고 해요. ", "가계약금을 돌려받고 싶어요. "],
    track: "contract_deposit",
    caseQuery: "계약금",
    caseKinds: "민사",
    lawHints: [{ lawName: "민법", articleNos: ["제565조", "제398조"] }],
    examples: ["deposit-01", "deposit-02"],
  },
  labor: {
    key: "labor",
    label: "노동",
    description: "월급·퇴직금 체불, 부당해고",
    guide:
      "일한 사람(근로자) 기준으로 안내해요. 일한 기간과 받지 못한 것, 해고 통보 방식을 적어 주세요.",
    placeholder: "예: 퇴사했는데 마지막 달 월급과 퇴직금을 받지 못했어요.",
    starters: [
      "월급을 받지 못하고 있어요. ",
      "퇴직금을 주지 않아요. ",
      "갑자기 해고 통보를 받았어요. ",
    ],
    track: "wage",
    caseQuery: "임금",
    caseKinds: "민사·행정",
    lawHints: [
      { lawName: "근로기준법", articleNos: ["제36조", "제43조"] },
      { lawName: "근로자퇴직급여 보장법", articleNos: ["제9조"] },
    ],
    examples: ["wage-02", "trap-number"],
  },
  fraud: {
    key: "fraud",
    label: "사기",
    description: "중고거래·온라인 거래 사기 피해",
    guide: "피해를 본 쪽 기준으로 안내해요. 어떻게 거래했고 돈을 어떻게 보냈는지 적어 주세요.",
    placeholder: "예: 중고거래로 돈을 먼저 보냈는데 판매자가 연락이 끊겼어요.",
    starters: [
      "중고거래로 돈을 보냈는데 물건을 받지 못했어요. ",
      "거래 상대방이 돈을 받고 연락이 끊겼어요. ",
    ],
    track: "fraud",
    caseQuery: "사기",
    caseKinds: "형사·민사",
    lawHints: [
      { lawName: "형법", articleNos: ["제347조"] },
      { lawName: "민법", articleNos: ["제750조"] },
    ],
    examples: ["fraud-01"],
  },
  traffic: {
    key: "traffic",
    label: "교통사고",
    description: "사고 손해배상, 보험사 과실 다툼",
    guide: "사고로 피해를 본 쪽 기준으로 안내해요. 사고 상황과 보험사가 한 말을 적어 주세요.",
    placeholder: "예: 횡단보도에서 차에 부딪혔는데 보험사가 과실을 나누자고 해요.",
    starters: ["교통사고로 다쳤는데 ", "보험사가 과실 비율을 나누자고 해요. "],
    track: "traffic",
    caseQuery: "손해배상(자)",
    caseKinds: "민사",
    lawHints: [
      { lawName: "교통사고처리 특례법", articleNos: ["제3조"] },
      { lawName: "자동차손해배상 보장법", articleNos: ["제3조"] },
      { lawName: "민법", articleNos: ["제750조"] },
    ],
    examples: ["other-01"],
  },
  neighbor: {
    key: "neighbor",
    label: "이웃 분쟁",
    description: "층간소음, 누수, 반려동물 피해",
    guide: "피해를 본 쪽 기준으로 안내해요. 어떤 피해가 언제부터 반복됐는지 적어 주세요.",
    placeholder: "예: 윗집 누수로 천장이 망가졌는데 수리를 해 주지 않아요.",
    starters: ["윗집 때문에 피해를 보고 있어요. ", "옆집 반려동물 때문에 "],
    track: "neighbor",
    caseQuery: "생활방해",
    caseKinds: "민사",
    lawHints: [{ lawName: "민법", articleNos: ["제217조", "제758조", "제750조"] }],
    examples: ["trap-vague"],
  },
  loan: {
    key: "loan",
    label: "빌려준 돈",
    description: "빌려준 돈·못 받은 대금 돌려받기",
    guide:
      "돈을 받아야 하는 쪽 기준으로 안내해요. 언제 어떻게 빌려줬고 증거가 무엇인지 적어 주세요.",
    placeholder: "예: 친구에게 빌려준 돈을 갚으라고 했는데 계속 미뤄요.",
    starters: ["빌려준 돈을 돌려받지 못하고 있어요. ", "일을 해 주고 대금을 받지 못했어요. "],
    track: "money",
    caseQuery: "대여금",
    caseKinds: "민사",
    lawHints: [
      { lawName: "민법", articleNos: ["제598조", "제603조"] },
      { lawName: "민사소송법", articleNos: ["제462조"] },
    ],
    examples: ["loan-01"],
  },
  family: {
    key: "family",
    label: "가족·이혼",
    description: "이혼, 재산분할, 양육비",
    guide: "이혼·양육 절차를 안내해요. 혼인 상황과 자녀 유무, 원하는 것을 적어 주세요.",
    placeholder: "예: 이혼한 배우자가 정해진 양육비를 보내지 않아요.",
    starters: ["이혼을 생각하고 있는데 ", "정해진 양육비를 받지 못하고 있어요. "],
    track: "family",
    caseQuery: "이혼",
    caseKinds: "가사",
    lawHints: [{ lawName: "민법", articleNos: ["제840조", "제837조", "제839조의2"] }],
    examples: ["family-01"],
  },
  inheritance: {
    key: "inheritance",
    label: "상속",
    description: "상속재산·빚 정리, 상속포기, 유류분",
    guide:
      "상속인 기준으로 안내해요. 누가 돌아가셨는지, 재산·빚과 다른 상속인과의 상황을 적어 주세요.",
    placeholder: "예: 부모님이 돌아가셨는데 빚이 있는지 모르겠어요.",
    starters: ["가족이 돌아가셨는데 상속재산과 빚을 ", "상속재산을 나누는 문제로 "],
    track: "inheritance",
    caseQuery: "상속재산분할",
    caseKinds: "가사·민사",
    lawHints: [{ lawName: "민법", articleNos: ["제1019조", "제1028조", "제1041조"] }],
    examples: ["inheritance-01"],
  },
  consumer: {
    key: "consumer",
    label: "소비자·환불",
    description: "온라인 쇼핑·서비스 환불, 청약철회",
    guide:
      "물건이나 서비스를 산 쪽 기준으로 안내해요. 어디서 무엇을 샀고 판매자가 뭐라고 했는지 적어 주세요.",
    placeholder: "예: 온라인 쇼핑몰에서 산 옷을 반품하려는데 환불을 거절해요.",
    starters: ["온라인으로 산 물건을 환불받고 싶은데 ", "헬스장 이용권을 중간에 해지하고 싶어요. "],
    track: "consumer",
    caseQuery: "청약철회",
    caseKinds: "민사",
    lawHints: [
      { lawName: "전자상거래 등에서의 소비자보호에 관한 법률", articleNos: ["제17조", "제18조"] },
    ],
    examples: ["consumer-01"],
  },
  defamation: {
    key: "defamation",
    label: "명예훼손·온라인",
    description: "악성 댓글, 허위 게시글, 단체방 모욕",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 어디에 어떤 글이 올라왔는지 적어 주세요(실명·연락처는 빼고).",
    placeholder: "예: 커뮤니티에 저에 대한 허위 사실이 담긴 글이 올라왔어요.",
    starters: ["온라인에 저를 비방하는 글이 올라왔어요. ", "단체 대화방에서 모욕을 당했어요. "],
    track: "defamation",
    caseQuery: "명예훼손",
    caseKinds: "형사·민사",
    lawHints: [
      { lawName: "형법", articleNos: ["제307조"] },
      {
        lawName: "정보통신망 이용촉진 및 정보보호 등에 관한 법률",
        articleNos: ["제70조", "제44조의2"],
      },
    ],
    examples: ["defamation-01"],
  },
  // ── 추가 섹션 (DEC-034): 추가 타임라인(more-tracks.ts)과 대면 모욕 ──
  insult: {
    key: "insult",
    label: "욕설·모욕 (대면)",
    description: "직접 들은 욕설, 사람들 앞 모욕·험담",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 어디에서 누가 있는 자리였는지, 어떤 말을 들었는지 적어 주세요(실명·연락처는 빼고).",
    placeholder: "예: 식당에서 다른 손님들이 보는 앞에서 심한 욕설을 들었어요.",
    starters: [
      "사람들 앞에서 심한 욕설을 들었어요. ",
      "직장 동료가 다른 사람들에게 저에 대한 험담을 퍼뜨려요. ",
    ],
    track: "insult",
    caseQuery: "모욕 공연성",
    caseKinds: "형사·민사",
    lawHints: [{ lawName: "형법", articleNos: ["제311조", "제312조"] }],
    examples: ["insult-01"],
  },
  assault: {
    key: "assault",
    label: "폭행·상해",
    description: "맞거나 다친 피해, 합의, 치료비",
    guide:
      "맞거나 다친 쪽 기준으로 안내해요. 언제 어디서 어떤 일이 있었고 얼마나 다쳤는지 적어 주세요.",
    placeholder: "예: 술집에서 모르는 사람에게 맞아서 병원 치료를 받았어요.",
    starters: ["모르는 사람에게 맞아서 다쳤어요. ", "가해자가 합의를 하자고 해요. "],
    track: "assault",
    caseQuery: "상해 손해배상(기)",
    caseKinds: "형사·민사",
    lawHints: [
      { lawName: "형법", articleNos: ["제257조", "제260조"] },
      { lawName: "민법", articleNos: ["제750조"] },
    ],
    examples: ["assault-01"],
  },
  stalking: {
    key: "stalking",
    label: "스토킹·협박",
    description: "반복되는 연락·접근, 협박",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 어떤 연락이나 접근이 언제부터 반복됐는지 적어 주세요. 위험하면 경찰 긴급신고가 먼저예요.",
    placeholder: "예: 헤어진 사람이 계속 연락하고 집 앞에 찾아와요.",
    starters: ["그만하라고 했는데도 계속 연락이 와요. ", "집이나 직장 앞에 계속 찾아와요. "],
    track: "stalking",
    caseQuery: "스토킹범죄",
    caseKinds: "형사",
    lawHints: [
      { lawName: "스토킹범죄의 처벌 등에 관한 법률", articleNos: ["제2조", "제9조", "제18조"] },
    ],
    examples: ["stalking-01"],
  },
  sex_crime: {
    key: "sex_crime",
    label: "성범죄 피해",
    description: "성폭력·성추행·불법 촬영 피해",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 적을 수 있는 만큼만 적어 주세요. 지원 기관 상담은 신고를 정하지 않았어도 받을 수 있어요.",
    placeholder: "예: 불법 촬영 피해를 입었는데 어떻게 대응해야 할지 모르겠어요.",
    starters: ["성추행 피해를 입었어요. ", "불법 촬영물이 퍼졌어요. "],
    track: "sex_crime",
    caseQuery: "강제추행",
    caseKinds: "형사·민사",
    lawHints: [
      { lawName: "성폭력범죄의 처벌 등에 관한 특례법", articleNos: ["제14조", "제27조"] },
      { lawName: "형법", articleNos: ["제298조"] },
    ],
    examples: ["sex-crime-01"],
  },
  voice_phishing: {
    key: "voice_phishing",
    label: "보이스피싱",
    description: "기관 사칭·문자 사기로 보낸 돈",
    guide:
      "속아서 돈을 보낸 쪽 기준으로 안내해요. 언제 어떤 연락을 받고 어디로 돈을 보냈는지 적어 주세요. 지급정지 요청이 급해요.",
    placeholder: "예: 검찰이라는 전화를 받고 알려 준 계좌로 돈을 보냈어요.",
    starters: [
      "기관을 사칭한 전화에 속아 돈을 보냈어요. ",
      "문자에 있는 주소를 눌렀더니 돈이 빠져나갔어요. ",
    ],
    track: "voice_phishing",
    caseQuery: "전기통신금융사기",
    caseKinds: "형사·민사",
    lawHints: [
      {
        lawName: "전기통신금융사기 피해 방지 및 피해자산 환급에 관한 특별법",
        articleNos: ["제3조", "제4조"],
      },
    ],
    examples: ["voice-phishing-01"],
  },
  crime_report: {
    key: "crime_report",
    label: "그 밖의 범죄 피해",
    description: "절도·횡령·재물손괴 등 고소",
    guide: "피해를 본 쪽 기준으로 안내해요. 어떤 피해를 누구에게 어떻게 입었는지 적어 주세요.",
    placeholder: "예: 맡겨 둔 물건을 돌려주지 않고 팔아 버렸어요.",
    starters: ["물건을 도둑맞았어요. ", "맡긴 돈을 마음대로 써 버렸어요. "],
    track: "crime_report",
    caseQuery: "고소",
    caseKinds: "형사",
    lawHints: [
      { lawName: "형사소송법", articleNos: ["제223조", "제237조"] },
      { lawName: "형법", articleNos: ["제355조"] },
    ],
    examples: ["crime-report-01"],
  },
  workplace_harassment: {
    key: "workplace_harassment",
    label: "직장 내 괴롭힘",
    description: "상사·동료의 괴롭힘, 따돌림",
    guide:
      "괴롭힘을 당한 쪽 기준으로 안내해요. 누가 어떤 행동을 언제부터 했는지, 회사에 알렸는지 적어 주세요.",
    placeholder: "예: 상사가 다른 직원들 앞에서 계속 폭언을 해요.",
    starters: ["상사에게 계속 폭언을 듣고 있어요. ", "회사에 신고했는데 조치를 하지 않아요. "],
    track: "workplace_harassment",
    caseQuery: "직장 내 괴롭힘",
    caseKinds: "민사·행정",
    lawHints: [{ lawName: "근로기준법", articleNos: ["제76조의2", "제76조의3"] }],
    examples: ["workplace-harassment-01"],
  },
  industrial_accident: {
    key: "industrial_accident",
    label: "산재",
    description: "일하다 다치거나 아픈 경우의 보상",
    guide:
      "일하다 다치거나 아픈 사람 기준으로 안내해요. 어떤 일을 하다가 어떻게 다쳤는지 적어 주세요.",
    placeholder: "예: 공사 현장에서 일하다 다쳤는데 회사가 산재 처리를 안 해 줘요.",
    starters: ["일하다가 다쳤어요. ", "회사가 산재 신청을 하지 말라고 해요. "],
    track: "industrial_accident",
    caseQuery: "업무상 재해",
    caseKinds: "행정·민사",
    lawHints: [{ lawName: "산업재해보상보험법", articleNos: ["제37조", "제41조", "제36조"] }],
    examples: ["industrial-accident-01"],
  },
  domestic_violence: {
    key: "domestic_violence",
    label: "가정폭력",
    description: "배우자·가족에게 당한 폭력",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 위험하면 경찰 긴급신고가 먼저예요. 적을 수 있는 만큼만 적어 주세요.",
    placeholder: "예: 배우자가 때려서 다쳤는데 접근을 막을 방법이 있나요?",
    starters: ["배우자에게 폭력을 당했어요. ", "가해자가 집에 오지 못하게 하고 싶어요. "],
    track: "domestic_violence",
    caseQuery: "가정폭력",
    caseKinds: "가사·형사",
    lawHints: [
      {
        lawName: "가정폭력범죄의 처벌 등에 관한 특례법",
        articleNos: ["제8조", "제29조", "제55조의2"],
      },
    ],
    examples: ["domestic-violence-01"],
  },
  school_violence: {
    key: "school_violence",
    label: "학교폭력",
    description: "학생이 당한 폭력·따돌림",
    guide:
      "피해 학생과 보호자 기준으로 안내해요. 어떤 일이 언제부터 있었고 학교에 알렸는지 적어 주세요.",
    placeholder: "예: 아이가 같은 반 학생들에게 따돌림과 괴롭힘을 당하고 있어요.",
    starters: [
      "아이가 학교에서 괴롭힘을 당하고 있어요. ",
      "학교폭력 조치 결과를 받아들이기 어려워요. ",
    ],
    track: "school_violence",
    caseQuery: "학교폭력",
    caseKinds: "행정·민사",
    lawHints: [
      { lawName: "학교폭력예방 및 대책에 관한 법률", articleNos: ["제16조", "제17조", "제20조"] },
    ],
    examples: ["school-violence-01"],
  },
  medical: {
    key: "medical",
    label: "의료사고",
    description: "진료·수술 뒤 생긴 피해",
    guide: "환자 쪽 기준으로 안내해요. 어떤 진료를 받았고 그 뒤 어떤 일이 생겼는지 적어 주세요.",
    placeholder: "예: 수술을 받은 뒤 상태가 나빠졌는데 병원은 책임이 없다고 해요.",
    starters: ["수술을 받은 뒤 문제가 생겼어요. ", "병원이 진료 기록을 주지 않아요. "],
    track: "medical",
    caseQuery: "의료과실 손해배상",
    caseKinds: "민사",
    lawHints: [
      { lawName: "의료법", articleNos: ["제24조의2"] },
      { lawName: "민법", articleNos: ["제750조"] },
      { lawName: "의료사고 피해구제 및 의료분쟁 조정 등에 관한 법률", articleNos: ["제27조"] },
    ],
    examples: ["medical-01"],
  },
  privacy: {
    key: "privacy",
    label: "개인정보",
    description: "개인정보 유출·명의 도용",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 어떤 정보가 어디에서 새거나 쓰였는지 적어 주세요(정보 자체는 적지 말고).",
    placeholder: "예: 가입한 사이트에서 개인정보가 유출됐다는 통지를 받았어요.",
    starters: [
      "개인정보가 유출됐다는 통지를 받았어요. ",
      "제 이름으로 모르는 가입이 되어 있어요. ",
    ],
    track: "privacy",
    caseQuery: "개인정보 유출 손해배상",
    caseKinds: "민사·형사",
    lawHints: [{ lawName: "개인정보 보호법", articleNos: ["제34조", "제39조", "제39조의2"] }],
    examples: ["privacy-01"],
  },
  commercial_lease: {
    key: "commercial_lease",
    label: "상가 임대차",
    description: "상가 계약 갱신, 권리금, 임대료",
    guide: "상가를 빌린 쪽(임차인) 기준으로 안내해요. 계약 기간과 무엇이 문제인지 적어 주세요.",
    placeholder: "예: 상가 임대인이 재계약을 거절해서 권리금을 못 받게 됐어요.",
    starters: ["상가 임대인이 재계약을 해 주지 않아요. ", "권리금을 받지 못하게 됐어요. "],
    track: "commercial_lease",
    caseQuery: "권리금 회수 방해",
    caseKinds: "민사",
    lawHints: [{ lawName: "상가건물 임대차보호법", articleNos: ["제10조", "제10조의4", "제3조"] }],
    examples: ["commercial-lease-01"],
  },
  respond_civil: {
    key: "respond_civil",
    label: "소장·지급명령을 받음",
    description: "법원 서류를 받은 쪽의 대응",
    guide:
      "서류를 받은 쪽 기준으로 안내해요. 어떤 서류를 받았는지 적어 주세요. 서류에 적힌 기한을 먼저 확인하세요.",
    placeholder: "예: 법원에서 지급명령을 받았는데 어떻게 해야 하나요?",
    starters: ["법원에서 지급명령을 받았어요. ", "소장을 받았는데 내용이 사실과 달라요. "],
    track: "respond_civil",
    caseQuery: "지급명령 이의신청",
    caseKinds: "민사",
    lawHints: [{ lawName: "민사소송법", articleNos: ["제470조", "제256조", "제257조"] }],
    examples: ["respond-civil-01"],
  },
  respond_criminal: {
    key: "respond_criminal",
    label: "고소·신고를 당함",
    description: "수사를 받게 된 쪽의 대응",
    guide: "수사를 받게 된 쪽 기준으로 안내해요. 어떤 일로 연락을 받았는지 적어 주세요.",
    placeholder: "예: 경찰서에서 조사받으러 나오라는 연락을 받았어요.",
    starters: ["경찰에서 출석하라는 연락을 받았어요. ", "고소를 당했다는 말을 들었어요. "],
    track: "respond_criminal",
    caseQuery: "피의자신문",
    caseKinds: "형사",
    lawHints: [{ lawName: "형사소송법", articleNos: ["제244조의3", "제243조의2", "제200조"] }],
    examples: ["respond-criminal-01"],
  },
  admin_appeal: {
    key: "admin_appeal",
    label: "행정처분 불복",
    description: "영업정지·면허 취소 등 처분 다투기",
    guide:
      "처분을 받은 쪽 기준으로 안내해요. 어떤 처분을 받았는지 적어 주세요. 처분서에 적힌 불복 기한을 먼저 확인하세요.",
    placeholder: "예: 영업정지 처분을 받았는데 억울해서 다투고 싶어요.",
    starters: ["영업정지 처분을 받았어요. ", "운전면허가 취소됐어요. "],
    track: "admin_appeal",
    caseQuery: "처분 취소",
    caseKinds: "행정",
    lawHints: [
      { lawName: "행정심판법", articleNos: ["제27조", "제30조"] },
      { lawName: "행정소송법", articleNos: ["제20조"] },
    ],
    examples: ["admin-appeal-01"],
  },
  debt_relief: {
    key: "debt_relief",
    label: "빚·채무조정",
    description: "갚기 어려운 빚, 개인회생·파산",
    guide:
      "빚을 갚기 어려운 쪽 기준으로 안내해요. 빚의 종류와 소득 상황을 적어 주세요(계좌번호는 빼고).",
    placeholder: "예: 빚이 많아 갚기 어려운데 개인회생을 할 수 있을까요?",
    starters: ["빚을 갚기 어려워졌어요. ", "개인회생과 파산 중 무엇을 알아봐야 할지 모르겠어요. "],
    track: "debt_relief",
    caseQuery: "개인회생",
    caseKinds: "민사",
    lawHints: [
      { lawName: "채무자 회생 및 파산에 관한 법률", articleNos: ["제588조", "제611조", "제624조"] },
    ],
    examples: ["debt-relief-01"],
  },
  auction: {
    key: "auction",
    label: "부동산 경매",
    description: "경매로 집·땅 사기, 권리분석·입찰",
    guide:
      "경매에 입찰하려는 쪽 기준으로 안내해요. 어떤 물건인지, 무엇이 걱정되는지 적어 주세요. 살던 집이 경매에 넘어간 경우는 임대차를 골라 주세요.",
    placeholder: "예: 경매로 나온 아파트에 입찰하려는데 무엇을 확인해야 하나요?",
    starters: [
      "경매 물건의 권리분석을 해 보니 먼저 들어온 임차인이 있어요. ",
      "경매에서 낙찰받았는데 살고 있는 사람이 나가지 않아요. ",
    ],
    track: "auction",
    caseQuery: "부동산 경매 매수인 인수",
    caseKinds: "민사·집행",
    lawHints: [{ lawName: "민사집행법", articleNos: ["제91조", "제113조", "제142조"] }],
    examples: ["auction-01"],
  },
  registration: {
    key: "registration",
    label: "부동산 등기",
    description: "소유권이전등기·가등기 신청",
    guide:
      "등기를 신청하려는 쪽 기준으로 안내해요. 어떤 등기인지(매매·상속·증여 등) 적어 주세요. 보증금 때문에 하는 임차권등기명령은 임대차를 골라 주세요.",
    placeholder: "예: 집을 샀는데 소유권이전등기는 어떻게 신청하나요?",
    starters: ["집을 샀는데 등기를 직접 신청하고 싶어요. ", "가등기를 본등기로 바꾸려고 해요. "],
    track: "registration",
    caseQuery: "소유권이전등기",
    caseKinds: "민사",
    lawHints: [{ lawName: "부동산등기법", articleNos: ["제23조", "제24조", "제29조"] }],
    examples: ["registration-01"],
  },
  fine_objection: {
    key: "fine_objection",
    label: "과태료",
    description: "과태료 통지·부과에 이의제기",
    guide:
      "과태료를 통지받은 쪽 기준으로 안내해요. 어떤 일로 통지를 받았는지 적어 주세요. 통지서에 적힌 기한을 먼저 확인하세요.",
    placeholder: "예: 주차 위반 과태료 고지서를 받았는데 억울해서 이의를 제기하고 싶어요.",
    starters: ["과태료 사전통지서를 받았어요. ", "과태료를 내지 않으면 어떻게 되는지 궁금해요. "],
    track: "fine_objection",
    caseQuery: "과태료 이의",
    caseKinds: "행정·비송",
    lawHints: [{ lawName: "질서위반행위규제법", articleNos: ["제16조", "제20조", "제21조"] }],
    examples: ["fine-objection-01"],
  },
  business_permit: {
    key: "business_permit",
    label: "영업신고·허가",
    description: "가게를 열 때 필요한 신고·허가",
    guide:
      "영업을 시작하려는 쪽 기준으로 안내해요. 어떤 업종인지, 어디에서 하려는지 적어 주세요(상세 주소는 빼고).",
    placeholder: "예: 반찬가게를 열려는데 영업신고는 어떻게 하나요?",
    starters: ["음식점을 열려고 해요. ", "하던 가게를 넘겨받으려고 해요. "],
    track: "business_permit",
    caseQuery: "영업신고 수리",
    caseKinds: "행정",
    lawHints: [{ lawName: "식품위생법", articleNos: ["제37조", "제39조", "제41조"] }],
    examples: ["business-permit-01"],
  },
  insurance_claim: {
    key: "insurance_claim",
    label: "보험금",
    description: "보험금 지급 거절·삭감 다투기",
    guide:
      "보험금을 청구한 쪽 기준으로 안내해요. 어떤 보험인지, 보험사가 어떤 이유로 거절했는지 적어 주세요(증권번호는 빼고).",
    placeholder: "예: 보험사가 고지의무 위반이라며 진단금 지급을 거절했어요.",
    starters: ["보험금을 청구했는데 지급이 거절됐어요. ", "보험사가 보험금을 깎아서 줬어요. "],
    track: "insurance_claim",
    caseQuery: "보험금 고지의무 위반",
    caseKinds: "민사",
    lawHints: [{ lawName: "상법", articleNos: ["제651조", "제655조", "제658조"] }],
    examples: ["insurance-claim-01"],
  },
  copyright: {
    key: "copyright",
    label: "저작권",
    description: "내 글·그림·영상이 무단으로 쓰였을 때",
    guide:
      "창작물을 만든 쪽 기준으로 안내해요. 무엇을 만들었고 어디에 어떻게 쓰였는지 적어 주세요.",
    placeholder: "예: 제가 그린 그림을 다른 사람이 허락 없이 영상에 썼어요.",
    starters: [
      "제가 만든 작품이 허락 없이 쓰이고 있어요. ",
      "제 사진을 무단으로 가져다 쓴 곳을 찾았어요. ",
    ],
    track: "copyright",
    caseQuery: "저작권 침해 손해배상",
    caseKinds: "민사·형사",
    lawHints: [{ lawName: "저작권법", articleNos: ["제103조", "제125조", "제136조"] }],
    examples: ["copyright-01"],
  },
  // ── 2026-11-19 3차 추가: 복지·부동산 매매·세금·군 복무 ──
  welfare_appeal: {
    key: "welfare_appeal",
    label: "복지·실업급여",
    description: "수급 거절·중지·환수 통지 다투기",
    guide:
      "급여를 신청했거나 받고 있는 쪽 기준으로 안내해요. 어떤 급여인지, 어떤 통지를 받았는지 적어 주세요. 통지서에 적힌 이의 기한을 먼저 확인하세요.",
    placeholder: "예: 실업급여를 신청했는데 자발적 퇴사라며 거절됐어요.",
    starters: [
      "실업급여 신청이 거절됐어요. ",
      "기초생활수급자에서 탈락했다는 통지를 받았어요. ",
      "받은 급여를 환수하겠다는 통지를 받았어요. ",
    ],
    track: "welfare_appeal",
    caseQuery: "실업급여 부정수급 반환명령",
    caseKinds: "행정",
    lawHints: [
      { lawName: "고용보험법", articleNos: ["제87조"] },
      { lawName: "국민기초생활 보장법", articleNos: ["제38조", "제40조"] },
    ],
    examples: ["welfare-appeal-01"],
  },
  property_defect: {
    key: "property_defect",
    label: "부동산 매매 하자",
    description: "산 집의 하자, 공인중개사 책임",
    guide:
      "집이나 땅을 산 쪽 기준으로 안내해요. 언제 샀고 어떤 하자를 언제 발견했는지, 중개사가 무엇을 설명했는지 적어 주세요.",
    placeholder: "예: 아파트를 사서 이사했는데 누수가 있어요. 전 주인은 몰랐다고 해요.",
    starters: [
      "집을 샀는데 이사하고 나서 하자를 발견했어요. ",
      "공인중개사가 설명한 내용이 사실과 달랐어요. ",
    ],
    track: "property_defect",
    caseQuery: "매도인 하자담보책임",
    caseKinds: "민사",
    lawHints: [
      { lawName: "민법", articleNos: ["제580조"] },
      { lawName: "공인중개사법", articleNos: ["제25조", "제30조"] },
    ],
    examples: ["property-defect-01"],
  },
  tax_appeal: {
    key: "tax_appeal",
    label: "세금",
    description: "증여·양도 세금 신고, 고지서 불복",
    guide:
      "세금을 내야 하는 쪽 기준으로 안내해요. 어떤 일(증여·양도·상속)이 있었는지, 고지서나 통지를 받았는지 적어 주세요. 세액은 여기서 계산하지 않아요.",
    placeholder: "예: 부모님께 돈을 받았는데 증여세를 신고해야 하는지 궁금해요.",
    starters: [
      "가족에게 재산을 받았는데 증여세 신고가 필요한지 궁금해요. ",
      "집을 팔았는데 양도소득세 고지서를 받았어요. ",
      "세무서에서 과세예고 통지를 받았어요. ",
    ],
    track: "tax_appeal",
    caseQuery: "증여세 부과처분 취소",
    caseKinds: "행정(조세)",
    lawHints: [{ lawName: "국세기본법", articleNos: ["제55조", "제61조", "제81조의15"] }],
    examples: ["tax-appeal-01"],
  },
  military_discharge: {
    key: "military_discharge",
    label: "의가사 제대",
    description: "질병·부적응으로 복무가 어려울 때",
    guide:
      "복무 중인 본인이나 가족 기준으로 안내해요. 어떤 증상이 언제부터 있었는지, 병인지 간부인지 적어 주세요(부대 이름은 빼고).",
    placeholder: "예: 복무 중 허리를 다쳐 훈련을 못 하는데 의가사 제대가 되는지 궁금해요.",
    starters: [
      "군 복무 중 다쳐서 복무를 이어가기 어려워요. ",
      "아들이 군대에서 적응을 못 해 현역복무부적합 심사를 알아보고 있어요. ",
    ],
    track: "military_discharge",
    caseQuery: "현역복무부적합 전역처분",
    caseKinds: "행정",
    lawHints: [
      { lawName: "병역법", articleNos: ["제65조"] },
      { lawName: "군인사법", articleNos: ["제37조"] },
    ],
    examples: ["military-discharge-01"],
  },
  military_criminal: {
    key: "military_criminal",
    label: "군형법·군사재판",
    description: "군인 신분으로 수사·재판·징계를 받을 때",
    guide:
      "수사나 징계를 받는 군인 본인이나 가족 기준으로 안내해요. 어떤 일로 어느 기관의 조사를 받는지 적어 주세요. 군형법은 같은 행위를 더 무겁게 정한 조항이 있어요.",
    placeholder: "예: 부대 안에서 후임과 다퉈 군사경찰 조사를 받게 됐어요.",
    starters: [
      "군 복무 중 군사경찰 조사를 받게 됐어요. ",
      "휴가 복귀를 못 해 군무이탈로 조사받는다고 해요. ",
      "상관 모욕으로 징계와 수사를 함께 받고 있어요. ",
    ],
    track: "military_criminal",
    caseQuery: "군형법 상관모욕",
    caseKinds: "형사(군사)",
    lawHints: [
      { lawName: "군형법", articleNos: ["제1조", "제60조의6"] },
      { lawName: "군사법원법", articleNos: ["제2조"] },
    ],
    examples: ["military-criminal-01"],
  },
  military_abuse: {
    key: "military_abuse",
    label: "군 가혹행위",
    description: "구타·폭언·따돌림 신고와 진정",
    guide:
      "피해를 입은 군인 본인이나 가족 기준으로 안내해요. 어떤 일이 얼마나 이어졌는지 적어 주세요(이름·부대 이름은 빼고).",
    placeholder: "예: 군대에서 선임이 매일 폭언을 하고 잠을 못 자게 해요.",
    starters: [
      "군대에서 선임에게 구타와 폭언을 당하고 있어요. ",
      "아들이 부대에서 가혹행위를 당했다고 해요. ",
    ],
    track: "military_abuse",
    caseQuery: "군인 가혹행위 국가배상",
    caseKinds: "형사·행정",
    lawHints: [
      {
        lawName: "군인의 지위 및 복무에 관한 기본법",
        articleNos: ["제26조", "제43조", "제45조"],
      },
    ],
    examples: ["military-abuse-01"],
  },
};

export const CATEGORY_LIST: Category[] = CATEGORY_KEYS.map((k) => CATEGORIES[k]);

export function isCategoryKey(v: unknown): v is CategoryKey {
  return typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);
}

/**
 * 홈 화면 묶음 (DEC-034). 버튼이 많아져 묶음 탭 하나씩만 펼쳐 보인다. 모든 카테고리가 정확히 한 묶음에 든다
 * (categories.test.ts가 확인). 묶음은 화면 정리용이고 분류·검색에는 쓰지 않는다.
 */
export const CATEGORY_GROUPS: { key: string; label: string; keys: CategoryKey[] }[] = [
  {
    key: "home",
    label: "집·돈·계약",
    keys: [
      "lease",
      "commercial_lease",
      "deposit",
      "loan",
      "consumer",
      "debt_relief",
      "auction",
      "registration",
      "property_defect",
    ],
  },
  { key: "work", label: "일터", keys: ["labor", "workplace_harassment", "industrial_accident"] },
  {
    key: "crime",
    label: "범죄 피해",
    keys: [
      "fraud",
      "voice_phishing",
      "defamation",
      "insult",
      "assault",
      "stalking",
      "sex_crime",
      "crime_report",
    ],
  },
  {
    key: "family",
    label: "가족·학교",
    keys: ["family", "inheritance", "domestic_violence", "school_violence"],
  },
  {
    key: "life",
    label: "사고·생활",
    keys: [
      "traffic",
      "medical",
      "neighbor",
      "privacy",
      "business_permit",
      "insurance_claim",
      "copyright",
    ],
  },
  {
    key: "respond",
    label: "서류·처분을 받음",
    keys: [
      "respond_civil",
      "respond_criminal",
      "admin_appeal",
      "fine_objection",
      "welfare_appeal",
      "tax_appeal",
    ],
  },
  // 군 복무는 민간 절차와 기관·법이 달라 묶음을 따로 둔다 (2026-11-19 3차)
  {
    key: "military",
    label: "군 복무",
    keys: ["military_discharge", "military_criminal", "military_abuse"],
  },
];

/** 카테고리가 든 묶음 키 */
export function groupOf(key: CategoryKey): string {
  return CATEGORY_GROUPS.find((g) => g.keys.includes(key))?.key ?? CATEGORY_GROUPS[0].key;
}
