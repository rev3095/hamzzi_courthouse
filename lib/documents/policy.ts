// 문서 작성 서식 정의·검증 (DEC-022·025, OQ-003 대기). legal_documents 게이트가 승인되기 전에는 API가 FEATURE_GATED이고
// 화면은 관리자 미리보기(DEC-024 관리자 모드)에서만 열린다.
// 항목 구성은 공식 기관 서식과 법령을 따른다 — 법원 전자민원센터 양식모음(주택임차권등기명령신청서·지급명령신청서(일반)·소장),
// 「임차권등기명령 절차에 관한 규칙」 제2조·제3조, 「민사소송법」 제249조·제468조, 「우편법 시행규칙」 제46조·제48조·제51조.
// 공식 서식 파일은 재배포하지 않고 항목 구조만 따른 자체 양식이며, 화면에 공식 서식 링크를 함께 둔다.
// 사용자가 적은 값을 정해진 칸·기본 문장에 넣기만 한다 — LLM을 쓰지 않고, 법률 판단·주장·이자·금액을 지어내지 않는다.
// 입력에는 이름·주소가 들어가므로 저장하지 않는다 (F-007, DEC-006). 브라우저에서도 쓰므로 server-only를 넣지 않는다.
import { ApiError } from "@/lib/api/errors";
import type { DocumentKind } from "@/lib/procedure/steps";
import { OFFICIAL } from "@/lib/procedure/steps";
import {
  address,
  COURT_SOURCE,
  court,
  interestFields,
  LONG,
  name,
  phone,
  RRN_NOTICE,
  SCOURT_FORMS,
  writtenOn,
  type DocumentSpec,
  type Field,
} from "./fields";
import { fillBlocks, type Block } from "./fill";
import { CRIMINAL_SPECS } from "./specs/criminal";
import { LABOR_SPECS } from "./specs/labor";
import { MEDIATION_SPECS } from "./specs/mediation";

export {
  CHECK_NOTICE,
  DOCUMENT_NOTICE,
  DRAFT_NOTICE,
  RRN_NOTICE,
  type DocumentSpec,
  type Field,
  type FieldOption,
  type FieldType,
  type FormPage,
  type OfficialForm,
} from "./fields";

export const DOCUMENT_KINDS = [
  "demand-letter",
  "lease-registration",
  "payment-order",
  "complaint",
  "criminal-complaint",
  "compensation-order",
  "wage-petition",
  "wage-advance",
  "dismissal-remedy",
  "dismissal-review",
  "lease-mediation",
  "civil-mediation",
  "financial-mediation",
  "property-disclosure",
] as const satisfies readonly DocumentKind[];

export const isDocumentKind = (v: string): v is DocumentKind =>
  (DOCUMENT_KINDS as readonly string[]).includes(v);

export const DOCUMENT_SPECS: Record<DocumentKind, DocumentSpec> = {
  ...CRIMINAL_SPECS,
  ...LABOR_SPECS,
  ...MEDIATION_SPECS,
  "demand-letter": {
    kind: "demand-letter",
    title: "내용증명",
    stepLabel: "내용증명",
    intro:
      "상대방에게 요구하는 내용을 문서로 보내고, 어떤 내용을 보냈는지 우체국이 증명해 주는 우편이에요.",
    tips: [
      "보내는 사람·받는 사람의 이름과 주소는 문서와 봉투에 똑같이 적어야 해요.",
      "원본 한 통과 같은 내용의 등본 두 통을 준비해요. 인터넷우체국에서는 파일로 보낼 수 있어요.",
      "언제, 무슨 일이 있었는지 사실만 순서대로 적어요.",
      "요구하는 내용(돌려받을 금액 등)과 답변·이행 기한을 분명히 적어요.",
      "감정적인 표현이나 위협으로 읽힐 수 있는 문장은 빼요.",
      "청구할 수 있는 기간(소멸시효)이 얼마 남지 않았다면 내용증명만으로는 시효가 멈추지 않을 수 있어요. 법원 절차를 함께 검토하세요.",
    ],
    links: [OFFICIAL.epost, OFFICIAL.klac],
    officialForms: [
      {
        name: "내용증명 신청 (인터넷우체국 작성 화면)",
        source: "우정사업본부 인터넷우체국",
        url: "https://www.epost.go.kr",
      },
    ],
    basis: ["우편법 시행규칙 제46조(내용증명)", "제48조(원본·등본 제출)", "제51조(성명·주소 일치)"],
    draftFields: "제목·있었던 일",
    fields: [
      {
        key: "subject",
        label: "제목",
        type: "text",
        max: 100,
        help: "무엇을 요구하는 문서인지 한눈에 보이게 적어요.",
        example: "임대차보증금 반환 요청",
      },
      name("senderName", "보내는 사람 이름"),
      address("senderAddress", "보내는 사람 주소"),
      name("recipientName", "받는 사람 이름"),
      address("recipientAddress", "받는 사람 주소"),
      {
        key: "facts",
        label: "있었던 일 (사실관계)",
        type: "textarea",
        max: LONG,
        help: "언제, 누구와, 무슨 일이 있었는지 시간 순서대로 사실만 적어요.",
        example: "○○년 ○월 ○일 귀하와 임대차계약을 맺고 보증금을 보냈습니다.",
      },
      {
        key: "demand",
        label: "요구하는 내용",
        type: "textarea",
        max: LONG,
        help: "상대방에게 무엇을 해 달라는지 구체적으로 적어요.",
        example: "보증금 ○○○원을 아래 계좌로 돌려주시기 바랍니다.",
      },
      {
        key: "deadline",
        label: "답변·이행 기한",
        type: "text",
        max: 50,
        help: "문서에는 '○○까지 답변 또는 이행을 요청합니다'로 들어가요.",
        example: "이 글을 받으신 날부터 ○일 이내",
      },
      writtenOn,
    ],
    pages: [
      { title: "어떤 요구인가요?", fields: ["subject"] },
      {
        title: "보내는 사람",
        help: "봉투에도 똑같이 적어요.",
        fields: ["senderName", "senderAddress"],
      },
      { title: "받는 사람", fields: ["recipientName", "recipientAddress"] },
      { title: "있었던 일", fields: ["facts"] },
      { title: "요구하는 내용", fields: ["demand"] },
      { title: "기한", fields: ["deadline"] },
      { title: "작성일", fields: ["writtenOn"] },
    ],
  },

  "lease-registration": {
    kind: "lease-registration",
    title: "주택임차권등기명령 신청서",
    stepLabel: "임차권등기명령",
    intro:
      "계약이 끝났는데 보증금을 돌려받지 못했을 때, 이사하더라도 임차인의 권리를 지키도록 법원에 임차권등기를 신청하는 문서예요.",
    tips: [
      "등기사항증명서에 적힌 대로 건물 주소와 동·호수를 정확히 적어요.",
      "전입신고일(주민등록일)·이사해 살기 시작한 날·확정일자를 서류와 맞춰 적어요.",
      "건물의 일부만 빌렸다면 빌린 부분을 표시한 도면을 함께 내요.",
      "등기신청수수료·등록면허세·수입인지·송달료를 내야 해요. 금액은 법원 서식의 유의사항과 법원 안내에서 확인하세요.",
      "신청서를 냈다고 바로 등기되는 것은 아니에요. 등기사항증명서에 임차권등기가 적힌 것을 확인한 뒤 이사하는 것이 안전해요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.iros],
    officialForms: [
      { name: "[신청] 주택임차권등기명령신청서", source: COURT_SOURCE, url: SCOURT_FORMS },
      {
        name: "[신청] 주택임차권등기명령신청서(건물 중 일부)",
        source: COURT_SOURCE,
        url: SCOURT_FORMS,
      },
      {
        name: "[신청] 주택임차권등기명령신청서(구분건물)",
        source: COURT_SOURCE,
        url: SCOURT_FORMS,
      },
    ],
    basis: ["임차권등기명령 절차에 관한 규칙 제2조(기재사항)", "제3조(첨부서류)"],
    draftFields: "더 적을 사정",
    fields: [
      name("applicantName", "신청인(임차인) 이름", "집을 빌린 사람, 곧 나예요."),
      address("applicantAddress", "신청인 주소"),
      phone("applicantPhone", "신청인 연락 가능한 전화번호"),
      name(
        "landlordName",
        "피신청인(임대인) 이름",
        "집주인 이름을 등기사항증명서에 적힌 대로 적어요.",
      ),
      address("landlordAddress", "피신청인 주소"),
      {
        key: "propertyAddress",
        label: "빌린 집 주소",
        type: "textarea",
        max: 300,
        help: "등기사항증명서에 적힌 건물 주소와 동·호수를 적어요. 문서 끝 '부동산의 표시'에 들어가요.",
        example: "○○시 ○○구 ○○로 ○○, ○○아파트 ○○동 ○○호",
      },
      {
        key: "leaseScope",
        label: "빌린 범위",
        type: "text",
        max: 100,
        help: "건물 전체를 빌렸는지, 일부(층·호)를 빌렸는지 적어요.",
        example: "위 건물 전부 / ○층 중 ○호 전부",
      },
      {
        key: "contractDate",
        label: "임대차계약을 맺은 날",
        type: "date",
        max: 10,
        help: "계약서에 적힌 계약일이에요.",
      },
      {
        key: "deposit",
        label: "임차보증금",
        type: "money",
        max: 20,
        help: "계약서에 적힌 보증금 전체 금액을 숫자로 적어요.",
      },
      {
        key: "rent",
        label: "차임 (월세)",
        type: "money",
        max: 20,
        optional: true,
        help: "월세가 없으면 비워 두세요.",
      },
      {
        key: "moveInDate",
        label: "이사해 살기 시작한 날 (점유개시일)",
        type: "date",
        max: 10,
      },
      {
        key: "residentDate",
        label: "전입신고한 날 (주민등록일)",
        type: "date",
        max: 10,
        help: "주민등록 초본에서 확인할 수 있어요.",
      },
      {
        key: "fixedDate",
        label: "확정일자 받은 날",
        type: "date",
        max: 10,
        optional: true,
        help: "계약서에 찍힌 확정일자 도장의 날짜예요. 받지 않았다면 비워 두세요.",
      },
      {
        key: "endReason",
        label: "계약이 끝난 사정",
        type: "choice",
        max: 10,
        defaultValue: "expired",
        options: [
          { value: "expired", label: "계약 기간이 끝났어요" },
          { value: "notice", label: "해지를 알려 계약이 끝났어요" },
          { value: "agreed", label: "서로 합의해 계약을 끝냈어요" },
        ],
      },
      { key: "endDate", label: "계약이 끝난 날", type: "date", max: 10 },
      {
        key: "unpaid",
        label: "돌려받지 못한 보증금",
        type: "money",
        max: 20,
        help: "보증금 가운데 아직 돌려받지 못한 금액이에요.",
      },
      {
        key: "extraReason",
        label: "더 적을 사정 (신청이유)",
        type: "textarea",
        max: LONG,
        optional: true,
        help: "보증금을 돌려 달라고 언제, 어떻게 요구했는지 같은 사정을 사실만 적어요. 위에서 적은 내용은 기본 문장으로 이미 들어가요.",
        example: "○월 ○일 문자로 계약 종료와 보증금 반환을 요청했지만 답이 없었습니다.",
      },
      {
        key: "attachments",
        label: "첨부서류",
        type: "checks",
        max: 200,
        help: "함께 낼 서류를 고르세요. 목록은 법원 서식의 첨부서류를 따랐어요.",
        defaultValue: "registry,resident,contract,termination",
        options: [
          {
            value: "registry",
            label: "건물 등기사항전부증명서 (임대인이 법인이면 법인 등기사항전부증명서도)",
          },
          { value: "resident", label: "주민등록등·초본 (주소 변동 사항 포함)" },
          { value: "contract", label: "임대차계약증서 사본 (확정일자 포함)" },
          { value: "termination", label: "임대차계약 해지 통보 소명자료 (해지 통지서 등)" },
          { value: "drawing", label: "부동산 목록 및 도면 (건물 일부를 빌린 경우)" },
        ],
      },
      court("빌린 집이 있는 곳을 맡는 지방법원·지원·시군법원에 내요. 법원 안내에서 확인하세요."),
      writtenOn,
    ],
    pages: [
      {
        title: "신청인 (나)",
        help: RRN_NOTICE,
        fields: ["applicantName", "applicantAddress", "applicantPhone"],
      },
      { title: "피신청인 (집주인)", fields: ["landlordName", "landlordAddress"] },
      { title: "빌린 집", fields: ["propertyAddress", "leaseScope"] },
      { title: "계약 내용", fields: ["contractDate", "deposit", "rent"] },
      { title: "살기 시작한 날", fields: ["moveInDate", "residentDate", "fixedDate"] },
      { title: "계약이 끝난 사정", fields: ["endReason", "endDate", "unpaid"] },
      { title: "더 적을 사정", fields: ["extraReason"] },
      { title: "첨부서류", fields: ["attachments"] },
      { title: "법원·작성일", fields: ["court", "writtenOn"] },
    ],
  },

  "payment-order": {
    kind: "payment-order",
    title: "지급명령 신청서",
    stepLabel: "지급명령 신청",
    intro:
      "법원에 상대방이 돈을 지급하라는 명령을 내려 달라고 신청하는 문서예요. 상대방이 이의를 내면 소송으로 넘어가요.",
    tips: [
      "청구취지에는 받을 금액을, 청구원인에는 그 돈을 받아야 하는 사정을 사실대로 적어요.",
      "상대방 주소를 정확히 알아야 해요. 주소를 모르면 진행이 어려울 수 있어요.",
      "인지대·송달료는 법원 서식의 유의사항과 법원 안내 기준으로 내요.",
      "계약서·송금 내역 같은 자료를 첨부서류로 함께 내요.",
    ],
    links: [OFFICIAL.ecfs],
    officialForms: [
      {
        name: "[민사] 지급명령신청서(일반) [전산양식A2330]",
        source: COURT_SOURCE,
        url: SCOURT_FORMS,
      },
      {
        name: "[민사] 지급명령신청서 표준양식 이용 및 작성안내 [전산양식A2342]",
        source: COURT_SOURCE,
        url: SCOURT_FORMS,
      },
    ],
    basis: ["민사소송법 제468조(지급명령의 기재사항)"],
    draftFields: "청구원인",
    fields: [
      name("creditorName", "채권자 이름", "돈을 받을 사람, 곧 나예요."),
      address("creditorAddress", "채권자 주소"),
      phone("creditorPhone", "채권자 연락 가능한 전화번호"),
      name("debtorName", "채무자 이름", "돈을 줘야 하는 상대방이에요."),
      address("debtorAddress", "채무자 주소"),
      phone("debtorPhone", "채무자 연락 가능한 전화번호"),
      {
        key: "claimAmount",
        label: "청구 금액 (원금)",
        type: "money",
        max: 20,
        help: "받아야 할 원금을 숫자로 적어요. 청구취지 기본 문장에 들어가요.",
      },
      ...interestFields("지급명령이 송달된 다음 날부터"),
      {
        key: "feeDelivery",
        label: "송달료",
        type: "money",
        max: 20,
        optional: true,
        help: "법원 안내를 보고 낸 금액을 적어요. 비우면 빈칸으로 남겨요.",
      },
      {
        key: "feeStamp",
        label: "인지대",
        type: "money",
        max: 20,
        optional: true,
        help: "법원 안내를 보고 낸 금액을 적어요. 비우면 빈칸으로 남겨요.",
      },
      {
        key: "claimCause",
        label: "청구원인",
        type: "textarea",
        max: LONG,
        help: "돈을 받아야 하는 사정을 날짜와 함께 시간 순서대로 사실만 적어요.",
        example: "채권자는 ○○년 ○월 ○일 채무자에게 ○○○원을 빌려주었습니다.",
      },
      {
        key: "attachments",
        label: "첨부서류",
        type: "checks",
        max: 200,
        optional: true,
        help: "청구원인을 뒷받침하는 자료를 고르세요.",
        options: [
          { value: "contract", label: "계약서·차용증 사본" },
          { value: "transfer", label: "송금·계좌 이체 내역" },
          { value: "notice", label: "내용증명 사본" },
          { value: "messages", label: "문자·메신저 대화 내용" },
        ],
      },
      {
        key: "attachmentsExtra",
        label: "그 밖의 첨부서류",
        type: "text",
        max: 200,
        optional: true,
        example: "임대차계약서 사본",
      },
      court("채무자 주소지를 맡는 지방법원·지원·시군법원에 내요. 법원 안내에서 확인하세요."),
      writtenOn,
    ],
    pages: [
      {
        title: "채권자 (나)",
        help: RRN_NOTICE,
        fields: ["creditorName", "creditorAddress", "creditorPhone"],
      },
      { title: "채무자 (상대방)", fields: ["debtorName", "debtorAddress", "debtorPhone"] },
      { title: "청구 금액", fields: ["claimAmount"] },
      {
        title: "이자·지연손해금 (선택)",
        fields: ["interestRate", "interestFrom", "interestDate"],
      },
      { title: "독촉절차비용 (선택)", fields: ["feeDelivery", "feeStamp"] },
      { title: "청구원인", fields: ["claimCause"] },
      { title: "첨부서류", fields: ["attachments", "attachmentsExtra"] },
      { title: "법원·작성일", fields: ["court", "writtenOn"] },
    ],
  },

  complaint: {
    kind: "complaint",
    title: "소장",
    stepLabel: "소송 (소장·변론)",
    intro: "법원에 소송을 시작할 때 내는 문서예요. 원고·피고, 청구취지, 청구원인, 증거를 적어요.",
    tips: [
      "청구취지에는 법원에 구하는 결론을, 청구원인에는 그 이유가 되는 사실을 적어요.",
      "증거는 번호를 붙여 목록으로 정리하고 사본을 함께 내요.",
      "관할 법원과 인지대·송달료는 법원 안내(나홀로소송·전자소송)에서 확인해요.",
      "법원 사이트의 공식 서식과 작성례를 함께 참고하세요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
    officialForms: [{ name: "[민사] 소장", source: COURT_SOURCE, url: SCOURT_FORMS }],
    basis: ["민사소송법 제249조(소장의 기재사항)"],
    draftFields: "사건명·청구원인·입증방법",
    fields: [
      {
        key: "caseName",
        label: "사건명",
        type: "text",
        max: 100,
        help: "무엇을 청구하는 소송인지 짧게 적어요.",
        example: "임대차보증금 반환 청구의 소",
      },
      name("plaintiffName", "원고 이름", "소송을 내는 사람, 곧 나예요."),
      address("plaintiffAddress", "원고 주소"),
      phone("plaintiffPhone", "원고 연락 가능한 전화번호"),
      name("defendantName", "피고 이름", "소송 상대방이에요."),
      address("defendantAddress", "피고 주소"),
      phone("defendantPhone", "피고 연락 가능한 전화번호"),
      {
        key: "claimAmount",
        label: "청구 금액 (원금)",
        type: "money",
        max: 20,
        help: "받아야 할 원금을 숫자로 적어요. 청구취지 기본 문장에 들어가요.",
      },
      ...interestFields("소장 부본이 송달된 다음 날부터"),
      {
        key: "provisional",
        label: "가집행 선고",
        type: "choice",
        max: 10,
        defaultValue: "yes",
        help: "판결이 확정되기 전에도 강제집행할 수 있게 해 달라는 문장이에요. 법원 서식 기본 문장에 들어 있어요.",
        options: [
          { value: "yes", label: "넣기" },
          { value: "no", label: "빼기" },
        ],
      },
      {
        key: "claimCause",
        label: "청구원인",
        type: "textarea",
        max: LONG,
        help: "청구하는 이유가 되는 사실을 날짜와 함께 시간 순서대로 적어요.",
        example: "원고는 ○○년 ○월 ○일 피고와 임대차계약을 맺고 보증금 ○○○원을 보냈습니다.",
      },
      {
        key: "evidence",
        label: "입증방법 (증거 목록)",
        type: "textarea",
        max: LONG,
        help: "증거마다 한 줄씩, 갑 제○호증처럼 번호를 붙여 적어요.",
        example: "갑 제○호증 임대차계약서",
      },
      {
        key: "attachments",
        label: "첨부서류",
        type: "checks",
        max: 200,
        optional: true,
        defaultValue: "fee,proof,copy",
        help: "법원 서식의 첨부서류 목록이에요.",
        options: [
          { value: "fee", label: "소송비용(인지, 송달료) 납부서" },
          { value: "proof", label: "위 입증서류" },
          { value: "copy", label: "소장 부본" },
        ],
      },
      court("피고 주소지 등을 맡는 법원에 내요. 법원 안내(나홀로소송)에서 확인하세요."),
      writtenOn,
    ],
    pages: [
      { title: "사건명", fields: ["caseName"] },
      {
        title: "원고 (나)",
        help: RRN_NOTICE,
        fields: ["plaintiffName", "plaintiffAddress", "plaintiffPhone"],
      },
      { title: "피고 (상대방)", fields: ["defendantName", "defendantAddress", "defendantPhone"] },
      { title: "청구 금액", fields: ["claimAmount"] },
      {
        title: "이자·지연손해금 (선택)",
        fields: ["interestRate", "interestFrom", "interestDate"],
      },
      { title: "가집행", fields: ["provisional"] },
      { title: "청구원인", fields: ["claimCause"] },
      { title: "입증방법", fields: ["evidence"] },
      { title: "첨부서류", fields: ["attachments"] },
      { title: "법원·작성일", fields: ["court", "writtenOn"] },
    ],
  },
};

/** 초안 도우미(DEC-023)가 사실관계 문장을 넣는 칸 */
export const FACTS_FIELD: Partial<Record<DocumentKind, string>> = {
  complaint: "claimCause",
  "demand-letter": "facts",
  "lease-registration": "extraReason",
  "payment-order": "claimCause",
  "compensation-order": "claimContent",
  "wage-petition": "petitionDetail",
  "dismissal-remedy": "reason",
  "dismissal-review": "reviewReason",
  "lease-mediation": "reason",
  "civil-mediation": "cause",
  "financial-mediation": "reason",
};

export type DocumentInput = Record<string, string>;

const fieldOf = (kind: DocumentKind, key: string) =>
  DOCUMENT_SPECS[kind].fields.find((f) => f.key === key);

/** 이 칸을 지금 물어야 하는지 (when 조건) */
export function isActive(f: Field, values: Record<string, unknown>): boolean {
  if (!f.when) return true;
  const v = values[f.when.key];
  const s = typeof v === "string" ? v.trim() : "";
  return f.when.value === undefined ? s !== "" : s === f.when.value;
}

/** 설문 처음 값 (choice·checks 기본 선택) */
export function initialValues(kind: DocumentKind): DocumentInput {
  const out: DocumentInput = {};
  for (const f of DOCUMENT_SPECS[kind].fields) if (f.defaultValue) out[f.key] = f.defaultValue;
  return out;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const validDate = (s: string) => {
  const m = DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};

/** 칸 하나 정규화. 틀리면 null (값은 오류에 넣지 않는다) */
function normalize(f: Field, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return f.optional ? "" : null;
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\r\n?/g, "\n").trim();
  if (!t) return f.optional ? "" : null;
  if (t.length > f.max) return null;
  switch (f.type) {
    case "text":
      return t.includes("\n") ? null : t;
    case "textarea":
      return t;
    case "date":
      return validDate(t) ? t : null;
    case "money": {
      const d = t.normalize("NFKC").replace(/[\s,원]/g, "");
      return /^[1-9]\d{0,14}$/.test(d) ? d : null;
    }
    case "rate": {
      const d = t.normalize("NFKC").replace(/[\s%]/g, "");
      return /^\d{1,2}(\.\d{1,2})?$/.test(d) ? d : null;
    }
    case "choice":
      return f.options?.some((o) => o.value === t) ? t : null;
    case "checks": {
      const picked = t
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const allowed = new Set(f.options?.map((o) => o.value));
      if (picked.some((p) => !allowed.has(p))) return null;
      const kept = f.options!.map((o) => o.value).filter((v) => picked.includes(v));
      return kept.length ? kept.join(",") : f.optional ? "" : null;
    }
  }
}

/** 설문 한 페이지(또는 전체)의 틀린 칸 이름. 값은 돌려주지 않는다 */
export function invalidFields(
  kind: DocumentKind,
  keys: readonly string[],
  values: Record<string, unknown>,
): string[] {
  const bad: string[] = [];
  for (const k of keys) {
    const f = fieldOf(kind, k);
    if (!f || !isActive(f, values)) continue;
    if (normalize(f, values[k]) === null) bad.push(k);
  }
  return bad;
}

/** 본문 검증. 형식 오류는 VALIDATION_ERROR(필드 이름만, 값은 넣지 않는다) */
export function parseDocumentInput(kind: DocumentKind, body: unknown): DocumentInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: DocumentInput = {};
  const fields: string[] = [];
  for (const f of DOCUMENT_SPECS[kind].fields) {
    if (!isActive(f, b)) {
      out[f.key] = "";
      continue;
    }
    const v = normalize(f, b[f.key]);
    if (v === null) fields.push(f.key);
    else out[f.key] = v;
  }
  if (fields.length) throw new ApiError("VALIDATION_ERROR", { fields });
  return out;
}

export type FilledDocument = {
  title: string;
  /** 파일 이름 (확장자 없음) */
  basename: string;
  blocks: Block[];
  text: string;
  /** 텍스트 내려받기 이름 (API 호환) */
  filename: string;
};

/** 블록을 일반 텍스트로 */
export function blocksToText(blocks: readonly Block[]): string {
  return blocks.map((b) => (b.kind === "blank" ? "" : b.text)).join("\n") + "\n";
}

/** 양식 채우기. 입력값을 칸·기본 문장에 넣기만 하고 새 문장·숫자를 만들지 않는다 */
export function fillDocument(kind: DocumentKind, v: DocumentInput): FilledDocument {
  const { title, basename, blocks } = fillBlocks(kind, v);
  return { title, basename, blocks, text: blocksToText(blocks), filename: `${basename}.txt` };
}

export type { Block } from "./fill";
