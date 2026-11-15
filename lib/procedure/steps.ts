// 민사 절차 단계 상수 (F-014 데모 축소판, DEC-021). 법률 검토 전이라 화면에 "참고용"을 함께 표시한다.
// 기간·비용 숫자는 넣지 않는다 (절대 규칙 3) — 공식 기준 출처를 정하는 일은 OQ-DM-09.
// 결과를 판정하지 않고 단계별 난이도 라벨만 단다 (DEC-002). 문구에 숫자·단정 표현이 없는지 policy.test.ts가 검사한다.

/** API.md GET /procedures의 difficulty와 같은 값 */
export type Difficulty = "self" | "depends" | "expert";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  self: "혼자 가능",
  depends: "상황에 따라",
  expert: "전문가 권장",
};

export type StepKey =
  "evidence" | "notice" | "lease_registration" | "order" | "suit" | "judgment" | "enforce";

/** 문서 작성 화면 (/documents/[kind]). legal_documents 게이트 뒤 (DEC-022) */
export type DocumentKind = "demand-letter" | "complaint";

export type OfficialLink = { label: string; url: string };

export type ProcedureStep = {
  key: StepKey;
  label: string;
  difficulty: Difficulty;
  /** 준비할 것 */
  prepare: string[];
  /** 주의할 점 */
  cautions: string[];
  /** 공식 안내 */
  links: OfficialLink[];
  /** 이 단계의 문서 작성 화면 (게이트 뒤) */
  document?: DocumentKind;
  /** "이 단계 질문하기"가 이어 묻기 입력란에 넣는 문장 */
  question: string;
};

export const OFFICIAL = {
  epost: { label: "인터넷우체국 (내용증명)", url: "https://www.epost.go.kr" },
  ecfs: { label: "대한민국 법원 전자소송", url: "https://ecfs.scourt.go.kr" },
  proSe: { label: "법원 나홀로소송", url: "https://pro-se.scourt.go.kr" },
  klac: { label: "대한법률구조공단", url: "https://www.klac.or.kr" },
  moel: { label: "고용노동부", url: "https://www.moel.go.kr" },
  nlrc: { label: "중앙노동위원회", url: "https://www.nlrc.go.kr" },
  police: { label: "경찰청", url: "https://www.police.go.kr" },
  cyberPolice: {
    label: "경찰청 사이버범죄 신고시스템 (온라인 범죄)",
    url: "https://ecrm.police.go.kr",
  },
} satisfies Record<string, OfficialLink>;

const STEPS: Record<StepKey, ProcedureStep> = {
  evidence: {
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
    links: [OFFICIAL.proSe],
    question: "제 상황에서 어떤 자료를 증거로 모아 두면 좋을까요?",
  },
  notice: {
    key: "notice",
    label: "내용증명",
    difficulty: "self",
    prepare: [
      "상대방 주소",
      "요구하는 내용과 금액",
      "언제까지 해 달라는 기한",
      "보내는 사람 이름·주소",
    ],
    cautions: [
      "내용증명은 어떤 내용을 보냈는지를 우체국이 증명해 주는 것이고, 그 자체로 돈을 받게 하는 강제력은 없어요.",
      "감정적인 표현이나 위협으로 읽힐 수 있는 문장은 피하세요.",
      "청구할 수 있는 기간(소멸시효)이 얼마 남지 않았다면 내용증명만으로는 시효가 멈추지 않을 수 있어요. 법원 절차를 함께 검토하세요.",
    ],
    links: [OFFICIAL.epost],
    document: "demand-letter",
    question: "내용증명을 보내려면 무엇을 준비하고 어떤 내용을 적어야 하나요?",
  },
  lease_registration: {
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
    question: "임차권등기명령은 언제, 어떻게 신청하나요?",
  },
  order: {
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
    links: [OFFICIAL.ecfs, OFFICIAL.proSe],
    question: "지급명령은 어떻게 신청하고, 상대방이 이의를 내면 어떻게 되나요?",
  },
  suit: {
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
    links: [OFFICIAL.proSe, OFFICIAL.klac],
    document: "complaint",
    question: "소송을 하면 소장에는 무엇을 적고 어떤 절차를 거치나요?",
  },
  judgment: {
    key: "judgment",
    label: "판결",
    difficulty: "depends",
    prepare: ["판결문 확인", "판결이 확정됐는지 확인"],
    cautions: [
      "판결에 불복하려면 정해진 기간 안에 항소해야 해요. 기간은 판결문을 받은 날부터 시작되니 법원 안내(나홀로소송)에서 바로 확인하세요.",
    ],
    links: [OFFICIAL.proSe, OFFICIAL.ecfs],
    question: "판결이 나온 뒤에는 무엇을 확인하고 준비해야 하나요?",
  },
  enforce: {
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
    question: "판결을 받았는데도 돈을 주지 않으면 강제집행은 어떻게 하나요?",
  },
};

/** 돈을 돌려받는 민사 절차 (Figma D+ 절차 타임라인 순서) */
export const MONEY_STEPS: StepKey[] = [
  "evidence",
  "notice",
  "order",
  "suit",
  "judgment",
  "enforce",
];

/** 주택 임대차 보증금 — 내용증명 뒤에 임차권등기명령을 넣는다 */
export const LEASE_DEPOSIT_STEPS: StepKey[] = [
  "evidence",
  "notice",
  "lease_registration",
  "order",
  "suit",
  "judgment",
  "enforce",
];

export function stepsOf(keys: StepKey[]): ProcedureStep[] {
  return keys.map((k) => STEPS[k]);
}

export const ALL_STEPS: ProcedureStep[] = Object.values(STEPS);

export const PROCEDURE_NOTICE = "참고용 · 법률 검토 전";
