// 노동 타임라인 서식 채우기 (DEC-025 3차). 사용자가 적은 값만 넣는다 (절대 규칙 3).
// 간이대지급금 지급청구서는 법령 서식(임금채권보장법 시행규칙 별지 제3호의2서식) 칸 순서·문구를 따른다.
// ⑥ 지급받아야 할 대지급금(고시 상한 적용)·⑧ 입금 계좌·주민등록번호는 빈칸으로 남긴다 (F-007, 숫자 생성 금지).
import {
  blank,
  center,
  formatDate,
  formatWon,
  heading,
  lines,
  numbered,
  p,
  RRN,
  right,
  signDate,
  title,
  type Block,
  type V,
} from "./fill-kit";

const won = (v: string | undefined) => (v ? `${formatWon(v)}원` : "            원");
const orBlank = (v: string | undefined) => (v && v.trim() ? v : "");
const check = (on: boolean) => (on ? "[✔]" : "[ ]");
const listOf = (s: string | undefined) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function wagePetition(v: V): Block[] {
  const period =
    v.stillWorking === "yes"
      ? `${formatDate(v.startDate)} ~ 현재 (재직 중)`
      : `${formatDate(v.startDate)} ~ ${formatDate(v.endDate)}`;
  const evidence = listOf(v.evidence);
  return [
    title("진    정    서"),
    blank,
    heading("1. 진정인"),
    p(`성    명  ${v.petitionerName}  ${RRN}`),
    p(`주    소  ${v.petitionerAddress}`),
    p(`연 락 처  ${orBlank(v.petitionerPhone)}`),
    blank,
    heading("2. 피진정인 (사업주)"),
    p(`사업장명  ${v.companyName}`),
    p(`대 표 자  ${v.employerName}`),
    p(`소 재 지  ${v.companyAddress}`),
    p(`연 락 처  ${orBlank(v.employerPhone)}`),
    blank,
    heading("3. 근로 내용"),
    p(`근무기간 : ${period}`),
    p(`업무내용 : ${v.jobDuty}`),
    p(`근로계약 방법 : ${v.contractType === "oral" ? "구두" : "서면 근로계약서"}`),
    p(`임금 지급일 : ${orBlank(v.payday)}`),
    blank,
    heading("4. 받지 못한 금품"),
    p(`임    금 : ${won(v.unpaidWage)}`),
    p(`퇴 직 금 : ${won(v.unpaidSeverance)}`),
    blank,
    heading("5. 진정 내용"),
    ...lines(v.petitionDetail),
    ...(evidence.length ? [blank, heading("6. 증거자료"), ...numbered(evidence)] : []),
    blank,
    p("위와 같이 진정하오니 조사하여 주시기 바랍니다."),
    blank,
    signDate(v),
    right(`진정인  ${v.petitionerName}  (서명 또는 인)`),
    blank,
    p(`${v.office} 귀중`),
  ];
}

export function wageAdvance(v: V): Block[] {
  return [
    title("간이대지급금 지급청구서"),
    blank,
    heading("청구인"),
    p(`성명  ${v.claimantName}    ${RRN}`),
    p(`주소  ${v.claimantAddress}`),
    p(`(휴대전화번호: ${orBlank(v.claimantPhone)}    전자우편주소: ${orBlank(v.claimantEmail)})`),
    p(`① 근무기간  ${formatDate(v.workFrom)} ∼ ${formatDate(v.workTo)}`),
    p(
      `② 청구 구분  ${check(v.claimantStatus === "retired")}퇴직자 대지급금 청구  ${check(v.claimantStatus === "employed")}재직자 대지급금 청구`,
    ),
    p(
      `              ${check(v.claimBasis === "judgment")}판결등에 따른 청구  ${check(v.claimBasis === "certificate")}체불 임금등ㆍ사업주 확인서에 따른 청구`,
    ),
    p(`③ 지급받지 못한 임금등의 총 확정금액  ${won(v.totalUnpaid)}`),
    p(
      `④ 지급받지 못한 임금등의 총 확정금액에 대하여 대지급금 지급 청구일까지 사업주나 퇴직연금사업자 등으로부터 지급받은 금액  ${won(v.alreadyPaid)}`,
    ),
    p(
      `   가. 지급 청구일까지 지급받지 못했으나, 향후 퇴직연금사업자로부터 지급받을 퇴직연금이 있습니까? ${check(v.pensionPending === "yes")}예 ${check(v.pensionPending !== "yes")}아니오`,
    ),
    p(
      `   나. 지급 청구일까지 지급받지 못했으나, 향후 외국인 근로자의 출국만기보험ㆍ신탁 및 보증보험으로 지급받을 보험금이 있습니까? ${check(v.insurancePending === "yes")}예 ${check(v.insurancePending !== "yes")}아니오`,
    ),
    p("⑤ 청구일 현재까지 지급받지 못한 임금등의 금액"),
    p(
      `   가. 최종 3개월분(재직자의 경우 소송등 또는 진정등 제기일 기준 마지막 3개월분)의 임금ㆍ휴업수당ㆍ출산전후휴가기간 중 급여: ${won(v.unpaidRecentWage)}`,
    ),
    p(`   나. 최종 3년간의 퇴직급여등(퇴직자인 경우): ${won(v.unpaidRecentSeverance)}`),
    p("⑥ 지급받아야 할 대지급금              원"),
    p(
      `⑦ 대지급금 지급(일부지급 제외) 결정 시 희망하는 통지 방법  ${check(v.notifyBy === "sms")}문자메시지 ${check(v.notifyBy === "mail")}우편`,
    ),
    p("⑧ 입금의뢰  입금은행:              예금주:              계좌번호:"),
    p(`⑨ 대상사업주  사업장명: ${v.companyName}    대표자 성명: ${v.employerName}`),
    p(`              소재지: ${v.companyAddress}`),
    blank,
    p(
      "「임금채권보장법」 제7조, 제7조의2, 같은 법 시행령 제9조 및 같은 법 시행규칙 제5조제2항에 따라 위와 같이 대지급금의 지급을 청구합니다.",
    ),
    blank,
    signDate(v),
    right(`청구인  ${v.claimantName}  (서명 또는 인)`),
    right("대리인              (서명 또는 인)"),
    blank,
    p(`근로복지공단 ${v.office}장 귀하`),
    blank,
    heading("자료제공 요청 동의"),
    p(
      "본인은 귀 기관이 「임금채권보장법」 제23조제1항제6호ㆍ제8호 및 제9호에 해당하는 자료를 「법률구조법」 제8조에 따른 대한법률구조공단, 「근로자퇴직급여 보장법」 제26조에 따른 퇴직연금사업자 및 「보험업법」에 따른 보험회사로부터 제공받아 간이대지급금 지급 등의 처리 업무에 이용하는 것에 동의합니다.",
    ),
    right(`청구인  ${v.claimantName}  (서명 또는 인)`),
  ];
}

const REMEDY_AIM: Record<string, string> = {
  reinstate:
    "이 사건 해고는 부당해고임을 인정한다. 사용자는 근로자를 원직에 복직시키고, 해고기간 동안 정상적으로 근로하였다면 받을 수 있었던 임금 상당액을 지급하라.",
  compensate:
    "이 사건 해고는 부당해고임을 인정한다. 사용자는 근로자에게 원직 복직을 대신하여 해고기간 동안 정상적으로 근로하였다면 받을 수 있었던 임금 상당액 이상의 금품을 지급하라.",
};

export function dismissalRemedy(v: V): Block[] {
  return [
    title("부당해고 구제신청서"),
    blank,
    heading("신청인 (근로자)"),
    p(`성    명  ${v.workerName}  ${RRN}`),
    p(`주    소  ${v.workerAddress}`),
    p(`연 락 처  ${orBlank(v.workerPhone)}`),
    blank,
    heading("피신청인 (사용자)"),
    p(`사업장명  ${v.companyName}`),
    p(`대 표 자  ${v.employerName}`),
    p(`소 재 지  ${v.companyAddress}`),
    ...(v.workplace ? [p(`근로자가 소속된 사업장  ${v.workplace}`)] : []),
    blank,
    p(`입 사 일  ${formatDate(v.hireDate)}`),
    p(`해 고 일  ${formatDate(v.dismissalDate)}`),
    p(`해고통지서 수령일  ${formatDate(v.noticeDate)}`),
    blank,
    heading("신 청 취 지"),
    p(REMEDY_AIM[v.remedyAim] ?? REMEDY_AIM.reinstate),
    p("라는 구제명령을 구합니다."),
    blank,
    heading("신 청 이 유"),
    ...lines(v.reason),
    blank,
    signDate(v),
    right(`신청인  ${v.workerName}  (서명 또는 인)`),
    blank,
    p(`${v.commission} 귀중`),
  ];
}

export function dismissalReview(v: V): Block[] {
  return [
    title("부당해고 구제 재심신청서"),
    blank,
    heading("재심신청인"),
    p(`성    명  ${v.applicantName}  ${RRN}`),
    p(`주    소  ${v.applicantAddress}`),
    p(`연 락 처  ${orBlank(v.applicantPhone)}`),
    blank,
    heading("재심피신청인"),
    p(`성    명  ${v.respondentName}`),
    p(`사업장명  ${v.respondentCompany}`),
    p(`주    소  ${v.respondentAddress}`),
    blank,
    heading("초심 사건"),
    p(`초심 노동위원회  ${v.firstCommission}`),
    p(`초심 사건번호  ${v.firstCaseNumber}`),
    p(`판정서 수령일  ${formatDate(v.decisionReceived)}`),
    blank,
    heading("재 심 신 청 취 지"),
    ...lines(v.reviewAim),
    blank,
    heading("재 심 신 청 이 유"),
    ...lines(v.reviewReason),
    blank,
    signDate(v),
    right(`재심신청인  ${v.applicantName}  (서명 또는 인)`),
    blank,
    center("중앙노동위원회 귀중"),
  ];
}
