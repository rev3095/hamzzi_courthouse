// 전문 에이전트 갈래 서식 채우기 (사용자 요청 2026-11-26). 공식 양식의 항목 순서·기본 문장을 따른다.
// 사용자가 적은 값만 넣는다 — 수사·재판 결과를 말하는 문장을 만들지 않고, 숫자를 지어내지 않는다 (절대 규칙 2·3).
// 고소장의 '범죄사실'은 사용자가 설문에서 고르고 적은 사실을 정해진 틀 문장에 넣어 차례로 놓을 뿐이다
// (목적·고의 같은 평가는 쓰지 않는다 — 그 판단은 수사기관·법원이 한다).
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
import {
  HARM_CHECKLIST,
  HARM_EVIDENCE,
  HARM_KNOWN,
  HARM_PLACES,
  OBSCENITY_MEDIA,
  TRADE_AFTER,
} from "./specs/assistant";
import { FALSE_ACCUSATION_PLEDGE } from "./specs/criminal";

const box = (on: boolean) => (on ? "■" : "□");
const orBlank = (v: string | undefined) => (v && v.trim() ? v : "");
/** 있다·없다 둘 다 □이면 '모름' — 확정 진술을 만들지 않는다 */
const pair = (v: string | undefined, yes: string, no: string) =>
  `${yes} ${box(v === "yes")} / ${no} ${box(v === "no")}`;
const listOf = (s: string | undefined) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
/** 서식의 선택지를 모두 늘어놓고 고른 것만 ■ */
const picks = (options: { value: string; label: string }[], chosen: (v: string) => boolean) =>
  options.map((o) => `${box(chosen(o.value))} ${o.label}`).join("  ");

const complainantBlocks = (v: V): Block[] => [
  p(`성    명  ${v.complainantName}  ${RRN}`),
  p(`주    소  ${v.complainantAddress}`),
  p(`연 락 처  ${orBlank(v.complainantPhone)}`),
];
const accusedBlocks = (v: V): Block[] => [
  p(`성    명  ${orBlank(v.accusedName)}`),
  p(`주    소  ${orBlank(v.accusedAddress)}`),
  p(`연 락 처  ${orBlank(v.accusedPhone)}`),
  p(`사이트 또는 SNS 이름  ${orBlank(v.accusedSite)}    ID 또는 닉네임  ${orBlank(v.accusedId)}`),
];
const pledgeBlocks = (v: V): Block[] => [
  heading("고소내용에 대한 진실확약"),
  p(FALSE_ACCUSATION_PLEDGE),
  blank,
  signDate(v),
  right(`고소인  ${v.complainantName}  (인)`),
  blank,
  p(`${v.policeStation} 귀중`),
];

/** 경찰 간이고소장(모욕·명예훼손 등) */
export function defamationComplaint(v: V): Block[] {
  const kinds = (v.evidenceKinds ?? "").split(",");
  return [
    title("간 이 고 소 장 (모욕·명예훼손 등)"),
    blank,
    heading("1. 고소인"),
    ...complainantBlocks(v),
    blank,
    heading("2. 피고소인"),
    ...accusedBlocks(v),
    blank,
    heading("3. 고소요지"),
    p(`① 피해를 당한 날짜 : ${v.incidentDate ? formatDate(v.incidentDate) : ""}`),
    p(`② 피해를 당한 장소 : ${picks(HARM_PLACES, (x) => x === v.placeType)}`),
    p(`     (장소·사이트·게임명 : ${orBlank(v.placeDetail)})`),
    p(`③ 피해 사실을 알게된 방법 : ${picks(HARM_KNOWN, (x) => x === v.howKnown)}`),
    p("④ 모욕·명예훼손한 내용 (피고소인이 말한 내용)"),
    ...lines(v.content),
    p(
      `     위 내용이 사실인지의 여부 : ${box(v.truth === "true")} 사실입니다  ${box(v.truth === "false")} 사실이 아닙니다.  ${box(v.truth === "unknown")} 모릅니다.`,
    ),
    p(
      `⑤ 공연성 : ${box(v.publicity === "many")} 고소인 외 여러 명이 위 내용을 듣거나 볼 수 있었습니다.  ${box(v.publicity === "alone")} 고소인만 해당 내용을 알 수 있었습니다.`,
    ),
    p(
      `⑥ 처벌 희망여부 : ${box(v.punish === "yes")} 피고소인에 대한 처벌을 원합니다.  ${box(v.punish === "no")} 피고소인에 대한 처벌을 원하지 않습니다.`,
    ),
    p(
      `⑦ 관련 민사소송 유무 : ${box(v.civil === "yes")} 현재 관련 사건에 대한 민사소송 중입니다.  ${box(v.civil === "no")} 민사소송 중에 있지 않습니다.`,
    ),
    p(`⑧ 제출 예정인 증거자료 : ${picks(HARM_EVIDENCE, (x) => kinds.includes(x))}`),
    blank,
    heading("4. 모욕·명예훼손 고소 관련 체크리스트"),
    ...HARM_CHECKLIST.map(([group, key, question]) =>
      p(
        `[${group}] ${question}  예 ${box(v[key] === "yes")} / 아니오 ${box(v[key] === "no")} / 모름 ${box(v[key] === "unknown")}`,
      ),
    ),
    blank,
    ...pledgeBlocks(v),
  ];
}

/** 경찰 고소장(표준)의 공통 틀: 고소취지 → 범죄사실 → 고소이유 → 증거자료 → 관련사건 → 진실확약 */
function standardComplaint(
  v: V,
  opts: { head: string; crime: string; accusedExtra?: Block[]; facts: Block[] },
): Block[] {
  const evidence = listOf(v.evidence);
  return [
    title(opts.head),
    blank,
    heading("1. 고소인"),
    ...complainantBlocks(v),
    blank,
    heading("2. 피고소인"),
    ...accusedBlocks(v),
    ...(opts.accusedExtra ?? []),
    blank,
    heading("3. 고소취지"),
    p(`고소인은 피고소인을 ${opts.crime}로 고소하오니 처벌하여 주시기 바랍니다.`),
    blank,
    heading("4. 범죄사실"),
    ...opts.facts,
    blank,
    heading("5. 고소이유"),
    ...lines(v.detail),
    blank,
    heading("6. 증거자료"),
    p(
      evidence.length
        ? "■ 고소인은 고소인의 진술 외에 제출할 증거가 있습니다."
        : "■ 고소인은 고소인의 진술 외에 제출할 증거가 없습니다.",
    ),
    ...numbered(evidence),
    blank,
    heading("7. 관련사건의 수사 및 재판 여부"),
    p(
      `① 중복 고소 여부 : 본 고소장과 같은 내용의 고소장을 다른 검찰청 또는 경찰서에 제출하거나 제출하였던 사실이 ${pair(v.duplicate, "있습니다", "없습니다")}`,
    ),
    p(
      `② 관련 형사사건 수사 유무 : 본 고소장에 기재된 범죄사실과 관련된 사건 또는 공범에 대하여 검찰청이나 경찰서에서 ${pair(v.relatedCriminal, "수사 중에 있습니다", "수사 중에 있지 않습니다")}`,
    ),
    p(
      `③ 관련 민사소송 유무 : 본 고소장에 기재된 범죄사실과 관련된 사건에 대하여 법원에서 ${pair(v.relatedCivil, "민사소송 중에 있습니다", "민사소송 중에 있지 않습니다")}`,
    ),
    blank,
    ...pledgeBlocks(v),
  ];
}

/** 고소장(표준) — 중고거래 사기 */
export function tradeFraudComplaint(v: V): Block[] {
  const where = v.accusedSite ? `${v.accusedSite}에서 ` : "";
  const when = v.postDate ? `${formatDate(v.postDate)} ` : "";
  const account = v.accusedAccount ? `(${v.accusedAccount})` : "";
  const after = TRADE_AFTER.find((t) => t.value === v.after)?.sentence ?? "";
  return standardComplaint(v, {
    head: "고    소    장",
    crime: "사기죄",
    accusedExtra: [p(`계좌번호  ${orBlank(v.accusedAccount)}`)],
    facts: [
      p(`고소인은 ${when}${where}'${v.item}' 판매 글을 보고 피고소인과 연락하였습니다.`),
      p("피고소인은 고소인에게 다음과 같이 말하였습니다."),
      ...lines(v.said),
      p(
        `고소인은 ${formatDate(v.payDate)} 피고소인이 알려 준 계좌${account}로 금 ${formatWon(v.payAmount)}원을 보냈습니다.`,
      ),
      ...(after ? [p(after)] : []),
      ...(v.lastContact
        ? [p(`고소인은 ${formatDate(v.lastContact)} 이후 피고소인과 연락이 되지 않습니다.`)]
        : []),
    ],
  });
}

/** 고소장(표준) — 통신매체이용음란 */
export function obscenityComplaint(v: V): Block[] {
  const medium = OBSCENITY_MEDIA.find((m) => m.value === v.medium)?.label ?? "통신 수단";
  const when = v.incidentDate ? `${formatDate(v.incidentDate)} ` : "";
  return standardComplaint(v, {
    head: "고    소    장",
    crime: "성폭력범죄의 처벌 등에 관한 특례법 위반(통신매체이용음란)죄",
    facts: [
      // 조사("을/를")를 붙이지 않게 수단은 따로 적고, 전화·음성은 '보냈다'가 아니라 '말하였다'로 쓴다
      p(
        v.medium === "call"
          ? `피고소인은 ${when}고소인에게 다음과 같은 말을 하였습니다. (수단: ${medium})`
          : `피고소인은 ${when}고소인에게 다음과 같은 내용을 보냈습니다. (수단: ${medium})`,
      ),
      ...lines(v.content),
    ],
  });
}

/** 법원 [민사] 답변서 */
export function answer(v: V): Block[] {
  const evidence = listOf(v.evidence);
  const aim: Block[] =
    v.stance === "reject"
      ? [
          ...numbered(["원고의 청구를 기각한다.", "소송비용은 원고가 부담한다."]),
          p("라는 판결을 구합니다."),
        ]
      : v.stance === "accept"
        ? [p("원고의 청구를 인정합니다.")]
        : lines(v.aimDetail);
  return [
    title("답    변    서"),
    blank,
    p(`사    건  ${v.caseNumber}`),
    blank,
    p(`원    고  이름: ${v.plaintiffName}`),
    p(`          주소: ${orBlank(v.plaintiffAddress)}`),
    p(`피    고  이름: ${v.defendantName}  ${RRN}`),
    p(`          주소: ${v.defendantAddress}  (연락 가능한 전화번호 ${orBlank(v.defendantPhone)})`),
    blank,
    p("위 사건에 관하여 피고는 다음과 같이 답변합니다."),
    blank,
    heading("청구취지에 대한 답변"),
    ...aim,
    blank,
    heading("청구원인에 대한 답변"),
    ...lines(v.causeAnswer),
    ...(evidence.length
      ? [blank, heading("증거방법에 관한 의견 및 붙이는 자료"), ...numbered(evidence)]
      : []),
    blank,
    signDate(v),
    right(`피고  ${v.defendantName}  (서명 또는 날인)`),
    blank,
    p(`${v.court} 귀중`),
  ];
}

/** 법원 지급명령에 대한 이의신청서 */
export function orderObjection(v: V): Block[] {
  return [
    title("지급명령에 대한 이의신청서"),
    blank,
    p(`사    건  ${v.caseNumber}`),
    p(`채 권 자  ${v.creditorName}`),
    p(`채 무 자  ${v.debtorName}`),
    p(`주    소  ${v.debtorAddress}`),
    blank,
    p(
      `위 독촉사건에 관하여 채무자는 ${formatDate(v.servedOn)} 지급명령정본을 송달받았으나 이에 불복하여 이의신청을 합니다.`,
    ),
    blank,
    signDate(v),
    right(`이의신청인(채무자)  ${v.debtorName}  (서명 또는 날인)`),
    right(`연락 가능한 전화번호  ${orBlank(v.debtorPhone)}`),
    blank,
    p(`${v.court} 귀중`),
  ];
}

/** 법원 이행권고결정에 대한 이의신청서 */
export function decisionObjection(v: V): Block[] {
  return [
    title("이행권고결정에 대한 이의신청서"),
    blank,
    p(`사    건  ${v.caseNumber}`),
    p(`원    고  ${v.plaintiffName}`),
    p(`피    고  ${v.defendantName}`),
    blank,
    p(
      `이 사건에 관하여 신청인은 ${formatDate(v.servedOn)} 이행권고결정을 송달받았으나, 이에 대하여 이의를 신청합니다.`,
    ),
    blank,
    signDate(v),
    right(`이의신청인 피고  ${v.defendantName}  (서명 또는 날인)`),
    right(`연락 가능한 전화번호  ${orBlank(v.defendantPhone)}`),
    blank,
    p(`${v.court} 귀중`),
  ];
}
