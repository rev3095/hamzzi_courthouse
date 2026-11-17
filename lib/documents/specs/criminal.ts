// 사기 타임라인 서식 (DEC-025 2차): 고소장(사기)·배상명령 신청서.
// 고소장: 경찰민원24 민원 서식 [수사] 간이고소장(사기)·고소장(표준) 항목 순서, 형사소송법 제237조(고소의 방식).
// 배상명령: 법원 전자민원센터 양식모음 [형사] 배상명령 신청서(B3002), 소송촉진 등에 관한 특례법 제26조 제3항(기재사항).
// 수사·처벌 결과를 예측하지 않는다(절대 규칙 2). 허위 고소 서약 문구는 경찰 고소장 서식 문구를 그대로 인용한다.
// 고소장은 진실확약(무고 서약)이 붙는 문서라 AI 초안(DEC-023)을 쓰지 않는다 — 피해 내용은 사용자가 직접 적는다.
import { OFFICIAL } from "@/lib/procedure/steps";
import {
  address,
  COURT_SOURCE,
  LONG,
  name,
  phone,
  RRN_NOTICE,
  SCOURT_FORMS,
  writtenOn,
  type DocumentSpec,
  type Field,
} from "../fields";

const POLICE_FORMS = "https://minwon24.police.go.kr/cvlcpt/cvlcptTmpltGdList.do";
const POLICE_SOURCE = "경찰청 경찰민원24 민원 서식";

/** 경찰 고소장(표준) 서식의 진실확약 문구 그대로 */
export const FALSE_ACCUSATION_PLEDGE =
  "본 고소장에 기재한 내용은 고소인이 알고 있는 지식과 경험을 바탕으로 모두 사실대로 작성하였으며, 만일 허위사실을 고소하였을 때에는 형법 제156조 무고죄로 처벌받을 것임을 서약합니다.";

/** 경찰 간이고소장(사기) '사기 수법' 체크 목록 (서식 표기 그대로) */
export const FRAUD_TYPES: { value: string; label: string }[] = [
  { value: "recruit", label: "회원모집(다단계 등)" },
  { value: "broker", label: "알선빙자(대출/취업등 브로커)" },
  { value: "realty", label: "부동산 거래" },
  { value: "card", label: "불법신용카드 사용" },
  { value: "construction", label: "공사대금/납품" },
  { value: "goods", label: "물품대금/납품" },
  { value: "service", label: "기타용역대금/납품" },
  { value: "trade", label: "일반 매매" },
  { value: "freeload", label: "무전취식/무전숙박/무임승차" },
  { value: "loan", label: "차용금" },
  { value: "prepaid", label: "선불금" },
  { value: "invest", label: "투자금" },
  { value: "gye", label: "계금" },
  { value: "lawsuit", label: "소송사기" },
  { value: "subsidy", label: "보조금 사기" },
  { value: "impersonation", label: "사칭·빙자" },
  { value: "insurance", label: "보험사기" },
  { value: "unknown", label: "기타 / 모름" },
];

/** 관련 사건 칸: 모르면 '모름'을 고르고, 문서에는 어느 쪽도 표시하지 않는다 (확정 진술로 바뀌지 않게) */
const yesNo = (key: string, label: string, yes: string, no: string, help?: string): Field => ({
  key,
  label,
  type: "choice",
  max: 10,
  defaultValue: "unknown",
  help,
  options: [
    { value: "yes", label: yes },
    { value: "no", label: no },
    { value: "unknown", label: "잘 모르겠어요 (표시하지 않고, 낼 때 경찰서에 말할게요)" },
  ],
});

export const CRIMINAL_SPECS = {
  "criminal-complaint": {
    kind: "criminal-complaint",
    title: "고소장 (사기)",
    stepLabel: "고소·신고",
    intro:
      "사기 피해를 수사기관에 알리고 처벌을 구하는 문서예요. 경찰청 간이고소장(사기)의 항목 순서를 따랐어요.",
    tips: [
      "직접 겪거나 자료로 확인한 사실만 적어요. 추측은 추측이라고 밝혀요.",
      "상대방의 이름·주소를 모르면 사이트 이름, 아이디·닉네임, 계좌번호처럼 아는 정보만 적어도 돼요.",
      "날짜·장소·피해 금액은 이체 내역·대화 캡처와 맞춰 적어요.",
      "온라인 거래 사기는 경찰청 사이버범죄 신고시스템으로도 신고할 수 있어요.",
      "고소장은 가까운 경찰서 민원실에 낼 수 있어요. 수사 진행은 수사기관 안내를 따르세요.",
    ],
    links: [OFFICIAL.cyberPolice, OFFICIAL.police],
    officialForms: [
      { name: "[수사] 간이고소장(사기)", source: POLICE_SOURCE, url: POLICE_FORMS },
      { name: "[수사] 고소장", source: POLICE_SOURCE, url: POLICE_FORMS },
    ],
    basis: ["형사소송법 제237조(고소의 방식)", "형법 제156조(무고)"],
    draftFields: "",
    officialNotice: {
      text: FALSE_ACCUSATION_PLEDGE,
      source: "경찰청 고소장 서식 (고소내용에 대한 진실확약)",
    },
    fields: [
      name("complainantName", "고소인 이름", "피해를 입은 사람, 곧 나예요."),
      address("complainantAddress", "고소인 주소"),
      phone("complainantPhone", "고소인 연락처"),
      { ...name("accusedName", "피고소인 이름", "상대방 이름을 알면 적어요."), optional: true },
      {
        ...address("accusedAddress", "피고소인 주소"),
        optional: true,
        help: "알면 적고, 모르면 비워 두세요.",
      },
      { ...phone("accusedPhone", "피고소인 연락처"), help: "알면 적고, 모르면 비워 두세요." },
      {
        key: "accusedSite",
        label: "거래한 사이트·SNS 이름",
        type: "text",
        max: 100,
        optional: true,
        example: "○○마켓 / ○○톡",
      },
      {
        key: "accusedId",
        label: "상대방 아이디·닉네임",
        type: "text",
        max: 100,
        optional: true,
      },
      {
        key: "accusedAccount",
        label: "돈을 보낸 계좌 (은행명·계좌번호)",
        type: "text",
        max: 100,
        optional: true,
        help: "이체 내역에 나온 그대로 적어요.",
        example: "○○은행 ○○○-○○○○-○○○○",
      },
      {
        key: "fraudType",
        label: "사기 수법",
        type: "choice",
        max: 20,
        defaultValue: "unknown",
        help: "가장 비슷한 것을 골라요. 모르겠으면 '기타 / 모름'을 골라요.",
        options: FRAUD_TYPES,
      },
      {
        key: "incidentDate",
        label: "피해를 당한 날",
        type: "date",
        max: 10,
        optional: true,
        help: "정확한 날을 모르면 비워 두세요.",
      },
      {
        key: "incidentPlace",
        label: "피해를 당한 장소",
        type: "text",
        max: 100,
        optional: true,
        help: "온라인이면 사이트·앱 이름을 적어요.",
        example: "○○마켓 앱 채팅",
      },
      {
        key: "damageDetail",
        label: "피해 내용",
        type: "textarea",
        max: LONG,
        help: "언제, 무엇을 약속받고, 얼마를 보냈는데, 그 뒤 어떻게 됐는지 시간 순서대로 사실만 적어요.",
        example:
          "○월 ○일 중고 물건을 사기로 하고 ○○○원을 보냈지만 물건을 받지 못했고 연락이 끊겼습니다.",
      },
      {
        key: "damageAmount",
        label: "피해 금액",
        type: "money",
        max: 20,
        optional: true,
        help: "모르면 비워 두세요. 문서에는 '모름'으로 들어가요.",
      },
      {
        key: "punish",
        label: "처벌 희망 여부",
        type: "choice",
        max: 10,
        defaultValue: "yes",
        options: [
          { value: "yes", label: "피고소인에 대한 처벌을 원해요" },
          { value: "no", label: "표시하지 않을게요" },
        ],
      },
      {
        key: "evidence",
        label: "증거자료",
        type: "textarea",
        max: LONG,
        optional: true,
        help: "낼 증거를 한 줄에 하나씩 적어요.",
        example: "이체 내역\n거래 글 캡처\n대화 캡처",
      },
      yesNo(
        "duplicate",
        "같은 내용으로 다른 경찰서·검찰청에 고소한 적",
        "있어요",
        "없어요",
        "경찰 고소장 서식에서 표시하도록 정한 칸이에요.",
      ),
      yesNo("relatedCriminal", "관련 사건이 수사 중인지", "수사 중이에요", "수사 중이 아니에요"),
      yesNo("relatedCivil", "관련 민사소송이 진행 중인지", "소송 중이에요", "소송 중이 아니에요"),
      {
        key: "pledge",
        label: "진실확약",
        type: "checks",
        max: 10,
        help: "경찰 고소장 서식의 문구예요. 확인하고 체크해야 다음으로 넘어가요.",
        options: [{ value: "agree", label: FALSE_ACCUSATION_PLEDGE }],
      },
      {
        key: "policeStation",
        label: "제출할 경찰서",
        type: "text",
        max: 50,
        help: "가까운 경찰서에 낼 수 있어요.",
        example: "○○경찰서",
      },
      { ...writtenOn, help: "고소장을 내는 날이에요. 비워 두면 직접 적을 수 있어요." },
    ],
    pages: [
      {
        title: "고소인 (나)",
        help: RRN_NOTICE,
        fields: ["complainantName", "complainantAddress", "complainantPhone"],
      },
      {
        title: "피고소인 — 아는 정보만",
        help: "모르는 칸은 비워 두세요.",
        fields: ["accusedName", "accusedAddress", "accusedPhone"],
      },
      { title: "피고소인 — 온라인 정보", fields: ["accusedSite", "accusedId", "accusedAccount"] },
      { title: "사기 수법", fields: ["fraudType"] },
      { title: "피해를 당한 날·장소", fields: ["incidentDate", "incidentPlace"] },
      { title: "피해 내용", fields: ["damageDetail"] },
      { title: "피해 금액·처벌 희망", fields: ["damageAmount", "punish"] },
      { title: "증거자료", fields: ["evidence"] },
      {
        title: "관련 사건",
        help: "아는 것만 고르세요. 모르면 '잘 모르겠어요'를 골라요. 경찰 서식에서 표시하도록 정한 칸이라 낼 때 경찰서에 확인해 주세요.",
        fields: ["duplicate", "relatedCriminal", "relatedCivil"],
      },
      { title: "진실확약", fields: ["pledge"] },
      { title: "제출처·작성일", fields: ["policeStation", "writtenOn"] },
    ],
  },

  "compensation-order": {
    kind: "compensation-order",
    title: "배상명령 신청서",
    stepLabel: "배상명령 신청",
    intro:
      "형사재판을 받는 피고인에게 피해를 물어내라는 명령을 같은 재판에서 내려 달라고 법원에 신청하는 문서예요.",
    tips: [
      "형사재판이 열린 뒤 그 재판을 맡은 법원에 내요. 사건번호는 검찰 처분 통지나 법원 사건검색에서 확인해요.",
      "법률에 따라 이 신청서에는 인지를 붙이지 않아요.",
      "피고인 수만큼 신청서 부본을 함께 내요.",
      "피해 금액을 보여 주는 자료(이체 내역 등)를 첨부할 수 있어요.",
      "같은 피해로 다른 민사소송이 진행 중이면 배상명령을 신청할 수 없어요.",
    ],
    links: [OFFICIAL.proSe, OFFICIAL.klac],
    officialForms: [{ name: "[형사] 배상명령 신청서", source: COURT_SOURCE, url: SCOURT_FORMS }],
    basis: ["소송촉진 등에 관한 특례법 제25조·제26조(배상신청)"],
    draftFields: "배상의 대상과 그 내용",
    fields: [
      {
        key: "caseNumber",
        label: "형사사건 번호",
        type: "text",
        max: 50,
        help: "피고인의 형사재판 사건번호예요.",
        example: "○○○○고단○○○○",
      },
      { key: "caseName", label: "사건명", type: "text", max: 50, example: "사기" },
      {
        key: "court",
        label: "재판을 맡은 법원",
        type: "text",
        max: 50,
        example: "○○지방법원",
      },
      name("applicantName", "신청인(피해자) 이름", "피해를 입은 사람, 곧 나예요."),
      address("applicantAddress", "신청인 주소"),
      phone("applicantPhone", "신청인 연락처"),
      name("defendantName", "피고인 이름", "형사재판을 받는 상대방이에요."),
      address("defendantAddress", "피고인 주소"),
      {
        key: "claimAmount",
        label: "배상을 청구하는 금액",
        type: "money",
        max: 20,
        help: "피해를 입은 금액 가운데 배상받으려는 금액을 숫자로 적어요.",
      },
      {
        key: "claimContent",
        label: "배상의 대상과 그 내용",
        type: "textarea",
        max: LONG,
        help: "피고인이 언제, 어떻게 피해를 입혔는지와 그 피해의 배상을 구한다는 내용을 사실대로 적어요.",
        example: "피고인은 ○○년 ○월 ○일 신청인을 속여 ○○○원을 받아 갔습니다.",
      },
      {
        key: "attachments",
        label: "첨부서류",
        type: "textarea",
        max: 500,
        optional: true,
        help: "한 줄에 하나씩 적어요.",
        example: "차용증서\n계좌 이체 내역",
      },
      writtenOn,
    ],
    pages: [
      { title: "형사사건", fields: ["caseNumber", "caseName", "court"] },
      {
        title: "신청인 (나)",
        help: "공식 서식에는 주민등록번호 칸이 없어요.",
        fields: ["applicantName", "applicantAddress", "applicantPhone"],
      },
      { title: "피고인", fields: ["defendantName", "defendantAddress"] },
      { title: "배상 청구 금액", fields: ["claimAmount"] },
      { title: "배상의 대상과 그 내용", fields: ["claimContent"] },
      { title: "첨부서류·작성일", fields: ["attachments", "writtenOn"] },
    ],
  },
} satisfies Record<"criminal-complaint" | "compensation-order", DocumentSpec>;
