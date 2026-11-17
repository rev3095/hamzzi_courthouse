// 노동 타임라인 서식 (DEC-025 3차): 임금체불 진정서·간이대지급금 지급청구서·부당해고 구제신청서·재심신청서.
// 진정서: 고용노동부 노동포털 온라인 작성 화면 안내 항목(공식 서식 파일 미확인 — docs/research/05 5절).
// 간이대지급금: 「임금채권보장법 시행규칙」 별지 제3호의2서식. 구제신청: 「노동위원회규칙」 제39조·별지 제9호서식.
// 재심: 「노동위원회규칙」 재심 절차(부당해고등 구제 재심 신청서). 판정·지급 결과를 예측하지 않는다(절대 규칙 2).
// 숫자는 사용자가 적은 값만 쓴다. 대지급금은 상한액이 고시로 정해져 코드가 셈하지 않는다(절대 규칙 3).
import { OFFICIAL } from "@/lib/procedure/steps";
import {
  address,
  LONG,
  name,
  phone,
  RRN_NOTICE,
  writtenOn,
  type DocumentSpec,
  type Field,
} from "../fields";

const WAGE_RULE_URL = "https://www.law.go.kr/법령/임금채권보장법시행규칙";
const NLRC_RULE_URL = "https://www.law.go.kr/행정규칙/노동위원회규칙";
const LAW_SOURCE = "법제처 국가법령정보센터";
const LABOR_PORTAL = "https://labor.moel.go.kr";

/** 간이대지급금 지급청구서 뒤쪽 공지사항 2 (서식 문구 그대로) */
export const WAGE_ADVANCE_NOTICE =
  "거짓이나 그 밖의 부정한 방법으로 대지급금을 지급받은 경우 「임금채권보장법」 제14조에 따라 그 대지급금의 전부 또는 일부를 환수하고, 거짓이나 그 밖의 부정한 방법으로 지급받은 대지급금의 5배 이하의 금액을 추가로 징수할 수 있으며, 같은 법 제28조제1항에 따라 3년 이하의 징역 또는 3천만원 이하의 벌금형을 받을 수 있습니다.";

const money = (key: string, label: string, help?: string, optional = false): Field => ({
  key,
  label,
  type: "money",
  max: 20,
  help,
  optional,
});
const date = (key: string, label: string, help?: string, optional = false): Field => ({
  key,
  label,
  type: "date",
  max: 10,
  help,
  optional,
});
const text = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type: "text",
  max: 100,
  ...extra,
});

const employer: Field[] = [
  text("companyName", "사업장 이름", { help: "근무한 회사·가게 이름이에요.", example: "○○식당" }),
  name("employerName", "대표자(사업주) 이름"),
  address("companyAddress", "사업장 주소"),
];

export const LABOR_SPECS = {
  "wage-petition": {
    kind: "wage-petition",
    title: "임금체불 진정서",
    stepLabel: "고용노동부 진정",
    intro:
      "받지 못한 임금·퇴직금을 사업주가 주도록 고용노동부(근로감독관)에 조사를 요청하는 문서예요.",
    tips: [
      "사업장 주소지를 맡는 지방고용노동관서에 내요. 고용노동부 노동포털에서 온라인으로도 낼 수 있어요.",
      "언제부터 언제까지 일했고, 어떤 임금을 얼마나 받지 못했는지 사실대로 적어요.",
      "근로계약서·급여명세서·통장 입금 내역·출퇴근 기록을 함께 준비해요.",
      "조사 일정과 결과는 담당 근로감독관의 안내를 따르세요.",
    ],
    links: [OFFICIAL.moelComplaint, OFFICIAL.moel],
    officialForms: [
      {
        name: "진정서(임금체불, 기타 근로기준 분야) — 노동포털 온라인 작성",
        source: "고용노동부 노동포털",
        url: LABOR_PORTAL,
      },
    ],
    basis: ["근로기준법 제36조(금품 청산)·제43조(임금 지급)", "근로감독관집무규정(신고사건 처리)"],
    draftFields: "진정 내용",
    fields: [
      name("petitionerName", "진정인 이름", "임금을 받지 못한 사람, 곧 나예요."),
      address("petitionerAddress", "진정인 주소"),
      phone("petitionerPhone", "진정인 연락처"),
      ...employer,
      { ...phone("employerPhone", "사업장 연락처"), help: "알면 적어요." },
      date("startDate", "입사일"),
      {
        key: "stillWorking",
        label: "지금도 일하고 있나요?",
        type: "choice",
        max: 10,
        defaultValue: "no",
        options: [
          { value: "no", label: "퇴사했어요" },
          { value: "yes", label: "아직 일하고 있어요" },
        ],
      },
      { ...date("endDate", "퇴사일"), when: { key: "stillWorking", value: "no" } },
      text("jobDuty", "맡은 일", { example: "주방 보조" }),
      {
        key: "contractType",
        label: "근로계약 방법",
        type: "choice",
        max: 10,
        defaultValue: "written",
        options: [
          { value: "written", label: "서면 근로계약서를 썼어요" },
          { value: "oral", label: "말로만 약속했어요" },
        ],
      },
      text("payday", "임금 지급일", { optional: true, example: "매월 ○일" }),
      money(
        "unpaidWage",
        "받지 못한 임금",
        "퇴직금을 뺀 임금 합계예요. 모르면 대략이 아니라 비워 두세요.",
        true,
      ),
      money("unpaidSeverance", "받지 못한 퇴직금", "해당 없거나 모르면 비워 두세요.", true),
      {
        key: "petitionDetail",
        label: "진정 내용",
        type: "textarea",
        max: LONG,
        help: "어떤 임금을 언제부터 받지 못했는지, 사업주에게 요청했을 때 어떻게 됐는지 시간 순서대로 사실만 적어요.",
        example: "○월분 임금을 지급일에 받지 못해 ○월 ○일 문자로 요청했지만 지급하지 않았습니다.",
      },
      {
        key: "evidence",
        label: "증거자료",
        type: "textarea",
        max: 1000,
        optional: true,
        help: "한 줄에 하나씩 적어요.",
        example: "근로계약서\n급여 입금 내역",
      },
      text("office", "제출할 고용노동관서", {
        max: 50,
        help: "사업장 주소지를 맡는 지방고용노동관서예요.",
        example: "○○지방고용노동청 ○○지청",
      }),
      writtenOn,
    ],
    pages: [
      {
        title: "진정인 (나)",
        help: RRN_NOTICE,
        fields: ["petitionerName", "petitionerAddress", "petitionerPhone"],
      },
      { title: "사업장", fields: ["companyName", "employerName", "companyAddress"] },
      { title: "사업장 연락처", fields: ["employerPhone"] },
      { title: "근무 기간", fields: ["startDate", "stillWorking", "endDate"] },
      { title: "일한 내용", fields: ["jobDuty", "contractType", "payday"] },
      { title: "받지 못한 금액", fields: ["unpaidWage", "unpaidSeverance"] },
      { title: "진정 내용", fields: ["petitionDetail"] },
      { title: "증거자료", fields: ["evidence"] },
      { title: "제출처·작성일", fields: ["office", "writtenOn"] },
    ],
  },

  "wage-advance": {
    kind: "wage-advance",
    title: "간이대지급금 지급청구서",
    stepLabel: "대지급금 또는 민사 절차",
    intro:
      "사업주에게 받지 못한 임금·퇴직금의 일부를 나라(근로복지공단)가 먼저 지급해 달라고 청구하는 문서예요. 체불 임금등·사업주 확인서나 판결 등이 있어야 해요.",
    tips: [
      "근로복지공단 지역본부·지사에 내요. 청구할 수 있는 기간이 정해져 있으니 서식 뒤쪽 안내와 공단 안내를 확인하세요.",
      "금액은 판결이나 체불 임금등·사업주 확인서에 적힌 금액과 맞춰 적어요.",
      "지급받을 대지급금에는 고시로 정한 상한이 있어서 공단이 최종 금액을 정해요.",
      "입금 계좌와 주민등록번호는 이 화면에서 받지 않아요. 내보낸 문서에 직접 적으세요.",
    ],
    links: [OFFICIAL.comwel, OFFICIAL.klac],
    officialForms: [
      {
        name: "간이대지급금 지급청구서 (임금채권보장법 시행규칙 별지 제3호의2서식)",
        source: LAW_SOURCE,
        url: WAGE_RULE_URL,
      },
    ],
    basis: ["임금채권보장법 제7조·제7조의2", "같은 법 시행규칙 제5조"],
    draftFields: "",
    officialNotice: {
      text: WAGE_ADVANCE_NOTICE,
      source: "임금채권보장법 시행규칙 별지 제3호의2서식 뒤쪽 공지사항 (2026-11-18 법제처 조회)",
    },
    fields: [
      name("claimantName", "청구인 이름"),
      address("claimantAddress", "청구인 주소"),
      phone("claimantPhone", "휴대전화번호"),
      { ...text("claimantEmail", "전자우편주소", { optional: true }) },
      date("workFrom", "근무 시작일"),
      date("workTo", "근무 마지막 날", "재직 중이면 진정·소송을 낸 날까지 적어요."),
      {
        key: "claimantStatus",
        label: "청구 구분 (퇴직·재직)",
        type: "choice",
        max: 10,
        defaultValue: "retired",
        options: [
          { value: "retired", label: "퇴직자 대지급금 청구" },
          { value: "employed", label: "재직자 대지급금 청구" },
        ],
      },
      {
        key: "claimBasis",
        label: "청구 구분 (근거 서류)",
        type: "choice",
        max: 20,
        defaultValue: "certificate",
        options: [
          { value: "judgment", label: "판결등에 따른 청구" },
          { value: "certificate", label: "체불 임금등ㆍ사업주 확인서에 따른 청구" },
        ],
      },
      money(
        "totalUnpaid",
        "지급받지 못한 임금등의 총 확정금액",
        "판결이나 확인서에 적힌 금액이에요.",
      ),
      money(
        "alreadyPaid",
        "청구일까지 사업주 등에게서 받은 금액",
        "받은 돈이 없으면 비워 두세요.",
        true,
      ),
      {
        key: "pensionPending",
        label: "앞으로 퇴직연금사업자에게서 받을 퇴직연금이 있나요?",
        type: "choice",
        max: 10,
        defaultValue: "no",
        options: [
          { value: "yes", label: "예" },
          { value: "no", label: "아니오" },
        ],
      },
      {
        key: "insurancePending",
        label: "외국인 근로자 출국만기보험 등으로 받을 보험금이 있나요?",
        type: "choice",
        max: 10,
        defaultValue: "no",
        options: [
          { value: "yes", label: "예" },
          { value: "no", label: "아니오" },
        ],
      },
      money(
        "unpaidRecentWage",
        "⑤-가 칸: 임금·휴업수당·출산전후휴가기간 중 급여 가운데 못 받은 금액",
        "기간 기준은 서식 ⑤-가 칸 문구와 뒤쪽 작성방법을 따라요. 문서에는 서식 문구가 그대로 들어가요.",
        true,
      ),
      money(
        "unpaidRecentSeverance",
        "⑤-나 칸: 퇴직급여등 가운데 못 받은 금액 (퇴직자)",
        "기간 기준은 서식 ⑤-나 칸 문구와 뒤쪽 작성방법을 따라요.",
        true,
      ),
      {
        key: "notifyBy",
        label: "지급 결정 통지 방법",
        type: "choice",
        max: 10,
        defaultValue: "sms",
        options: [
          { value: "sms", label: "문자메시지" },
          { value: "mail", label: "우편" },
        ],
      },
      ...employer,
      {
        key: "office",
        label: "제출할 근로복지공단 지역본부(지사)",
        type: "text",
        max: 50,
        example: "○○지역본부",
      },
      writtenOn,
    ],
    pages: [
      {
        title: "청구인 (나)",
        help: RRN_NOTICE,
        fields: ["claimantName", "claimantAddress"],
      },
      { title: "연락처", fields: ["claimantPhone", "claimantEmail"] },
      { title: "① 근무기간", fields: ["workFrom", "workTo"] },
      { title: "② 청구 구분", fields: ["claimantStatus", "claimBasis"] },
      { title: "③·④ 확정금액과 받은 금액", fields: ["totalUnpaid", "alreadyPaid"] },
      { title: "④ 앞으로 받을 돈", fields: ["pensionPending", "insurancePending"] },
      { title: "⑤ 지급받지 못한 금액", fields: ["unpaidRecentWage", "unpaidRecentSeverance"] },
      {
        title: "⑦ 통지 방법",
        help: "⑥ 지급받을 대지급금과 ⑧ 입금 계좌는 공단 기준·본인 확인이 필요해 빈칸으로 남겨요.",
        fields: ["notifyBy"],
      },
      { title: "⑨ 대상 사업주", fields: ["companyName", "employerName", "companyAddress"] },
      { title: "제출처·작성일", fields: ["office", "writtenOn"] },
    ],
  },

  "dismissal-remedy": {
    kind: "dismissal-remedy",
    title: "부당해고 구제신청서",
    stepLabel: "노동위원회 구제신청",
    intro:
      "해고가 부당하다고 생각할 때 지방노동위원회에 구제(원직 복직 등)를 신청하는 문서예요. 노동위원회규칙의 기재사항을 따랐어요.",
    tips: [
      "근로자가 일하는 사업장 주소지를 맡는 지방노동위원회에 내요. 방문·우편·온라인으로 낼 수 있어요.",
      "신청할 수 있는 기간이 정해져 있어요. 해고된 날부터 계산하니 노동위원회 안내를 바로 확인하세요.",
      "신청이유에는 해고 경위와 부당하다고 생각하는 이유, 해고통지서를 받은 날을 적어요.",
      "해고통지서·근로계약서 사본을 함께 준비해요.",
    ],
    links: [OFFICIAL.nlrc],
    officialForms: [
      {
        name: "부당해고 등 구제신청서 (노동위원회규칙 별지 제9호서식)",
        source: `${LAW_SOURCE} (노동위원회규칙)`,
        url: NLRC_RULE_URL,
      },
    ],
    basis: [
      "근로기준법 제28조(부당해고등의 구제신청)",
      "노동위원회규칙 제39조(구제신청서의 기재사항)",
    ],
    draftFields: "신청이유",
    fields: [
      name("workerName", "근로자(신청인) 이름"),
      address("workerAddress", "근로자 주소"),
      phone("workerPhone", "근로자 연락처"),
      ...employer,
      text("workplace", "근무한 사업장 (본사와 다를 때)", {
        optional: true,
        help: "본점·본사가 아닌 지점에서 일했다면 그 사업장 이름·주소를 적어요.",
      }),
      date("hireDate", "입사일"),
      date("dismissalDate", "해고일"),
      date(
        "noticeDate",
        "해고통지서를 받은 날",
        "노동위원회규칙이 신청이유에 적도록 정한 날짜예요.",
      ),
      {
        key: "remedyAim",
        label: "구제받고자 하는 사항 (신청취지)",
        type: "choice",
        max: 10,
        defaultValue: "reinstate",
        options: [
          { value: "reinstate", label: "원직 복직과 해고 기간 임금 상당액 지급" },
          { value: "compensate", label: "원직 복직 대신 금전보상" },
        ],
      },
      {
        key: "reason",
        label: "신청이유",
        type: "textarea",
        max: LONG,
        help: "해고된 경위와 부당하다고 생각하는 이유를 사실대로 적어요.",
        example: "○월 ○일 대표가 말로 해고를 알렸고, 해고 사유를 서면으로 받지 못했습니다.",
      },
      {
        key: "commission",
        label: "제출할 노동위원회",
        type: "text",
        max: 50,
        example: "○○지방노동위원회",
      },
      writtenOn,
    ],
    pages: [
      {
        title: "근로자 (나)",
        help: RRN_NOTICE,
        fields: ["workerName", "workerAddress", "workerPhone"],
      },
      { title: "사업주", fields: ["companyName", "employerName", "companyAddress"] },
      { title: "근무한 사업장", fields: ["workplace"] },
      { title: "입사·해고", fields: ["hireDate", "dismissalDate", "noticeDate"] },
      { title: "신청취지", fields: ["remedyAim"] },
      { title: "신청이유", fields: ["reason"] },
      { title: "제출처·신청일", fields: ["commission", "writtenOn"] },
    ],
  },

  "dismissal-review": {
    kind: "dismissal-review",
    title: "부당해고 구제 재심신청서",
    stepLabel: "재심 (중앙노동위원회)",
    intro:
      "지방노동위원회의 초심 판정에 불복할 때 중앙노동위원회에 다시 판단해 달라고 신청하는 문서예요.",
    tips: [
      "재심을 신청할 수 있는 기간이 짧아요. 판정서를 받은 날부터 계산하니 판정서 안내를 바로 확인하세요.",
      "초심에서 신청한 범위를 넘어 재심을 신청할 수는 없어요.",
      "초심 판정서 사본을 함께 준비해요.",
    ],
    links: [OFFICIAL.nlrc],
    officialForms: [
      {
        name: "부당해고등 구제 재심 신청서 (노동위원회규칙 별지 서식)",
        source: `${LAW_SOURCE} (노동위원회규칙)`,
        url: NLRC_RULE_URL,
      },
    ],
    basis: ["근로기준법 제31조(구제명령 등의 확정)", "노동위원회규칙 제89조(재심의 범위)"],
    draftFields: "재심신청 이유",
    fields: [
      name("applicantName", "재심신청인 이름"),
      address("applicantAddress", "재심신청인 주소"),
      phone("applicantPhone", "재심신청인 연락처"),
      name("respondentName", "재심피신청인 이름(사업주·대표자)"),
      text("respondentCompany", "재심피신청인 사업장 이름"),
      address("respondentAddress", "재심피신청인 주소"),
      text("firstCommission", "초심 지방노동위원회", { max: 50, example: "○○지방노동위원회" }),
      text("firstCaseNumber", "초심 사건번호", { max: 50, example: "○○○○부해○○○" }),
      date("decisionReceived", "초심 판정서를 받은 날"),
      {
        key: "reviewAim",
        label: "재심신청 취지",
        type: "textarea",
        max: 1000,
        help: "초심 판정 가운데 바꿔 달라는 부분을 적어요. 초심에서 신청한 범위를 넘을 수 없어요.",
        example: "초심 판정을 취소하고, 초심에서 구한 구제신청을 인정하는 판정을 구합니다.",
      },
      {
        key: "reviewReason",
        label: "재심신청 이유",
        type: "textarea",
        max: LONG,
        help: "초심 판정에서 다르게 보았다고 생각하는 사실과 그 근거를 적어요.",
      },
      writtenOn,
    ],
    pages: [
      {
        title: "재심신청인 (나)",
        help: RRN_NOTICE,
        fields: ["applicantName", "applicantAddress", "applicantPhone"],
      },
      {
        title: "재심피신청인",
        fields: ["respondentName", "respondentCompany", "respondentAddress"],
      },
      { title: "초심 사건", fields: ["firstCommission", "firstCaseNumber", "decisionReceived"] },
      { title: "재심신청 취지", fields: ["reviewAim"] },
      { title: "재심신청 이유", fields: ["reviewReason"] },
      { title: "신청일", fields: ["writtenOn"] },
    ],
  },
} satisfies Record<
  "wage-petition" | "wage-advance" | "dismissal-remedy" | "dismissal-review",
  DocumentSpec
>;
