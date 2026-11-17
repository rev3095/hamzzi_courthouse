// 분쟁조정·집행 서식 (DEC-025 4차): 주택임대차분쟁조정 신청서·민사 조정신청서·금융분쟁조정 신청서·재산명시신청서.
// 주택임대차분쟁조정: 대한법률구조공단 주택임대차분쟁조정위원회 별지 제8호서식, 「주택임대차보호법 시행령」 제30조.
// 민사 조정: 법원 전자민원센터 양식모음 [민사] 조정신청서(A1924), 민사조정법.
// 금융분쟁조정: 「금융분쟁조정세칙」 제11조(조정신청서 기재사항). 재산명시: 「민사집행규칙」 제25조(신청서 기재사항).
// 조정·명령 결과를 예측하지 않는다(절대 규칙 2). 숫자는 사용자가 적은 값만 쓴다(절대 규칙 3).
import { OFFICIAL } from "@/lib/procedure/steps";
import {
  address,
  BIRTH_NOTICE,
  COURT_SOURCE,
  court,
  LONG,
  name,
  phone,
  RRN_NOTICE,
  SCOURT_FORMS,
  writtenOn,
  type DocumentSpec,
  type Field,
} from "../fields";

const HLDCC_FORMS = "https://www.hldcc.or.kr/hp/li/arrFormatDetail.do";

const textarea = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type: "textarea",
  max: LONG,
  ...extra,
});
const money = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type: "money",
  max: 20,
  ...extra,
});

export const MEDIATION_SPECS = {
  "lease-mediation": {
    kind: "lease-mediation",
    title: "주택임대차분쟁조정 신청서",
    stepLabel: "분쟁조정 신청",
    intro:
      "집주인과의 임대차 분쟁을 소송 전에 주택임대차분쟁조정위원회에서 조정해 달라고 신청하는 문서예요.",
    tips: [
      "조정은 양쪽이 조정안을 받아들여야 성립해요. 상대방이 응하지 않으면 소송을 검토해요.",
      "임대차계약서 사본, 건물 등기사항전부증명서, 주고받은 문자·내용증명을 함께 준비해요.",
      "수수료와 면제 대상은 서식의 안내와 위원회 안내에서 확인하세요.",
      "온라인 신청이나 예약 후 방문으로도 신청할 수 있어요.",
    ],
    links: [OFFICIAL.leaseMediation],
    officialForms: [
      {
        name: "주택임대차분쟁조정신청서 (별지 제8호서식)",
        source: "대한법률구조공단 주택·상가건물 임대차분쟁조정위원회",
        url: HLDCC_FORMS,
      },
    ],
    basis: ["주택임대차보호법 제21조", "같은 법 시행령 제30조(조정의 신청)"],
    draftFields: "신청의 이유",
    fields: [
      name("applicantName", "신청인 이름"),
      address("applicantAddress", "신청인 주소"),
      phone("applicantPhone", "신청인 휴대전화번호"),
      {
        ...address("applicantService", "송달장소 (주소와 다를 때)"),
        optional: true,
        help: "서류를 받을 곳이 주소와 다르면 적어요.",
      },
      name("respondentName", "피신청인 이름", "상대방(집주인 또는 임차인)이에요."),
      address("respondentAddress", "피신청인 주소"),
      phone("respondentPhone", "피신청인 연락처"),
      textarea("aim", "신청의 취지", {
        max: 1000,
        help: "위원회에 구하는 결론을 적어요.",
        example: "피신청인은 신청인에게 임대차보증금 ○○○원을 반환한다.",
      }),
      money("aimAmount", "신청금액", { optional: true, help: "돈을 구하는 조정이면 적어요." }),
      {
        key: "aimBasis",
        label: "신청금액 산정근거",
        type: "text",
        max: 200,
        optional: true,
        example: "임대차보증금 중 돌려받지 못한 금액",
      },
      textarea("reason", "신청의 이유 (분쟁의 내용)", {
        help: "계약 내용과 분쟁이 생긴 경위를 시간 순서대로 사실만 적어요.",
      }),
      textarea("evidence", "증거서류 또는 증거물", {
        max: 1000,
        optional: true,
        help: "한 줄에 하나씩 적어요.",
        example: "임대차계약서 사본\n문자 내역",
      }),
      {
        key: "branch",
        label: "제출할 지부 (조정위원회)",
        type: "text",
        max: 50,
        example: "○○지부",
      },
      writtenOn,
    ],
    pages: [
      {
        title: "신청인 (나)",
        help: BIRTH_NOTICE,
        fields: ["applicantName", "applicantAddress", "applicantPhone"],
      },
      { title: "송달장소", fields: ["applicantService"] },
      { title: "피신청인", fields: ["respondentName", "respondentAddress", "respondentPhone"] },
      { title: "신청의 취지", fields: ["aim"] },
      { title: "신청금액", fields: ["aimAmount", "aimBasis"] },
      { title: "신청의 이유", fields: ["reason"] },
      { title: "증거서류", fields: ["evidence"] },
      { title: "제출처·신청일", fields: ["branch", "writtenOn"] },
    ],
  },

  "civil-mediation": {
    kind: "civil-mediation",
    title: "민사 조정신청서",
    stepLabel: "분쟁조정·상담",
    intro:
      "법원에 소송 대신 조정(서로 양보해 합의하는 절차)을 신청하는 문서예요. 조정이 성립하면 판결과 같은 효력이 있어요.",
    tips: [
      "상대방 주소지 등을 맡는 법원에 내요. 관할은 법원 안내(나홀로소송)에서 확인하세요.",
      "조정비용·송달료는 법원 서식의 안내 기준으로 내요.",
      "조정이 성립하지 않으면 소송으로 넘어갈 수 있어요.",
      "피해 사진·영수증 같은 자료를 입증방법으로 정리해요.",
    ],
    links: [OFFICIAL.proSe, OFFICIAL.klac],
    officialForms: [{ name: "[민사] 조정신청서 (A1924)", source: COURT_SOURCE, url: SCOURT_FORMS }],
    basis: ["민사조정법 제2조·제5조(조정의 신청)"],
    draftFields: "신청원인",
    fields: [
      {
        key: "caseName",
        label: "사건명",
        type: "text",
        max: 100,
        example: "손해배상(기) 조정신청",
      },
      name("applicantName", "신청인 이름"),
      address("applicantAddress", "신청인 주소"),
      phone("applicantPhone", "신청인 연락처"),
      name("respondentName", "피신청인 이름"),
      address("respondentAddress", "피신청인 주소"),
      phone("respondentPhone", "피신청인 연락처"),
      money("claimAmount", "구하는 금액", {
        optional: true,
        help: "돈을 구하면 적어요. 신청취지 기본 문장에 들어가요.",
      }),
      textarea("otherAims", "그 밖에 구하는 사항", {
        max: 1000,
        optional: true,
        help: "돈 말고 구하는 것이 있으면 한 줄에 하나씩 적어요.",
        example: "피신청인은 밤 시간에 소음을 내지 않는다.",
      }),
      textarea("cause", "신청원인", {
        help: "분쟁이 생긴 경위를 시간 순서대로 사실만 적어요.",
      }),
      textarea("evidence", "입증방법", {
        max: 1000,
        optional: true,
        help: "한 줄에 하나씩 적어요.",
        example: "피해 사진\n수리비 영수증",
      }),
      {
        key: "attachments",
        label: "첨부서류",
        type: "checks",
        max: 100,
        optional: true,
        defaultValue: "proof,copy,fee",
        options: [
          { value: "proof", label: "입증방법" },
          { value: "copy", label: "신청서부본" },
          { value: "fee", label: "송달료납부서" },
        ],
      },
      court("상대방 주소지 등을 맡는 법원에 내요. 법원 안내에서 확인하세요."),
      writtenOn,
    ],
    pages: [
      { title: "사건명", fields: ["caseName"] },
      {
        title: "신청인 (나)",
        help: RRN_NOTICE,
        fields: ["applicantName", "applicantAddress", "applicantPhone"],
      },
      { title: "피신청인", fields: ["respondentName", "respondentAddress", "respondentPhone"] },
      { title: "신청취지", help: "둘 중 하나 이상 적어요.", fields: ["claimAmount", "otherAims"] },
      { title: "신청원인", fields: ["cause"] },
      { title: "입증방법·첨부서류", fields: ["evidence", "attachments"] },
      { title: "법원·작성일", fields: ["court", "writtenOn"] },
    ],
  },

  "financial-mediation": {
    kind: "financial-mediation",
    title: "금융분쟁조정 신청서",
    stepLabel: "분쟁조정 신청",
    intro:
      "보험사 등 금융회사와의 분쟁(예: 보험금 지급)을 금융감독원에 조정해 달라고 신청하는 문서예요.",
    tips: [
      "금융감독원 누리집이나 금융소비자 포털에서 온라인으로도 신청할 수 있어요.",
      "보험사와 주고받은 문서, 진단서·영수증 같은 자료를 함께 내요.",
      "조정 중에 소송을 내면 조정 처리가 멈출 수 있어요. 금융감독원 안내를 확인하세요.",
    ],
    links: [OFFICIAL.fss],
    officialForms: [
      {
        name: "분쟁조정신청서 (금융분쟁조정세칙)",
        source: "법제처 국가법령정보센터 (금융감독원 세칙)",
        url: "https://www.law.go.kr/행정규칙/금융분쟁조정세칙",
      },
    ],
    basis: ["금융분쟁조정세칙 제11조(분쟁조정신청)"],
    draftFields: "신청의 이유",
    fields: [
      name("applicantName", "신청인 이름"),
      address("applicantAddress", "신청인 주소"),
      phone("applicantPhone", "신청인 연락처"),
      {
        key: "company",
        label: "상대방 금융회사 이름",
        type: "text",
        max: 100,
        example: "○○화재해상보험",
      },
      {
        ...address("companyAddress", "상대방 주된 사무소 주소"),
        optional: true,
        help: "알면 적어요.",
      },
      textarea("aim", "신청의 취지", {
        max: 1000,
        help: "금융감독원에 구하는 결론을 적어요.",
        example: "피신청인은 신청인에게 보험금을 지급한다.",
      }),
      textarea("reason", "신청의 이유", {
        help: "가입·사고·청구·거절이 언제 어떻게 있었는지 사실만 적어요.",
      }),
      textarea("evidence", "첨부서류 (증거서류)", {
        max: 1000,
        optional: true,
        help: "조정신청의 원인과 사실을 증명하는 서류를 한 줄에 하나씩 적어요.",
        example: "보험증권 사본\n보험금 지급 거절 통지서",
      }),
      writtenOn,
    ],
    pages: [
      { title: "신청인 (나)", fields: ["applicantName", "applicantAddress", "applicantPhone"] },
      { title: "상대방 금융회사", fields: ["company", "companyAddress"] },
      { title: "신청의 취지", fields: ["aim"] },
      { title: "신청의 이유", fields: ["reason"] },
      { title: "첨부서류·신청일", fields: ["evidence", "writtenOn"] },
    ],
  },

  "property-disclosure": {
    kind: "property-disclosure",
    title: "재산명시신청서",
    stepLabel: "강제집행",
    intro:
      "판결 등을 받았는데도 상대방이 돈을 주지 않을 때, 상대방이 재산 목록을 내도록 법원에 명령을 구하는 문서예요.",
    tips: [
      "집행력 있는 판결정본 등(집행권원)과 송달증명이 필요해요. 법원 안내를 확인하세요.",
      "채무자 주소지를 맡는 법원에 내요.",
      "인지대·송달료는 법원 안내 기준으로 내요.",
      "절차가 복잡해 전문가 상담을 권해요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
    officialForms: [{ name: "[신청] 재산명시신청", source: COURT_SOURCE, url: SCOURT_FORMS }],
    basis: ["민사집행법 제61조(재산명시신청)", "민사집행규칙 제25조(재산명시신청)"],
    draftFields: "",
    fields: [
      name("creditorName", "채권자 이름", "돈을 받을 사람, 곧 나예요."),
      address("creditorAddress", "채권자 주소"),
      phone("creditorPhone", "채권자 연락처"),
      name("debtorName", "채무자 이름"),
      address("debtorAddress", "채무자 주소"),
      {
        key: "title",
        label: "집행권원의 표시",
        type: "text",
        max: 200,
        help: "판결·지급명령 등 법원·사건번호·사건명을 적어요.",
        example: "○○지방법원 ○○○○가소○○○○ 대여금 사건의 집행력 있는 판결정본",
      },
      money("unpaidAmount", "채무자가 이행하지 아니하는 금전채무액", {
        help: "집행권원에서 받기로 된 돈 가운데 아직 받지 못한 금액이에요.",
      }),
      textarea("reason", "신청사유", {
        max: 1000,
        optional: true,
        help: "기본 문장 뒤에 더 적을 사정이 있으면 적어요.",
      }),
      {
        key: "attachments",
        label: "첨부서류",
        type: "checks",
        max: 100,
        optional: true,
        defaultValue: "title,service",
        options: [
          { value: "title", label: "집행력 있는 정본" },
          { value: "service", label: "송달증명원" },
        ],
      },
      court("채무자 주소지를 맡는 법원에 내요. 법원 안내에서 확인하세요."),
      writtenOn,
    ],
    pages: [
      {
        title: "채권자 (나)",
        help: RRN_NOTICE,
        fields: ["creditorName", "creditorAddress", "creditorPhone"],
      },
      { title: "채무자", fields: ["debtorName", "debtorAddress"] },
      { title: "집행권원·금액", fields: ["title", "unpaidAmount"] },
      { title: "신청사유", fields: ["reason"] },
      { title: "첨부서류", fields: ["attachments"] },
      { title: "법원·작성일", fields: ["court", "writtenOn"] },
    ],
  },
} satisfies Record<
  "lease-mediation" | "civil-mediation" | "financial-mediation" | "property-disclosure",
  DocumentSpec
>;

