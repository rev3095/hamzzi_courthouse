// 서식 채우기 — 입력값을 공식 서식 순서의 블록(제목·소제목·문단·정렬)으로 놓는다 (DEC-022·025).
// 신청취지·청구취지·신청이유의 기본 문장은 법원 서식·기재례의 고정 문장에 사용자가 적은 값만 넣는다.
// 숫자는 사용자가 적은 값(날짜·금액·이율)과 목록 번호뿐이다 — 이자·비용을 셈하지 않는다(독촉절차비용 합계는 사용자가 적은 두 값의 덧셈만).
import type { DocumentKind } from "@/lib/procedure/steps";

export type BlockKind = "title" | "heading" | "text" | "center" | "right" | "blank";
export type Block = { kind: BlockKind; text: string };

const title = (text: string): Block => ({ kind: "title", text });
const heading = (text: string): Block => ({ kind: "heading", text });
const p = (text: string): Block => ({ kind: "text", text });
const center = (text: string): Block => ({ kind: "center", text });
const right = (text: string): Block => ({ kind: "right", text });
const blank: Block = { kind: "blank", text: "" };

type V = Record<string, string>;

const BLANK_DATE = "        년      월      일";
const BLANK_SHORT_DATE = "      .      .      .";
const BLANK_WON = "                ";
const RRN = "(주민등록번호:              -              )";

/** "2026-03-01" → "2026. 3. 1." (사용자가 고른 날짜를 모양만 바꾼다) */
export function formatDate(iso: string | undefined, empty = BLANK_SHORT_DATE): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[1]}. ${+m[2]}. ${+m[3]}.` : empty;
}

/** "23000000" → "23,000,000" (사용자가 적은 금액에 쉼표만 넣는다) */
export function formatWon(digits: string | undefined, empty = BLANK_WON): string {
  return digits && /^\d+$/.test(digits) ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : empty;
}

/** 사용자가 적은 여러 줄 글 → 문단 블록 (빈 줄은 건너뛴다) */
const lines = (s: string | undefined): Block[] =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map(p);

/** 번호가 이미 붙은 줄이면 떼고 다시 매긴다 */
const numbered = (items: string[], from = 1): Block[] =>
  items.map((t, i) => p(`${from + i}. ${t.replace(/^\d+\s*[.)]\s*/, "")}`));

const party = (role: string, nameV: string, addr: string, phone?: string, rrn = true): Block[] => [
  p(`${role}  ${nameV}${rrn ? `  ${RRN}` : ""}`),
  p(`        주소  ${addr}`),
  ...(phone === undefined ? [] : [p(`        연락 가능한 전화번호  ${phone}`)]),
];

const picked = (v: string | undefined, labels: Record<string, string>): string[] =>
  (v ?? "")
    .split(",")
    .filter((k) => labels[k])
    .map((k) => labels[k]);

const signDate = (v: V) => center(v.writtenOn ? formatDate(v.writtenOn) : BLANK_DATE);

export function fillBlocks(
  kind: DocumentKind,
  v: V,
): { title: string; basename: string; blocks: Block[] } {
  switch (kind) {
    case "demand-letter":
      return { title: "내용증명", basename: "내용증명", blocks: demandLetter(v) };
    case "lease-registration":
      return {
        title: "주택임차권등기명령 신청서",
        basename: "주택임차권등기명령신청서",
        blocks: leaseRegistration(v),
      };
    case "payment-order":
      return { title: "지급명령 신청서", basename: "지급명령신청서", blocks: paymentOrder(v) };
    case "complaint":
      return { title: "소장", basename: "소장", blocks: complaint(v) };
  }
}

function demandLetter(v: V): Block[] {
  return [
    title("내 용 증 명"),
    blank,
    p(`제목: ${v.subject}`),
    blank,
    p(`보내는 사람: ${v.senderName}`),
    p(`주소: ${v.senderAddress}`),
    blank,
    p(`받는 사람: ${v.recipientName}`),
    p(`주소: ${v.recipientAddress}`),
    blank,
    heading("가. 있었던 일"),
    ...lines(v.facts),
    blank,
    heading("나. 요구하는 내용"),
    ...lines(v.demand),
    blank,
    heading("다. 기한"),
    p(`${v.deadline}까지 위 요구 사항에 대한 답변 또는 이행을 요청합니다.`),
    blank,
    signDate(v),
    right(`보내는 사람 ${v.senderName} (서명 또는 인)`),
  ];
}

const LEASE_ATTACHMENTS: Record<string, string> = {
  registry: "건물 등기사항전부증명서 (임대인이 법인이면 법인 등기사항전부증명서)",
  resident: "주민등록등·초본 (주소 변동 사항 포함)",
  contract: "임대차계약증서 사본 (확정일자 포함)",
  termination: "임대차계약 해지 통보 소명자료",
  drawing: "부동산 목록 및 도면",
};

const LEASE_END: Record<string, string> = {
  expired: "계약 기간이 끝났습니다",
  notice: "해지 통지에 따라 끝났습니다",
  agreed: "당사자 합의로 끝났습니다",
};

function leaseRegistration(v: V): Block[] {
  const rentText = v.rent ? `금 ${formatWon(v.rent)}원` : "없음";
  const reasons = [
    `신청인은 ${formatDate(v.contractDate)} 피신청인과 별지 목록 기재 건물에 관하여 임차보증금 ${formatWon(v.deposit)}원${v.rent ? `, 차임 ${formatWon(v.rent)}원` : ""}으로 하는 임대차계약을 체결하였습니다.`,
    `신청인은 ${formatDate(v.moveInDate)}부터 위 건물을 점유하고 ${formatDate(v.residentDate)} 주민등록(전입신고)을 마쳤습니다.${v.fixedDate ? ` 임대차계약증서에는 ${formatDate(v.fixedDate)} 확정일자를 받았습니다.` : ""}`,
    `위 임대차계약은 ${formatDate(v.endDate)} ${LEASE_END[v.endReason] ?? LEASE_END.expired}.`,
    `그러나 피신청인은 임차보증금 중 ${formatWon(v.unpaid)}원을 반환하지 않고 있습니다.`,
    ...(v.extraReason ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    "이에 신청인은 임차인으로서의 지위를 보전하기 위하여 이 신청을 합니다.",
  ];
  return [
    title("주택임차권등기명령 신청서"),
    blank,
    ...party("신청인(임차인)", v.applicantName, v.applicantAddress, v.applicantPhone ?? ""),
    ...party("피신청인(임대인)", v.landlordName, v.landlordAddress, undefined, false),
    blank,
    heading("신 청 취 지"),
    p("별지 목록 기재 건물에 관하여 다음과 같은 주택임차권등기를 명한다는 결정을 구합니다."),
    center("다      음"),
    p(`1. 임대차계약일자 : ${formatDate(v.contractDate)}`),
    p(`2. 임차보증금액 : 금 ${formatWon(v.deposit)}원,  차임 : ${rentText}`),
    p(`3. 주민등록일자 : ${formatDate(v.residentDate)}`),
    p(`4. 임차범위 : ${v.leaseScope}`),
    p(`5. 점유개시일자 : ${formatDate(v.moveInDate)}`),
    p(`6. 확정일자 : ${formatDate(v.fixedDate)}`),
    blank,
    heading("신 청 이 유"),
    ...numbered(reasons),
    blank,
    heading("첨 부 서 류"),
    ...numbered(picked(v.attachments, LEASE_ATTACHMENTS)),
    blank,
    signDate(v),
    right(`신청인  ${v.applicantName}  (서명 또는 날인)`),
    blank,
    p(`${v.court} 귀중`),
    blank,
    heading("별지  부동산의 표시"),
    ...lines(v.propertyAddress),
    p(`임차범위 : ${v.leaseScope}`),
  ];
}

const ORDER_ATTACHMENTS: Record<string, string> = {
  contract: "계약서·차용증 사본",
  transfer: "송금·계좌 이체 내역",
  notice: "내용증명 사본",
  messages: "문자·메신저 대화 내용",
};

/** 이자 문장의 시작일 */
function interestStart(v: V, served: string): string {
  return v.interestFrom === "date" ? formatDate(v.interestDate) : served;
}

function paymentOrder(v: V): Block[] {
  const fees =
    v.feeDelivery && v.feeStamp
      ? formatWon(String(Number(v.feeDelivery) + Number(v.feeStamp)))
      : BLANK_WON;
  const attachments = [
    ...picked(v.attachments, ORDER_ATTACHMENTS),
    ...(v.attachmentsExtra ? [v.attachmentsExtra] : []),
  ];
  return [
    title("지급명령 신청서"),
    blank,
    ...party("채 권 자", v.creditorName, v.creditorAddress, v.creditorPhone ?? ""),
    ...party("채 무 자", v.debtorName, v.debtorAddress, v.debtorPhone ?? "", false),
    blank,
    heading("청 구 취 지"),
    p("채무자는 채권자에게 아래 청구금액 및 독촉절차비용을 지급하라는 명령을 구합니다."),
    p(`1. 금 ${formatWon(v.claimAmount)}원`),
    ...(v.interestRate
      ? [
          p(
            `2. 위 1항 금액에 대하여 ${interestStart(v, "이 사건 지급명령정본이 송달된 다음 날")}부터 다 갚는 날까지 연 ${v.interestRate}%의 비율로 계산한 돈`,
          ),
        ]
      : []),
    blank,
    p(
      `독촉절차비용  금 ${fees}원 (내역: 송달료 ${formatWon(v.feeDelivery)}원, 인지대 ${formatWon(v.feeStamp)}원)`,
    ),
    blank,
    heading("청 구 원 인"),
    ...lines(v.claimCause),
    blank,
    heading("첨 부 서 류"),
    ...numbered(attachments),
    blank,
    signDate(v),
    right(`채권자  ${v.creditorName}  (서명 또는 날인)`),
    blank,
    p(`${v.court} 귀중`),
  ];
}

const COMPLAINT_ATTACHMENTS: Record<string, string> = {
  fee: "소송비용(인지, 송달료) 납부서",
  proof: "위 입증서류",
  copy: "소장 부본",
};

function complaint(v: V): Block[] {
  const interest = v.interestRate
    ? ` 및 이에 대하여 ${interestStart(v, "소장 부본 송달 다음 날")}부터 다 갚는 날까지 연 ${v.interestRate}%의 비율로 계산한 돈`
    : "";
  const aims = [
    `피고는 원고에게 금 ${formatWon(v.claimAmount)}원${interest}을 지급하라.`,
    "소송비용은 피고가 부담한다.",
    ...(v.provisional === "no" ? [] : ["제1항은 가집행할 수 있다."]),
  ];
  return [
    title("소      장"),
    blank,
    p(`사 건 명  ${v.caseName}`),
    blank,
    ...party("원    고", v.plaintiffName, v.plaintiffAddress, v.plaintiffPhone ?? ""),
    ...party("피    고", v.defendantName, v.defendantAddress, v.defendantPhone ?? ""),
    blank,
    p(
      `소송목적의 값  금 ${BLANK_WON}원    인지  금 ${BLANK_WON}원    예납 송달료  금 ${BLANK_WON}원`,
    ),
    blank,
    heading("청 구 취 지"),
    ...numbered(aims),
    p("라는 판결을 구합니다."),
    blank,
    heading("청 구 원 인"),
    ...lines(v.claimCause),
    blank,
    heading("입 증 방 법"),
    ...lines(v.evidence),
    blank,
    heading("첨 부 서 류"),
    ...numbered(picked(v.attachments, COMPLAINT_ATTACHMENTS)),
    blank,
    signDate(v),
    right(`원고  ${v.plaintiffName}  (서명 또는 날인)`),
    blank,
    p(`${v.court} 귀중`),
  ];
}
