// 사기 타임라인 서식 채우기 (DEC-025 2차). 경찰 간이고소장(사기)·법원 배상명령 신청서 순서를 따른다.
// 사용자가 적은 값만 넣는다. 처벌·배상 결과를 말하는 문장을 만들지 않는다 (절대 규칙 2·3).
import {
  blank,
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
import { FALSE_ACCUSATION_PLEDGE, FRAUD_TYPES } from "./specs/criminal";

const box = (on: boolean) => (on ? "■" : "□");
const orBlank = (v: string | undefined) => (v && v.trim() ? v : "");

export function criminalComplaint(v: V): Block[] {
  const fraud = FRAUD_TYPES.find((t) => t.value === v.fraudType)?.label ?? "기타 / 모름";
  const evidence = (v.evidence ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return [
    title("고    소    장 (사기)"),
    blank,
    heading("1. 고소인"),
    p(`성    명  ${v.complainantName}  ${RRN}`),
    p(`주    소  ${v.complainantAddress}`),
    p(`연 락 처  ${orBlank(v.complainantPhone)}`),
    blank,
    heading("2. 피고소인"),
    p(`성    명  ${orBlank(v.accusedName)}`),
    p(`주    소  ${orBlank(v.accusedAddress)}`),
    p(`연 락 처  ${orBlank(v.accusedPhone)}`),
    p(`사이트 또는 SNS 이름  ${orBlank(v.accusedSite)}    ID 또는 닉네임  ${orBlank(v.accusedId)}`),
    p(`계좌번호  ${orBlank(v.accusedAccount)}`),
    blank,
    heading("3. 고소요지"),
    p(`① 사기 수법 : ${fraud}`),
    p(`② 피해를 당한 날짜 : ${v.incidentDate ? formatDate(v.incidentDate) : ""}`),
    p(`③ 피해를 당한 장소 : ${orBlank(v.incidentPlace)}`),
    p("④ 피해 내용"),
    ...lines(v.damageDetail),
    p(`⑤ 피해 금액 : ${v.damageAmount ? `${formatWon(v.damageAmount)}원` : "모름"}`),
    p(`⑥ 처벌 희망여부 : ${box(v.punish === "yes")} 피고소인에 대한 처벌을 원함`),
    blank,
    heading("4. 증거자료"),
    p(
      evidence.length
        ? "■ 고소인은 고소인의 진술 외에 제출할 증거가 있습니다."
        : "■ 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.",
    ),
    ...numbered(evidence),
    blank,
    heading("5. 관련사건의 수사 및 재판 여부"),
    p(
      `① 중복 고소 여부 : 본 고소장과 같은 내용의 고소장을 다른 검찰청 또는 경찰서에 제출하거나 제출하였던 사실이 ${v.duplicate === "yes" ? "있습니다" : "없습니다"}`,
    ),
    p(
      `② 관련 형사사건 : 본 고소장에 기재된 범죄사실과 관련된 사건 또는 공범에 대하여 검찰청이나 경찰서에서 ${v.relatedCriminal === "yes" ? "수사 중에 있습니다" : "수사 중에 있지 않습니다"}`,
    ),
    p(
      `③ 관련 민사소송 : 본 고소장에 기재된 범죄사실과 관련된 사건에 대하여 법원에서 ${v.relatedCivil === "yes" ? "민사소송 중에 있습니다" : "민사소송 중에 있지 않습니다"}`,
    ),
    blank,
    heading("고소내용에 대한 진실확약"),
    p(FALSE_ACCUSATION_PLEDGE),
    blank,
    signDate(v),
    right(`고소인  ${v.complainantName}  (인)`),
    blank,
    p(`${v.policeStation} 귀중`),
  ];
}

export function compensationOrder(v: V): Block[] {
  const attachments = (v.attachments ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return [
    title("배상명령 신청서"),
    blank,
    p(`사    건  ${v.caseNumber}  ${v.caseName}`),
    blank,
    p(`신 청 인  ${v.applicantName}`),
    p(`          주소  ${v.applicantAddress}`),
    blank,
    p(`피 고 인  ${v.defendantName}`),
    p(`          주소  ${v.defendantAddress}`),
    blank,
    p(`1. 배상을 청구하는 금액   금 ${formatWon(v.claimAmount)}원`),
    blank,
    p("2. 배상의 대상과 그 내용"),
    ...lines(v.claimContent),
    blank,
    signDate(v),
    right(`신청인  ${v.applicantName}  (서명 또는 날인)`),
    right(`연락 가능한 전화번호: ${orBlank(v.applicantPhone)}`),
    blank,
    ...(attachments.length ? [p("첨부서류"), ...numbered(attachments)] : []),
    blank,
    p(`${v.court} 귀중`),
  ];
}
