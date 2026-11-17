// 분쟁조정·집행 서식 채우기 (DEC-025 4차). 사용자가 적은 값만 넣는다 (절대 규칙 3).
// 민사 조정 신청취지의 끝맺음("…라는 조정을 구합니다")은 법원 조정신청서(A1924) 문구다.
// 재산명시의 신청취지·신청사유 문장은 법원 서식 파일을 읽지 못해(HWP 3.0) 민사집행규칙 제25조 기재사항을 기준으로 만든 자체 문장이다.
import {
  blank,
  BLANK_WON,
  formatWon,
  heading,
  lines,
  numbered,
  p,
  picked,
  RRN,
  right,
  signDate,
  title,
  type Block,
  type V,
} from "./fill-kit";

const BIRTH = "(생년월일:                    )";
const orBlank = (v: string | undefined) => (v && v.trim() ? v : "");
const listOf = (s: string | undefined) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function leaseMediation(v: V): Block[] {
  const evidence = listOf(v.evidence);
  return [
    title("주택임대차분쟁조정신청서"),
    blank,
    heading("신 청 인"),
    p(`성명  ${v.applicantName}  ${BIRTH}`),
    p(`주소  ${v.applicantAddress}`),
    p(`(휴대전화번호: ${orBlank(v.applicantPhone)})`),
    p(`송달장소  ${orBlank(v.applicantService)}`),
    blank,
    heading("피 신 청 인"),
    p(`성명  ${v.respondentName}  ${BIRTH}`),
    p(`주소  ${v.respondentAddress}`),
    p(`(전화번호: ${orBlank(v.respondentPhone)})`),
    blank,
    heading("신청의 취지"),
    ...lines(v.aim),
    p(`(신청금액) ${v.aimAmount ? `${formatWon(v.aimAmount)}원` : ""}`),
    p(`(산정근거) ${orBlank(v.aimBasis)}`),
    blank,
    heading("신청의 이유 (분쟁의 내용)"),
    ...lines(v.reason),
    blank,
    heading("증거서류 또는 증거물"),
    ...numbered(evidence),
    blank,
    p(
      "「주택임대차보호법」 제21조제1항, 같은 법 시행령 제30조제1항에 따라 위와 같이 조정을 신청합니다.",
    ),
    blank,
    signDate(v),
    right(`신청인  ${v.applicantName}  (서명 또는 인)`),
    blank,
    p(`대한법률구조공단 ${v.branch} 주택임대차분쟁조정위원회 귀중`),
  ];
}

const CIVIL_ATTACHMENTS: Record<string, string> = {
  proof: "입증방법",
  copy: "신청서부본",
  fee: "송달료납부서",
};

export function civilMediation(v: V): Block[] {
  const aims = [
    ...(v.claimAmount
      ? [`피신청인은 신청인에게 금 ${formatWon(v.claimAmount)}원을 지급한다.`]
      : []),
    ...listOf(v.otherAims),
  ];
  return [
    title("조 정 신 청 서"),
    blank,
    p(`사 건 명  ${v.caseName}`),
    blank,
    p(`신 청 인  ${v.applicantName}  ${RRN}`),
    p(`          주소  ${v.applicantAddress}`),
    p(`          연락 가능한 전화번호  ${orBlank(v.applicantPhone)}`),
    p(`피신청인  ${v.respondentName}  ${RRN}`),
    p(`          주소  ${v.respondentAddress}`),
    p(`          연락 가능한 전화번호  ${orBlank(v.respondentPhone)}`),
    blank,
    p(`소송목적의 값  금 ${BLANK_WON}원    인지  금 ${BLANK_WON}원`),
    blank,
    heading("신 청 취 지"),
    ...(aims.length ? numbered(aims) : [p("1.")]),
    p("라는 조정을 구합니다."),
    blank,
    heading("신 청 원 인"),
    ...lines(v.cause),
    blank,
    heading("입 증 방 법"),
    ...numbered(listOf(v.evidence)),
    blank,
    heading("첨 부 서 류"),
    ...numbered(picked(v.attachments, CIVIL_ATTACHMENTS)),
    blank,
    signDate(v),
    right(`신청인  ${v.applicantName}  (서명 또는 날인)`),
    blank,
    p(`${v.court} 귀중`),
  ];
}

export function financialMediation(v: V): Block[] {
  return [
    title("분 쟁 조 정 신 청 서"),
    blank,
    heading("신 청 인"),
    p(`성명  ${v.applicantName}`),
    p(`주소  ${v.applicantAddress}`),
    p(`연락처  ${orBlank(v.applicantPhone)}`),
    blank,
    heading("상 대 방"),
    p(`명칭  ${v.company}`),
    p(`주된 사무소 소재지  ${orBlank(v.companyAddress)}`),
    blank,
    heading("신청의 취지"),
    ...lines(v.aim),
    blank,
    heading("신청의 이유"),
    ...lines(v.reason),
    blank,
    heading("첨부서류"),
    ...numbered(listOf(v.evidence)),
    blank,
    p("「금융분쟁조정세칙」 제11조에 따라 위와 같이 분쟁의 조정을 신청합니다."),
    blank,
    signDate(v),
    right(`신청인  ${v.applicantName}  (서명 또는 인)`),
    blank,
    p("금융감독원장 귀하"),
  ];
}

const PROPERTY_ATTACHMENTS: Record<string, string> = {
  title: "집행력 있는 정본",
  service: "송달증명원",
};

export function propertyDisclosure(v: V): Block[] {
  return [
    title("재 산 명 시 신 청 서"),
    blank,
    p(`채 권 자  ${v.creditorName}  ${RRN}`),
    p(`          주소  ${v.creditorAddress}`),
    p(`          연락 가능한 전화번호  ${orBlank(v.creditorPhone)}`),
    p(`채 무 자  ${v.debtorName}  ${RRN}`),
    p(`          주소  ${v.debtorAddress}`),
    blank,
    p(`집행권원의 표시  ${v.title}`),
    p(`채무자가 이행하지 아니하는 금전채무액  금 ${formatWon(v.unpaidAmount)}원`),
    blank,
    heading("신 청 취 지"),
    p("채무자는 재산상태를 명시한 재산목록을 제출하라."),
    p("라는 명령을 구합니다."),
    blank,
    heading("신 청 사 유"),
    p(
      "채권자는 채무자에 대하여 위 집행권원을 가지고 있으나, 채무자는 위 금전채무를 이행하지 아니하고 있으므로 이 신청을 합니다.",
    ),
    ...lines(v.reason),
    blank,
    heading("첨 부 서 류"),
    ...numbered(picked(v.attachments, PROPERTY_ATTACHMENTS)),
    blank,
    signDate(v),
    right(`채권자  ${v.creditorName}  (서명 또는 날인)`),
    blank,
    p(`${v.court} 귀중`),
  ];
}
