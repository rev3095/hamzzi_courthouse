// 섹션별 절차 단계 상수 (F-014 데모 축소판, DEC-021). 홈 예시 질문 섹션(임대차·계약금·노동·사기·교통사고·이웃 분쟁)마다
// 절차가 다르므로 타임라인(track)을 따로 둔다. 화면에 PROCEDURE_NOTICE("일반적인 절차 안내")를 함께 표시한다.
// 기간·비용·인원 숫자는 넣지 않는다 (절대 규칙 3) — 공식 기준 출처를 정하는 일은 OQ-DM-09.
// 결과(승패)를 판정하지 않고 단계별 난이도 라벨만 단다 (DEC-002). 숫자·단정 표현은 policy.test.ts가 검사한다.

/** API.md GET /procedures의 difficulty와 같은 값 */
export type Difficulty = "self" | "depends" | "expert";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  self: "혼자 가능",
  depends: "상황에 따라",
  expert: "전문가 권장",
};

/** 문서 작성 화면 (/documents/[kind]). legal_documents 게이트 뒤 (DEC-022·025) */
export type DocumentKind =
  | "demand-letter"
  | "lease-registration"
  | "payment-order"
  | "complaint"
  | "criminal-complaint"
  | "compensation-order"
  | "wage-petition"
  | "wage-advance"
  | "dismissal-remedy"
  | "dismissal-review"
  | "lease-mediation"
  | "civil-mediation"
  | "financial-mediation"
  | "property-disclosure";

export type OfficialLink = { label: string; url: string };

export type ProcedureStep = {
  /** 타임라인 안에서 고유한 키 */
  key: string;
  label: string;
  difficulty: Difficulty;
  /** 준비할 것 */
  prepare: string[];
  /** 주의할 점 */
  cautions: string[];
  /** 공식 안내 (첫 번째가 '바로 가기' 대상) */
  links: OfficialLink[];
  /** 이 단계의 문서 작성 화면 (게이트 뒤) */
  document?: DocumentKind;
  /** '바로 가기' 카드가 여는 공식 창구. 없으면 바로 가기 카드를 보이지 않는다 (단계 이름과 어긋나는 곳으로 보내지 않기) */
  shortcut?: OfficialLink;
  /** "이 단계 질문하기"가 이어 묻기 입력란에 넣는 문장 */
  question: string;
};

export const OFFICIAL = {
  epost: { label: "인터넷우체국 (내용증명)", url: "https://www.epost.go.kr" },
  ecfs: { label: "대한민국 법원 전자소송", url: "https://ecfs.scourt.go.kr" },
  klac: { label: "대한법률구조공단", url: "https://www.klac.or.kr" },
  leaseMediation: {
    label: "대한법률구조공단 (주택임대차분쟁조정위원회)",
    url: "https://www.klac.or.kr",
  },
  gov24: { label: "정부24 (주민등록 초본)", url: "https://www.gov.kr" },
  iros: { label: "인터넷등기소 (등기사항증명서)", url: "https://www.iros.go.kr" },
  moel: { label: "고용노동부", url: "https://www.moel.go.kr" },
  moelComplaint: { label: "고용노동부 (임금체불 진정 안내)", url: "https://www.moel.go.kr" },
  comwel: { label: "근로복지공단 (대지급금)", url: "https://www.comwel.or.kr" },
  nlrc: { label: "노동위원회 (부당해고 구제신청)", url: "https://www.nlrc.go.kr" },
  police: { label: "경찰청", url: "https://www.police.go.kr" },
  cyberPolice: {
    label: "경찰청 사이버범죄 신고시스템 (온라인 범죄)",
    url: "https://ecrm.police.go.kr",
  },
  fss: { label: "금융감독원 (보험 민원·분쟁조정)", url: "https://www.fss.or.kr" },
  epeople: { label: "국민신문고 (지자체 민원)", url: "https://www.epeople.go.kr" },
} satisfies Record<string, OfficialLink>;

// ── 여러 타임라인이 같이 쓰는 민사 단계 ─────────────────────────

const NOTICE_CAUTIONS = [
  "내용증명은 어떤 내용을 보냈는지를 우체국이 증명해 주는 것이고, 그 자체로 돈을 받게 하는 강제력은 없어요.",
  "감정적인 표현이나 위협으로 읽힐 수 있는 문장은 피하세요.",
];

const LIMITATION_CAUTION =
  "청구할 수 있는 기간(소멸시효)이 얼마 남지 않았다면 내용증명만으로는 시효가 멈추지 않을 수 있어요. 법원 절차를 함께 검토하세요.";

function notice(extra: Partial<ProcedureStep> = {}): ProcedureStep {
  return {
    key: "notice",
    label: "내용증명",
    difficulty: "self",
    prepare: [
      "상대방 주소",
      "요구하는 내용과 금액",
      "언제까지 해 달라는 기한",
      "보내는 사람 이름·주소",
    ],
    cautions: [...NOTICE_CAUTIONS, LIMITATION_CAUTION],
    links: [OFFICIAL.epost],
    document: "demand-letter",
    question: "내용증명을 보내려면 무엇을 준비하고 어떤 내용을 적어야 하나요?",
    ...extra,
  };
}

const ORDER: ProcedureStep = {
  key: "order",
  label: "지급명령 신청",
  difficulty: "self",
  prepare: [
    "지급명령 신청서",
    "청구 금액과 그 근거 자료",
    "상대방 주소",
    "인지대·송달료 (법원 안내 기준)",
  ],
  cautions: [
    "상대방이 이의를 내면 지급명령을 신청할 때 소송을 낸 것으로 보고 소송으로 넘어가요. 새 소장을 내는 대신 법원 안내에 따라 인지대를 더 내야 할 수 있어요.",
    "상대방 주소를 모르면 진행이 어려울 수 있어요.",
  ],
  links: [OFFICIAL.ecfs],
  document: "payment-order",
  question: "지급명령은 어떻게 신청하고, 상대방이 이의를 내면 어떻게 되나요?",
};

function suit(extra: Partial<ProcedureStep> = {}): ProcedureStep {
  return {
    key: "suit",
    label: "소송 (소장·변론)",
    difficulty: "depends",
    prepare: [
      "처음부터 소송한다면 소장 (청구취지·청구원인)",
      "지급명령 이의로 넘어왔다면 법원의 보정 안내",
      "증거 목록과 증거 사본",
      "인지대·송달료 (법원 안내 기준)",
    ],
    cautions: [
      "지급명령을 거치지 않고 처음부터 소장을 내 소송할 수도 있어요.",
      "상대방이 다투면 답변서·준비서면을 주고받고 변론 기일에 나가야 해요.",
      "쟁점이 복잡하면 변호사·법무사 상담을 함께 검토하세요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
    document: "complaint",
    question: "소송을 하면 소장에는 무엇을 적고 어떤 절차를 거치나요?",
    ...extra,
  };
}

const JUDGMENT: ProcedureStep = {
  key: "judgment",
  label: "판결",
  difficulty: "depends",
  prepare: ["판결문 확인", "판결이 확정됐는지 확인"],
  cautions: [
    "판결에 불복하려면 정해진 기간 안에 항소해야 해요. 기간은 판결문을 받은 날부터 시작되니 법원 안내(나홀로소송)에서 바로 확인하세요.",
  ],
  links: [OFFICIAL.ecfs],
  question: "판결이 나온 뒤에는 무엇을 확인하고 준비해야 하나요?",
};

const ENFORCE: ProcedureStep = {
  key: "enforce",
  label: "강제집행",
  difficulty: "expert",
  prepare: [
    "집행권원 (확정됐거나 가집행선고가 있는 판결, 확정된 지급명령 등)",
    "집행문 (필요한 경우, 법원 안내 확인)",
    "상대방 재산 정보 (예금·부동산 등)",
  ],
  cautions: [
    "상대방 재산을 찾기 어려우면 재산명시 같은 절차를 함께 검토해야 해요.",
    "절차가 복잡해 전문가 상담을 권해요.",
  ],
  links: [OFFICIAL.ecfs, OFFICIAL.klac],
  document: "property-disclosure",
  question: "판결을 받았는데도 돈을 주지 않으면 강제집행은 어떻게 하나요?",
};

const EVIDENCE_MONEY: ProcedureStep = {
  key: "evidence",
  label: "증거 정리",
  difficulty: "self",
  prepare: [
    "계약서·차용증·영수증",
    "계좌 이체 내역",
    "문자·메신저 대화 캡처",
    "상대방 이름·연락처·주소",
  ],
  cautions: [
    "원본은 따로 보관하고 사본을 쓰세요.",
    "대화 캡처는 날짜와 상대방이 함께 보이게 남겨 두세요.",
  ],
  links: [OFFICIAL.ecfs],
  question: "제 상황에서 어떤 자료를 증거로 모아 두면 좋을까요?",
};

// ── 섹션별 타임라인 ─────────────────────────────────────────

export type TrackKey =
  | "lease_deposit"
  | "lease_residence"
  | "contract_deposit"
  | "wage"
  | "dismissal"
  | "fraud"
  | "traffic"
  | "neighbor"
  | "money";

export type Track = {
  key: TrackKey;
  /** 홈 예시 질문 섹션 이름 */
  section: string;
  /** 타임라인 제목 */
  title: string;
  steps: ProcedureStep[];
  /** 먼저 추천하는 단계 키 (규칙으로 고정) */
  recommended: string;
  /** 왜 이 단계를 먼저 안내하는지 (고정 문구) */
  reason: string;
  /** 함께 알아 둘 별도 절차 */
  note?: string;
};

export const TRACKS: Record<TrackKey, Track> = {
  lease_deposit: {
    key: "lease_deposit",
    section: "임대차",
    title: "보증금 반환",
    recommended: "notice",
    reason:
      "보증금을 돌려 달라고 요구하는 상황으로 보여서, 요구 내용을 문서로 남기는 단계부터 안내해요. 이사 계획이 있으면 임차권등기명령도 함께 살펴보세요.",
    steps: [
      EVIDENCE_MONEY,
      notice(),
      {
        key: "lease_registration",
        label: "임차권등기명령",
        difficulty: "depends",
        prepare: [
          "임대차계약서",
          "주민등록 초본 (전입 사실 확인)",
          "계약이 끝났음을 보여 주는 자료 (해지 통지 등)",
        ],
        cautions: [
          "보증금을 받기 전에 이사하거나 주소를 옮길 계획이면 이 신청을 먼저 검토하세요.",
          "등기가 마쳐졌는지 확인한 뒤에 이사하는 것이 안전해요.",
        ],
        links: [OFFICIAL.ecfs],
        document: "lease-registration",
        question: "임차권등기명령은 언제, 어떻게 신청하나요?",
      },
      ORDER,
      suit(),
      JUDGMENT,
      ENFORCE,
    ],
  },

  lease_residence: {
    key: "lease_residence",
    section: "임대차",
    title: "계속 거주·갱신 분쟁",
    recommended: "facts",
    reason:
      "계속 살 수 있는지, 갱신 거절이 정당했는지는 대항력 요건과 실제 사실관계에 따라 달라져서, 그 확인부터 안내해요.",
    steps: [
      {
        key: "facts",
        label: "대항력·사실 확인",
        difficulty: "self",
        prepare: [
          "임대차계약서",
          "주민등록 초본 (전입일 확인)",
          "등기사항증명서 (집주인이 바뀌었는지 확인)",
          "갱신을 요구하거나 거절당한 문자·통화 기록",
        ],
        cautions: [
          "보호를 받으려면 전입신고와 실제 거주를 계속 유지해야 해요. 다툼이 끝나기 전에 이사하거나 주소를 옮기는 일은 신중히 하세요.",
          "계약 갱신을 요구할 수 있는 기간이 정해져 있어요. 공식 안내에서 확인하세요.",
          "상대방 사정(실거주 여부, 다른 사람에게 세를 줬는지 등)을 전해 들은 것이라면 사실인지 먼저 확인하세요.",
        ],
        links: [OFFICIAL.gov24, OFFICIAL.iros],
        shortcut: OFFICIAL.gov24,
        question: "제가 대항력을 갖췄는지 무엇으로 확인하나요?",
      },
      notice({
        prepare: [
          "상대방(새 집주인 또는 집주인) 주소",
          "계약을 이어 가겠다는 입장이나 요구하는 내용",
          "그 근거가 되는 사실 (전입일·계약 기간 등)",
          "보내는 사람 이름·주소",
        ],
        cautions: [...NOTICE_CAUTIONS, "입장과 근거는 확인한 사실만 적으세요."],
        question: "새 집주인이나 집주인에게 보낼 내용증명에는 무엇을 적어야 하나요?",
      }),
      {
        key: "mediation",
        label: "분쟁조정 신청",
        difficulty: "depends",
        prepare: ["조정 신청서", "임대차계약서", "주고받은 문자·내용증명"],
        cautions: ["조정은 양쪽이 합의해야 성립해요. 상대방이 응하지 않으면 소송을 검토해요."],
        links: [OFFICIAL.leaseMediation],
        document: "lease-mediation",
        question: "주택임대차분쟁조정위원회 조정은 어떻게 신청하나요?",
      },
      suit({
        cautions: [
          "계속 거주를 다투는지, 손해배상을 청구하는지에 따라 소송의 내용이 달라요.",
          "쟁점이 복잡하면 변호사·법무사 상담을 함께 검토하세요.",
        ],
        question: "이 문제로 소송을 하면 무엇을 청구하고 어떤 절차를 거치나요?",
      }),
      JUDGMENT,
    ],
  },

  contract_deposit: {
    key: "contract_deposit",
    section: "계약금",
    title: "계약금·가계약금 반환",
    recommended: "notice",
    reason:
      "계약금을 돌려 달라고 하거나 계약 해제 문제를 다투는 상황으로 보여서, 요구 내용을 문서로 남기는 단계부터 안내해요. 증거 정리는 함께 해 두면 좋아요.",
    steps: [
      {
        ...EVIDENCE_MONEY,
        label: "계약 자료 정리",
        prepare: [
          "계약서 또는 가계약 내용이 담긴 문자",
          "계약금·가계약금 송금 내역",
          "계약을 깨자는 연락이 오간 기록",
          "상대방 이름·연락처·주소",
        ],
        cautions: [
          "정식 계약이 성립했는지, 무엇을 약속했는지에 따라 판단이 달라질 수 있어요. 주고받은 문자를 빠짐없이 남겨 두세요.",
        ],
        question: "계약금 문제에서 어떤 자료를 모아 두면 좋을까요?",
      },
      notice({ question: "계약금 반환을 요구하는 내용증명에는 무엇을 적어야 하나요?" }),
      ORDER,
      suit(),
      JUDGMENT,
      ENFORCE,
    ],
  },

  wage: {
    key: "wage",
    section: "노동",
    title: "임금·퇴직금 체불",
    recommended: "complaint",
    reason:
      "임금·퇴직금을 받지 못한 상황으로 보여서, 고용노동부 진정부터 안내해요. 진정은 혼자서 온라인으로도 낼 수 있어요.",
    steps: [
      {
        key: "evidence",
        label: "근로·임금 자료 정리",
        difficulty: "self",
        prepare: [
          "근로계약서",
          "급여명세서·통장 입금 내역",
          "출퇴근 기록",
          "퇴직한 날을 보여 주는 자료",
        ],
        cautions: ["임금·퇴직금도 청구할 수 있는 기간이 정해져 있으니 미루지 마세요."],
        links: [OFFICIAL.moel],
        question: "체불 임금·퇴직금 문제에서 어떤 자료를 모아 두면 좋을까요?",
      },
      {
        key: "complaint",
        label: "고용노동부 진정",
        difficulty: "self",
        prepare: [
          "진정서 (고용노동부 온라인 민원으로도 낼 수 있음)",
          "사업장 이름·주소",
          "받지 못한 임금·퇴직금 자료",
        ],
        cautions: [
          "사업장을 관할하는 지방고용노동관서에서 처리해요.",
          "근로감독관이 사실을 조사하고 사업주에게 지급을 지도해요.",
        ],
        links: [OFFICIAL.moelComplaint],
        shortcut: OFFICIAL.moelComplaint,
        document: "wage-petition",
        question: "고용노동부에 임금체불 진정은 어떻게 내나요?",
      },
      {
        key: "investigation",
        label: "조사·출석",
        difficulty: "depends",
        prepare: ["출석 요구 일정 확인", "추가 자료 (근무 기록 등)"],
        cautions: ["사업주와 함께 조사를 받을 수 있어요. 할 말을 미리 정리해 가세요."],
        links: [OFFICIAL.moel],
        question: "노동청 조사에 출석하면 무엇을 준비해야 하나요?",
      },
      {
        key: "certificate",
        label: "체불임금등·사업주 확인서",
        difficulty: "self",
        prepare: ["체불임금등·사업주 확인서 신청"],
        cautions: [
          "체불 사실이 확인되면 이 확인서를 받을 수 있어요. 대지급금 신청이나 법률구조공단 소송 지원에 쓰여요.",
        ],
        links: [OFFICIAL.moel],
        question: "체불임금등·사업주 확인서는 어디에 쓰고 어떻게 받나요?",
      },
      {
        key: "recovery",
        label: "대지급금 또는 민사 절차",
        difficulty: "depends",
        prepare: ["체불임금등·사업주 확인서", "지급명령 신청서 또는 소장"],
        cautions: [
          "대지급금은 요건을 갖춘 경우에 근로복지공단이 대신 지급하는 제도예요. 요건은 공식 안내에서 확인하세요.",
          "사업주가 끝까지 지급하지 않으면 지급명령·소송을 검토해요. 법률구조공단 무료 소송 지원 대상인지도 확인해 보세요.",
        ],
        links: [OFFICIAL.comwel, OFFICIAL.klac],
        document: "wage-advance",
        question: "대지급금 요건과 민사 절차 중 무엇을 먼저 알아봐야 하나요?",
      },
      ENFORCE,
    ],
  },

  dismissal: {
    key: "dismissal",
    section: "노동",
    title: "부당해고",
    recommended: "remedy",
    reason:
      "해고가 부당한지 다투는 상황으로 보여서, 노동위원회 구제신청부터 안내해요. 신청할 수 있는 기간이 정해져 있어 서둘러 확인하는 게 좋아요.",
    steps: [
      {
        key: "evidence",
        label: "해고 자료 정리",
        difficulty: "self",
        prepare: ["해고 통지서 (서면인지 확인)", "근로계약서", "해고 사유와 관련된 기록·대화"],
        cautions: [
          "해고 사유와 시기는 서면으로 알려야 한다는 규정이 있어요. 사업장 규모에 따라 적용이 다를 수 있어요.",
          "말로만 통보받았다면 그 사실과 날짜를 기록해 두세요.",
        ],
        links: [OFFICIAL.moel],
        question: "부당해고를 다투려면 어떤 자료를 모아 두면 좋을까요?",
      },
      {
        key: "remedy",
        label: "노동위원회 구제신청",
        difficulty: "depends",
        prepare: ["구제신청서", "해고 통지서·근로계약서 사본"],
        cautions: [
          "신청할 수 있는 기간이 정해져 있어 지나면 신청할 수 없어요. 해고된 날을 기준으로 공식 안내에서 서둘러 확인하세요.",
          "상시 근로자 수가 적은 사업장은 구제신청 대상이 아닐 수 있어요.",
        ],
        links: [OFFICIAL.nlrc],
        shortcut: OFFICIAL.nlrc,
        document: "dismissal-remedy",
        question: "부당해고 구제신청은 어디에 어떻게 내나요?",
      },
      {
        key: "hearing",
        label: "조사·심문회의",
        difficulty: "depends",
        prepare: ["이유서와 증거 자료", "심문회의 출석 준비"],
        cautions: ["진행 중에 화해를 권고받을 수 있어요. 조건을 충분히 살펴보고 결정하세요."],
        links: [OFFICIAL.nlrc],
        question: "노동위원회 심문회의에서는 무엇을 하나요?",
      },
      {
        key: "decision",
        label: "판정",
        difficulty: "depends",
        prepare: ["판정서 확인"],
        cautions: ["판정서를 받으면 내용과 다음 절차의 기간을 바로 확인하세요."],
        links: [OFFICIAL.nlrc],
        question: "노동위원회 판정이 나오면 무엇을 확인해야 하나요?",
      },
      {
        key: "review",
        label: "재심 (중앙노동위원회)",
        difficulty: "expert",
        prepare: ["재심 신청서", "초심 판정서"],
        cautions: ["판정에 불복하려면 정해진 기간 안에 중앙노동위원회에 재심을 신청해야 해요."],
        links: [OFFICIAL.nlrc],
        document: "dismissal-review",
        question: "중앙노동위원회 재심은 어떻게 신청하나요?",
      },
      {
        key: "admin_suit",
        label: "행정소송",
        difficulty: "expert",
        prepare: ["재심 판정서", "소장"],
        cautions: [
          "재심 판정에 불복하면 정해진 기간 안에 법원에 소송을 내야 해요. 전문가 상담을 권해요.",
        ],
        links: [OFFICIAL.ecfs, OFFICIAL.klac],
        question: "재심 판정에 불복하면 행정소송은 어떻게 하나요?",
      },
    ],
  },

  fraud: {
    key: "fraud",
    section: "사기",
    title: "거래 사기 피해",
    recommended: "report",
    reason:
      "돈을 보냈는데 물건을 받지 못하고 연락이 끊긴 상황으로 보여서, 고소·신고부터 안내해요. 증거는 지워지기 전에 바로 저장해 두세요.",
    note: "형사 절차는 처벌 여부를 정하는 절차라, 피해금을 돌려받으려면 배상명령이나 민사 청구를 따로 해야 할 수 있어요.",
    steps: [
      {
        key: "evidence",
        label: "증거 정리",
        difficulty: "self",
        prepare: ["거래 글 캡처", "판매자와 나눈 대화", "이체 내역", "판매자 계좌·연락처·닉네임"],
        cautions: ["판매자가 글이나 계정을 지우기 전에 바로 저장하세요."],
        links: [OFFICIAL.cyberPolice],
        question: "거래 사기 피해에서 어떤 증거를 모아 두면 좋을까요?",
      },
      {
        key: "report",
        label: "고소·신고",
        difficulty: "self",
        prepare: ["고소장 또는 신고 내용 (사실을 시간 순서대로)", "모아 둔 증거"],
        cautions: [
          "온라인 거래 사기는 사이버범죄 신고시스템으로도 신고할 수 있어요.",
          "사실과 다른 내용을 적지 않도록 확인한 사실만 적으세요.",
        ],
        links: [OFFICIAL.cyberPolice, OFFICIAL.police],
        shortcut: OFFICIAL.cyberPolice,
        document: "criminal-complaint",
        question: "중고거래 사기는 어디에 어떻게 고소·신고하나요?",
      },
      {
        key: "investigation",
        label: "수사",
        difficulty: "depends",
        prepare: ["출석 요구 일정 확인", "추가 자료 제출"],
        cautions: ["수사 결과와 별개로 피해금 반환은 따로 청구해야 할 수 있어요."],
        links: [OFFICIAL.police],
        question: "고소한 뒤 수사 단계에서는 무엇을 하게 되나요?",
      },
      {
        key: "trial",
        label: "기소·형사재판",
        difficulty: "depends",
        prepare: ["검찰 처분 결과 통지 확인"],
        cautions: ["형사재판은 처벌 여부를 정하는 절차라 피해금이 자동으로 돌아오지는 않아요."],
        links: [OFFICIAL.klac],
        question: "형사재판이 열리면 피해자는 무엇을 할 수 있나요?",
      },
      {
        key: "compensation_order",
        label: "배상명령 신청",
        difficulty: "depends",
        prepare: ["배상명령 신청서", "피해 금액을 보여 주는 자료"],
        cautions: [
          "형사재판에서 피해 금액을 배상하라는 명령을 함께 내려 달라고 신청하는 제도예요. 재판의 변론이 끝나기 전에 신청해야 해요.",
          "정식 재판이 열리지 않고 약식명령으로 끝나면 배상명령을 신청할 수 없을 수 있어요. 그때는 민사 청구를 검토하세요.",
        ],
        links: [OFFICIAL.ecfs, OFFICIAL.klac],
        document: "compensation-order",
        question: "배상명령은 언제, 어떻게 신청하나요?",
      },
      {
        key: "civil",
        label: "민사 청구·강제집행",
        difficulty: "expert",
        prepare: ["지급명령 신청서 또는 소장", "판결 뒤 상대방 재산 정보"],
        cautions: [
          "배상명령을 받지 못했거나 일부만 받았다면 지급명령·소송으로 따로 청구할 수 있어요.",
          "절차가 복잡해 전문가 상담을 권해요.",
        ],
        links: [OFFICIAL.ecfs, OFFICIAL.klac],
        question: "사기 피해금을 민사로 청구하려면 어떻게 하나요?",
      },
    ],
  },

  traffic: {
    key: "traffic",
    section: "교통사고",
    title: "교통사고 손해배상",
    recommended: "records",
    reason:
      "사고 뒤 보험사와 과실·손해를 다투는 상황으로 보여서, 사고와 치료 기록을 정리하는 단계부터 안내해요.",
    steps: [
      {
        key: "records",
        label: "사고·진료 기록 정리",
        difficulty: "self",
        prepare: [
          "교통사고 사실 확인원 (경찰)",
          "진단서·진료 기록",
          "사고 현장 사진·블랙박스 영상",
          "목격자 연락처",
        ],
        cautions: ["블랙박스 영상은 지워지기 전에 따로 저장하세요."],
        links: [OFFICIAL.police],
        question: "교통사고 뒤에 어떤 기록을 모아 두어야 하나요?",
      },
      {
        key: "insurance",
        label: "보험 접수·치료",
        difficulty: "self",
        prepare: ["상대 차량 보험사의 사고 접수 번호", "치료 영수증"],
        cautions: [
          "보험사가 제시하는 과실 비율은 보험사의 의견이에요. 근거를 요청하고 기록해 두세요.",
        ],
        links: [OFFICIAL.fss],
        question: "보험사 사고 접수와 치료는 어떻게 진행하나요?",
      },
      {
        key: "settlement",
        label: "보험사와 합의 협의",
        difficulty: "depends",
        prepare: ["치료비·휴업 손해 등 손해 자료", "보험사 제시안"],
        cautions: [
          "합의서에 서명하면 이후 추가로 청구하기 어려울 수 있어요. 내용을 꼼꼼히 확인하세요.",
        ],
        links: [OFFICIAL.fss],
        question: "보험사와 합의하기 전에 무엇을 확인해야 하나요?",
      },
      {
        key: "mediation",
        label: "분쟁조정 신청",
        difficulty: "depends",
        prepare: ["분쟁조정 신청서", "보험사와 주고받은 자료"],
        cautions: [
          "과실 비율 다툼은 보험사를 통해 과실비율분쟁 심의를 요청하는 방법도 있어요.",
          "조정이 성립하지 않으면 소송을 검토해요.",
        ],
        links: [OFFICIAL.fss],
        document: "financial-mediation",
        question: "보험 분쟁조정은 어떻게 신청하나요?",
      },
      suit({
        label: "손해배상 소송",
        difficulty: "expert",
        prepare: ["소장 (청구취지·청구원인)", "사고·진료 기록", "손해 자료"],
        cautions: [
          "과실 비율과 손해액을 다투는 소송은 전문적인 판단이 필요해 전문가 상담을 권해요.",
        ],
        question: "교통사고 손해배상 소송은 어떻게 진행하나요?",
      }),
      JUDGMENT,
    ],
  },

  neighbor: {
    key: "neighbor",
    section: "이웃 분쟁",
    title: "이웃 간 피해",
    recommended: "talk",
    reason:
      "이웃 사이의 피해 문제로 보여서, 기록을 남기면서 직접 요청하거나 관리사무소·지자체 창구에 알리는 단계부터 안내해요.",
    steps: [
      {
        key: "records",
        label: "피해 기록 정리",
        difficulty: "self",
        prepare: [
          "피해 사진·영상 (날짜가 보이게)",
          "수리·교체 비용 영수증",
          "피해가 반복된 날짜 메모",
        ],
        cautions: ["피해 상황은 그때그때 기록해 두는 것이 좋아요."],
        links: [OFFICIAL.klac],
        question: "이웃 때문에 생긴 피해는 어떻게 기록해 두면 좋을까요?",
      },
      {
        key: "talk",
        label: "대화·요청",
        difficulty: "self",
        prepare: ["요청할 내용", "공동주택이면 관리사무소 연락처"],
        cautions: [
          "감정이 격해지지 않게 요청하고, 요청한 날짜와 내용을 기록해 두세요.",
          "지자체 민원 창구나 관리사무소를 통해 알리는 방법도 있어요.",
        ],
        links: [OFFICIAL.epeople],
        question: "이웃에게 피해를 알리고 요청할 때 어떻게 하면 좋을까요?",
      },
      notice({
        prepare: [
          "상대방 주소",
          "피해 내용과 요청 사항",
          "언제까지 해 달라는 기한",
          "보내는 사람 이름·주소",
        ],
        question: "이웃에게 보낼 내용증명에는 무엇을 적어야 하나요?",
      }),
      {
        key: "mediation",
        label: "분쟁조정·상담",
        difficulty: "depends",
        prepare: ["피해 기록", "주고받은 요청·내용증명"],
        cautions: [
          "층간소음이라면 한국환경공단 층간소음 이웃사이센터나 공동주택 층간소음관리위원회 같은 창구가 있어요.",
          "그 밖의 이웃 분쟁은 지역에 따라 지자체 조정 창구가 있을 수 있어요. 법률 상담은 대한법률구조공단에서 받을 수 있어요.",
        ],
        links: [OFFICIAL.klac, OFFICIAL.epeople],
        document: "civil-mediation",
        question: "이웃 분쟁은 어디에서 조정이나 상담을 받을 수 있나요?",
      },
      suit({
        label: "손해배상 소송",
        prepare: ["소장 (청구취지·청구원인)", "피해 기록과 비용 영수증"],
        question: "이웃에게 피해 배상을 소송으로 청구하려면 어떻게 하나요?",
      }),
      JUDGMENT,
    ],
  },

  money: {
    key: "money",
    section: "민사",
    title: "돈을 돌려받는 절차",
    recommended: "notice",
    reason:
      "상대방에게 돈을 돌려 달라고 요구하는 상황으로 보여서, 요구 내용을 문서로 남기는 단계부터 안내해요. 증거 정리는 함께 해 두면 좋아요.",
    steps: [EVIDENCE_MONEY, notice(), ORDER, suit(), JUDGMENT, ENFORCE],
  },
};

/** 모든 타임라인의 모든 단계 (검사용) */
export const ALL_STEPS: ProcedureStep[] = Object.values(TRACKS).flatMap((t) => t.steps);

export const PROCEDURE_NOTICE = "일반적인 절차 안내";
