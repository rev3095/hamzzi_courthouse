// 전문 에이전트(고소미·중고천국) 갈래에 붙는 서식 (사용자 요청 2026-11-26). 공식 양식의 항목 순서를 따른다 —
// 내려받아 대조한 양식(2026-11-26, docs/research/05 8절):
// - 고소장 3종: 경찰청 경찰민원24 민원 서식 [수사] 간이고소장(모욕,명예훼손) · [수사] 고소장(표준, 중고거래 사기·통신매체이용음란에 씀)
// - 받은 쪽 민사 3종: 법원 전자민원센터 양식모음 [민사] 답변서 · 지급명령에 대한 이의신청서(A2335) · 이행권고결정에 대한 이의신청서(A2412-1)
// - 고소당한 쪽 형사 2종: 경찰청 경찰민원24 민원 서식 [수사] 합의서 · [수사] 고소취소장 (둘 다 피해자·고소인이 서명하는 문서)
// 고소장은 진실확약(무고 서약)이 붙는 문서라 AI 초안(DEC-023)을 쓰지 않는다. 수사·재판 결과를 예측하지 않는다(절대 규칙 2).
// 기간 숫자는 우리가 쓰지 않고, 공식 양식의 유의 사항 문장을 출처와 함께 그대로 인용한다(officialNotice, 절대 규칙 3).
// 참고한 민간 예시(중고거래 사기 고소장)에서는 범죄사실에 넣을 '사실 항목'만 반영했고 문장·틀은 옮기지 않았다.
import { OFFICIAL } from "@/lib/procedure/steps";
import {
  address,
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
import { FALSE_ACCUSATION_PLEDGE } from "./criminal";

const POLICE_FORMS = "https://minwon24.police.go.kr/cvlcpt/cvlcptTmpltGdList.do";
const POLICE_SOURCE = "경찰청 경찰민원24 민원 서식";

/** 법원 [민사] 답변서 양식의 유의 사항 3 (그대로) */
export const ANSWER_NOTICE =
  "「청구의 취지에 대한 답변」에는 원고의 청구에 응할 수 있는지 여부를 분명히 밝혀야 하며, 「청구의 원인에 대한 답변」에는 원고가 소장에서 주장하는 사실을 인정하는지 여부를 개별적으로 밝히고, 인정하지 아니하는 사실에 관하여는 그 사유를 개별적으로 적어야 합니다.";
/** 법원 지급명령에 대한 이의신청서 양식의 유의 사항 2 (그대로) */
export const ORDER_OBJECTION_NOTICE =
  "채무자는 지급명령 정본을 송달받은 날로부터 2주 이내에 이의신청서를 제출하는 것과 별도로 지급명령의 신청원인에 대한 구체적인 진술을 적은 답변서를 함께 제출하거나 늦어도 지급명령 정본을 송달받은 날부터 30일 이내에 제출하여야 합니다.";
/** 법원 이행권고결정에 대한 이의신청서 양식의 유의 사항 1·2 (그대로) */
export const DECISION_OBJECTION_NOTICE =
  "결정을 송달받은 날로부터 2주 안에 이의신청서를 제출하지 않으면 이의신청이 각하될 수 있습니다(소액사건심판법 제5조의4제1항, 제5조의5제1항). 이행권고결정에 대하여 이의신청서를 제출하였더라도 이와 별도로 답변서를 제출하여야 합니다. 답변서는 이의신청서와 함께 제출하거나 늦어도 이행권고결정을 송달받은 날부터 30일 안에 제출하여야 합니다.";

/** 모르면 '모름' — 문서에는 어느 쪽도 표시하지 않는다 (모르는 사실이 서약 아래 확정 진술로 바뀌지 않게) */
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

/** 간이고소장 체크리스트 한 줄 (예/아니오/모름) */
const check = (key: string, label: string): Field => ({
  key,
  label,
  type: "choice",
  max: 10,
  defaultValue: "unknown",
  options: [
    { value: "yes", label: "예" },
    { value: "no", label: "아니오" },
    { value: "unknown", label: "모름" },
  ],
});

const complainant: Field[] = [
  name("complainantName", "고소인 이름", "피해를 입은 사람, 곧 나예요."),
  address("complainantAddress", "고소인 주소"),
  phone("complainantPhone", "고소인 연락처"),
];
const accused: Field[] = [
  { ...name("accusedName", "피고소인 이름", "상대방 이름을 알면 적어요."), optional: true },
  {
    ...address("accusedAddress", "피고소인 주소"),
    optional: true,
    help: "알면 적고, 모르면 비워 두세요.",
  },
  { ...phone("accusedPhone", "피고소인 연락처"), help: "알면 적고, 모르면 비워 두세요." },
];
const accusedOnline = (siteLabel: string, siteExample: string): Field[] => [
  {
    key: "accusedSite",
    label: siteLabel,
    type: "text",
    max: 100,
    optional: true,
    example: siteExample,
  },
  {
    key: "accusedId",
    label: "상대방 아이디·닉네임",
    type: "text",
    max: 100,
    optional: true,
    help: "화면에 보이는 그대로 적어요. 바뀌기 전 닉네임도 알면 함께 적어요.",
  },
];
const evidence = (example: string): Field => ({
  key: "evidence",
  label: "증거자료",
  type: "textarea",
  max: LONG,
  optional: true,
  help: "낼 증거를 한 줄에 하나씩 적어요.",
  example,
});
const related: Field[] = [
  yesNo(
    "duplicate",
    "같은 내용으로 다른 경찰서·검찰청에 고소한 적",
    "있어요",
    "없어요",
    "경찰 고소장 서식에서 표시하도록 정한 칸이에요.",
  ),
  yesNo("relatedCriminal", "관련 사건이 수사 중인지", "수사 중이에요", "수사 중이 아니에요"),
  yesNo("relatedCivil", "관련 민사소송이 진행 중인지", "소송 중이에요", "소송 중이 아니에요"),
];
const pledge: Field = {
  key: "pledge",
  label: "진실확약",
  type: "checks",
  max: 10,
  help: "경찰 고소장 서식의 문구예요. 확인하고 체크해야 다음으로 넘어가요.",
  options: [{ value: "agree", label: FALSE_ACCUSATION_PLEDGE }],
};
const station: Field[] = [
  {
    key: "policeStation",
    label: "제출할 경찰서",
    type: "text",
    max: 50,
    help: "가까운 경찰서에 낼 수 있어요.",
    example: "○○경찰서",
  },
  { ...writtenOn, help: "고소장을 내는 날이에요. 비워 두면 직접 적을 수 있어요." },
];
const pledgeNotice = {
  text: FALSE_ACCUSATION_PLEDGE,
  source: "경찰청 고소장 서식 (고소내용에 대한 진실확약)",
};
const COMPLAINT_TIPS = [
  "직접 겪거나 자료로 확인한 사실만 적어요. 추측은 추측이라고 밝혀요.",
  "상대방의 이름·주소를 모르면 아이디·닉네임처럼 아는 정보만 적어도 돼요.",
  "고소장은 가까운 경찰서 민원실에 낼 수 있어요. 수사 진행은 수사기관 안내를 따르세요.",
];

/** 간이고소장(모욕,명예훼손) ② 피해를 당한 장소 (서식 표기 그대로) */
export const HARM_PLACES: { value: string; label: string }[] = [
  { value: "heard", label: "직접 들음" },
  { value: "internet", label: "인터넷" },
  { value: "messenger", label: "메신저(카카오톡, 라인 등)" },
  { value: "game", label: "게임챗팅" },
  { value: "book", label: "출판물(책)" },
  { value: "flyer", label: "전단지, 벽보, 현수막 등" },
  { value: "etc", label: "기타" },
];
/** ③ 피해 사실을 알게된 방법 (서식 표기 그대로) */
export const HARM_KNOWN: { value: string; label: string }[] = [
  { value: "heard", label: "직접 들음" },
  { value: "saw", label: "직접 목격함(출판물, 인터넷 댓글 등)" },
  { value: "told", label: "지인이 알려줌" },
  { value: "etc", label: "기타" },
];
/** ⑧ 제출 예정인 증거자료 (서식 표기 그대로) */
export const HARM_EVIDENCE: { value: string; label: string }[] = [
  { value: "video", label: "모욕 영상(사진)" },
  { value: "witness", label: "목격자 진술서" },
  { value: "none", label: "자료 없음" },
];
/** 4. 모욕·명예훼손 고소 관련 체크리스트: [구분, 칸 키, 서식의 질문 문구 그대로] */
export const HARM_CHECKLIST: [string, string, string][] = [
  ["피고소인과의 관계", "chkFamily", "피고소인이 가족 또는 친척인가요?"],
  ["피고소인과의 관계", "chkKnown", "피고소인이 아는 사이인가요?"],
  [
    "모욕/명예훼손 내용",
    "chkPointsToMe",
    "피고소인이 모욕(명예훼손)한 내용이 누가 들어도 고소인을 가리키는 말이었나요?",
  ],
  [
    "모욕/명예훼손 내용",
    "chkHarmsImage",
    "피고소인이 모욕(명예훼손)한 내용이 고소인의 이미지나 평가를 나쁘게 만들었나요?",
  ],
  ["공연성", "chkPublicPlace", "모욕(명예훼손)을 당한 장소가 공개적인 장소였나요?"],
  ["공연성", "chkOthersKnew", "피고소인이 모욕(명예훼손)한 내용을 다른 사람이 알게 되었나요?"],
  [
    "공연성",
    "chkAlone",
    "피고소인이 고소인과 1:1인 상황(단둘이 이야기하는 상황, 전화통화, 채팅방에 단둘이 있는 상황)에서 모욕(명예훼손)을 하였나요?",
  ],
  ["처벌 여부", "chkWithdraw", "추후 원만히 문제가 해결되는 경우 고소를 취소할 의사가 있나요?"],
  [
    "관련 수사",
    "chkFiledBefore",
    "과거 같은 내용의 고소장을 다른 경찰서나 검찰청에 제출한 사실이 있나요?",
  ],
  [
    "관련 수사",
    "chkWithdrewBefore",
    "과거 같은 내용의 고소를 취소하거나 처벌을 원하지 않는 다는 의사를 표현한 적이 있나요?",
  ],
];
/** 설문 화면의 체크리스트 칸 이름 (쉬운 말, 숫자 없이). 문서에는 서식의 질문 문구가 그대로 들어간다 */
const CHECK_LABEL: Record<string, string> = {
  chkFamily: "상대방이 가족이나 친척인가요?",
  chkKnown: "상대방이 아는 사이인가요?",
  chkPointsToMe: "누가 들어도 나를 가리키는 말이었나요?",
  chkHarmsImage: "그 말이 나에 대한 이미지나 평가를 나쁘게 만들었나요?",
  chkPublicPlace: "그 일이 있었던 곳이 공개적인 장소였나요?",
  chkOthersKnew: "그 내용을 다른 사람이 알게 되었나요?",
  chkAlone: "상대방과 단둘이 있는 상황(둘만의 대화·통화·채팅방)이었나요?",
  chkWithdraw: "나중에 원만히 해결되면 고소를 취소할 뜻이 있나요?",
  chkFiledBefore: "전에 같은 내용으로 다른 경찰서·검찰청에 고소장을 낸 적이 있나요?",
  chkWithdrewBefore: "전에 같은 내용의 고소를 취소하거나 처벌을 원하지 않는다고 한 적이 있나요?",
};

/** 중고거래 사기: 돈을 보낸 뒤 있었던 일 */
export const TRADE_AFTER: { value: string; label: string; sentence: string }[] = [
  {
    value: "none",
    label: "물건을 보내지 않았어요",
    sentence: "그 뒤 피고소인은 물건을 보내지 않았습니다.",
  },
  {
    value: "fake",
    label: "보냈다고 했지만 배송이 조회되지 않았어요",
    sentence: "그 뒤 피고소인은 물건을 보냈다고 하였으나 배송이 조회되지 않았습니다.",
  },
  {
    value: "different",
    label: "설명과 다른 물건이 왔어요",
    sentence: "그 뒤 피고소인이 보낸 것은 판매 글의 설명과 다른 물건이었습니다.",
  },
  {
    value: "noshow",
    label: "만나기로 한 곳에 나오지 않았어요",
    sentence: "그 뒤 피고소인은 만나기로 한 곳에 나오지 않았습니다.",
  },
  {
    value: "etc",
    label: "그 밖의 일 (아래 경위에 적을게요)",
    sentence: "그 뒤의 일은 아래 고소이유에 적었습니다.",
  },
];

/** 통신매체이용음란: 받은 수단 */
export const OBSCENITY_MEDIA: { value: string; label: string }[] = [
  { value: "messenger", label: "메신저" },
  { value: "game", label: "게임 채팅" },
  { value: "sns", label: "SNS 쪽지·댓글" },
  { value: "call", label: "전화·음성 대화" },
  { value: "mail", label: "우편·택배" },
  { value: "etc", label: "그 밖의 통신 수단" },
];

/** 답변서: 청구취지에 대한 답변 */
export const ANSWER_STANCES: { value: string; label: string }[] = [
  { value: "reject", label: "원고의 청구를 받아들일 수 없어요 (기각을 구해요)" },
  { value: "partial", label: "일부만 인정해요 (어디까지인지 직접 적을게요)" },
  { value: "accept", label: "원고의 청구를 모두 인정해요" },
];

const caseNumber = (example: string): Field => ({
  key: "caseNumber",
  label: "사건번호",
  type: "text",
  max: 40,
  help: "법원에서 온 서류 위쪽에 적혀 있어요. 적힌 그대로 옮겨요.",
  example,
});
const servedOn = (what: string): Field => ({
  key: "servedOn",
  label: `${what} 받은 날`,
  type: "date",
  max: 10,
  help: "우편으로 서류를 받은 날이에요. 이 날부터 기간을 세므로 정확히 적어요.",
});

export const ASSISTANT_SPECS = {
  "defamation-complaint": {
    kind: "defamation-complaint",
    title: "간이고소장 (모욕·명예훼손)",
    stepLabel: "고소·신고",
    intro:
      "욕설·모욕이나 명예훼손 피해를 수사기관에 알리고 처벌을 구하는 문서예요. 경찰청 간이고소장(모욕·명예훼손 등)의 항목 순서를 따랐어요.",
    tips: [
      ...COMPLAINT_TIPS,
      "상대방이 한 말이나 쓴 글은 고치지 말고 그대로 옮겨요. 화면은 주소와 날짜가 보이게 저장해요.",
      "여러 사람이 볼 수 있는 자리였는지, 누구를 가리키는지 알 수 있었는지를 서식에서 물어요. 아는 대로 표시하세요.",
      "피해가 여러 번이면 날짜별로 따로 적어 별지로 붙일 수 있어요.",
    ],
    links: [OFFICIAL.cyberPolice, OFFICIAL.police],
    officialForms: [
      { name: "[수사] 간이고소장(모욕,명예훼손)", source: POLICE_SOURCE, url: POLICE_FORMS },
      { name: "[수사] 간이고소장(별지)", source: POLICE_SOURCE, url: POLICE_FORMS },
    ],
    basis: [
      "형사소송법 제237조(고소의 방식)",
      "형법 제307조(명예훼손)·제311조(모욕)",
      "정보통신망 이용촉진 및 정보보호 등에 관한 법률 제70조",
      "형법 제156조(무고)",
    ],
    draftFields: "",
    officialNotice: pledgeNotice,
    fields: [
      ...complainant,
      ...accused,
      ...accusedOnline("사이트·SNS·게임 이름", "○○ 커뮤니티 / ○○ 게임"),
      {
        key: "incidentDate",
        label: "피해를 당한 날",
        type: "date",
        max: 10,
        optional: true,
        help: "정확한 날짜를 모르면 비워 두세요.",
      },
      {
        key: "placeType",
        label: "피해를 당한 곳",
        type: "choice",
        max: 10,
        options: HARM_PLACES,
      },
      {
        key: "placeDetail",
        label: "장소·사이트·게임 이름",
        type: "text",
        max: 100,
        optional: true,
        help: "어디에서 있었던 일인지 적어요. 게임이라면 게임 이름을 적어요.",
        example: "○○ 게임 채팅 / ○○ 카페 게시판",
      },
      {
        key: "howKnown",
        label: "피해 사실을 알게 된 방법",
        type: "choice",
        max: 10,
        options: HARM_KNOWN,
      },
      {
        key: "content",
        label: "상대방이 말하거나 쓴 내용",
        type: "textarea",
        max: LONG,
        help: "상대방이 말하거나 적은 내용을 고치지 말고 그대로 옮겨요.",
      },
      {
        key: "truth",
        label: "위 내용이 사실인지",
        type: "choice",
        max: 10,
        help: "서식에서 묻는 칸이에요. 직접 골라 주세요. 욕설처럼 사실 여부를 따질 수 없는 말이면 표시하지 않을 수 있어요.",
        options: [
          { value: "true", label: "사실입니다" },
          { value: "false", label: "사실이 아닙니다." },
          { value: "unknown", label: "모릅니다." },
          { value: "none", label: "표시하지 않을게요 (사실 여부를 따질 수 없는 말이에요)" },
        ],
      },
      {
        key: "publicity",
        label: "다른 사람도 볼 수 있었는지",
        type: "choice",
        max: 10,
        options: [
          { value: "many", label: "고소인 외 여러 명이 위 내용을 듣거나 볼 수 있었습니다." },
          { value: "alone", label: "고소인만 해당 내용을 알 수 있었습니다." },
        ],
      },
      {
        key: "punish",
        label: "처벌 희망 여부",
        type: "choice",
        max: 10,
        defaultValue: "yes",
        options: [
          { value: "yes", label: "피고소인에 대한 처벌을 원합니다." },
          { value: "no", label: "피고소인에 대한 처벌을 원하지 않습니다." },
        ],
      },
      {
        key: "civil",
        label: "관련 민사소송이 진행 중인지",
        type: "choice",
        max: 10,
        defaultValue: "unknown",
        options: [
          { value: "yes", label: "현재 관련 사건에 대한 민사소송 중입니다." },
          { value: "no", label: "민사소송 중에 있지 않습니다." },
          { value: "unknown", label: "잘 모르겠어요 (표시하지 않고, 낼 때 경찰서에 말할게요)" },
        ],
      },
      {
        key: "evidenceKinds",
        label: "낼 예정인 증거자료",
        type: "checks",
        max: 30,
        optional: true,
        help: "자료는 고소장 뒤에 붙이거나 나중에 조사받을 때 낼 수 있어요.",
        options: HARM_EVIDENCE,
      },
      ...HARM_CHECKLIST.map(([, key]) => check(key, CHECK_LABEL[key])),
      pledge,
      ...station,
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
      { title: "피고소인 — 온라인 정보", fields: ["accusedSite", "accusedId"] },
      { title: "언제·어디서", fields: ["incidentDate", "placeType", "placeDetail"] },
      { title: "알게 된 방법", fields: ["howKnown"] },
      { title: "상대방이 한 말·쓴 글", fields: ["content", "truth"] },
      { title: "다른 사람도 볼 수 있었는지", fields: ["publicity"] },
      { title: "처벌 희망·민사소송", fields: ["punish", "civil"] },
      { title: "증거자료", fields: ["evidenceKinds"] },
      {
        title: "확인 질문 — 상대방과의 관계",
        help: "경찰 서식의 체크리스트예요. 모르면 '모름'으로 두세요.",
        fields: ["chkFamily", "chkKnown"],
      },
      { title: "확인 질문 — 내용", fields: ["chkPointsToMe", "chkHarmsImage"] },
      {
        title: "확인 질문 — 공개된 자리였는지",
        fields: ["chkPublicPlace", "chkOthersKnew", "chkAlone"],
      },
      {
        title: "확인 질문 — 고소 이력",
        fields: ["chkWithdraw", "chkFiledBefore", "chkWithdrewBefore"],
      },
      { title: "진실확약", fields: ["pledge"] },
      { title: "제출처·작성일", fields: ["policeStation", "writtenOn"] },
    ],
  },

  "trade-fraud-complaint": {
    kind: "trade-fraud-complaint",
    title: "고소장 (중고거래 사기)",
    stepLabel: "고소·신고",
    intro:
      "온라인 중고거래에서 돈을 보내고 물건을 받지 못한 피해를 수사기관에 알리고 처벌을 구하는 문서예요. 경찰청 고소장(표준)의 항목 순서를 따랐어요.",
    tips: [
      ...COMPLAINT_TIPS,
      "판매 글, 대화, 이체 내역은 날짜가 보이게 저장해요. 글이나 계정이 지워지기 전에 먼저 보관하세요.",
      "온라인 거래 사기는 경찰청 사이버범죄 신고시스템으로도 신고할 수 있어요.",
      "고소만으로 돈이 돌아오지는 않아요. 피해금은 배상명령이나 민사 절차로 따로 청구해요.",
    ],
    links: [OFFICIAL.cyberPolice, OFFICIAL.police],
    officialForms: [
      { name: "[수사] 고소장", source: POLICE_SOURCE, url: POLICE_FORMS },
      { name: "[수사] 간이고소장(사기)", source: POLICE_SOURCE, url: POLICE_FORMS },
    ],
    basis: ["형사소송법 제237조(고소의 방식)", "형법 제347조(사기)", "형법 제156조(무고)"],
    draftFields: "",
    officialNotice: pledgeNotice,
    fields: [
      ...complainant,
      ...accused,
      ...accusedOnline("거래한 사이트·앱 이름", "○○마켓 / ○○ 카페"),
      {
        key: "accusedAccount",
        label: "돈을 보낸 계좌 (은행명·계좌번호)",
        type: "text",
        max: 100,
        optional: true,
        help: "상대방이 알려 준 입금 계좌예요. 이체 내역에 적힌 그대로 옮겨요.",
      },
      {
        key: "item",
        label: "거래한 물건",
        type: "text",
        max: 100,
        example: "중고 노트북",
      },
      {
        key: "postDate",
        label: "판매 글을 본 날",
        type: "date",
        max: 10,
        optional: true,
        help: "모르면 비워 두세요.",
      },
      {
        key: "said",
        label: "상대방이 한 말",
        type: "textarea",
        max: LONG,
        help: "돈을 보내기 전에 상대방이 약속하거나 설명한 말을 대화 내용 그대로 옮겨요.",
        example: "오늘 입금하면 내일 택배로 보내 드릴게요.",
      },
      { key: "payDate", label: "돈을 보낸 날", type: "date", max: 10 },
      {
        key: "payAmount",
        label: "보낸 금액",
        type: "money",
        max: 20,
        help: "이체 내역에 적힌 금액을 숫자로 적어요.",
      },
      {
        key: "after",
        label: "돈을 보낸 뒤 있었던 일",
        type: "choice",
        max: 10,
        options: TRADE_AFTER.map(({ value, label }) => ({ value, label })),
      },
      {
        key: "lastContact",
        label: "마지막으로 연락된 날",
        type: "date",
        max: 10,
        optional: true,
        help: "그 뒤로 연락이 끊겼다면 적어요. 아직 연락이 된다면 비워 두세요.",
      },
      {
        key: "detail",
        label: "고소이유 (있었던 일의 경위)",
        type: "textarea",
        max: LONG,
        help: "거래를 시작한 때부터 지금까지 있었던 일을 시간 순서대로 사실만 적어요. 같은 계좌로 피해를 본 다른 사람을 알고 있다면 그것도 적어요.",
      },
      evidence("판매 글 캡처\n대화 캡처\n이체 확인증"),
      ...related,
      pledge,
      ...station,
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
      {
        title: "피고소인 — 거래 정보",
        fields: ["accusedSite", "accusedId", "accusedAccount"],
      },
      { title: "무엇을 거래했나요", fields: ["item", "postDate"] },
      { title: "상대방이 한 말", fields: ["said"] },
      { title: "돈을 보낸 날·금액", fields: ["payDate", "payAmount"] },
      { title: "그 뒤 있었던 일", fields: ["after", "lastContact"] },
      { title: "고소이유", fields: ["detail"] },
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

  "obscenity-complaint": {
    kind: "obscenity-complaint",
    title: "고소장 (통신매체이용음란)",
    stepLabel: "고소·신고",
    intro:
      "메신저·게임 채팅·전화 같은 통신 수단으로 성적 수치심이나 혐오감을 일으키는 말·글·그림·영상을 받은 피해를 수사기관에 알리고 처벌을 구하는 문서예요. 경찰청 고소장(표준)의 항목 순서를 따랐어요.",
    tips: [
      ...COMPLAINT_TIPS,
      "받은 내용은 지우지 말고 화면을 그대로 저장해요. 앞뒤 대화도 함께 보관하세요.",
      "받은 내용을 글로 옮기기 어려우면 어떤 내용인지 설명만 적고 화면은 증거로 내도 돼요.",
      "혼자 진행하기 어렵다면 수사기관이나 피해자 지원 기관에 도움을 요청할 수 있어요.",
    ],
    links: [OFFICIAL.cyberPolice, OFFICIAL.police],
    officialForms: [{ name: "[수사] 고소장", source: POLICE_SOURCE, url: POLICE_FORMS }],
    basis: [
      "형사소송법 제237조(고소의 방식)",
      "성폭력범죄의 처벌 등에 관한 특례법 제13조(통신매체를 이용한 음란행위)",
      "형법 제156조(무고)",
    ],
    draftFields: "",
    officialNotice: pledgeNotice,
    fields: [
      ...complainant,
      ...accused,
      ...accusedOnline("사이트·SNS·게임 이름", "○○ 메신저 / ○○ 게임"),
      {
        key: "incidentDate",
        label: "받은 날",
        type: "date",
        max: 10,
        optional: true,
        help: "여러 번이면 처음 받은 날을 적고, 나머지는 아래 경위에 적어요. 모르면 비워 두세요.",
      },
      {
        key: "medium",
        label: "어떤 수단으로 받았나요",
        type: "choice",
        max: 10,
        options: OBSCENITY_MEDIA,
      },
      {
        key: "content",
        label: "받은 내용",
        type: "textarea",
        max: LONG,
        help: "받은 말·글을 그대로 옮기거나, 그림·영상이라면 어떤 내용인지 설명해요.",
      },
      {
        key: "detail",
        label: "고소이유 (있었던 일의 경위)",
        type: "textarea",
        max: LONG,
        help: "상대방을 어떻게 알게 됐는지, 그 전후로 어떤 대화가 있었는지를 시간 순서대로 사실만 적어요. 그만하라고 한 적이 있다면 그것도 적어요(없어도 괜찮아요).",
      },
      evidence("받은 메시지 화면 캡처\n앞뒤 대화 캡처\n상대방 계정 화면"),
      ...related,
      pledge,
      ...station,
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
      { title: "피고소인 — 온라인 정보", fields: ["accusedSite", "accusedId"] },
      { title: "언제·어떤 수단으로", fields: ["incidentDate", "medium"] },
      { title: "받은 내용", fields: ["content"] },
      { title: "고소이유", fields: ["detail"] },
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

  answer: {
    kind: "answer",
    title: "답변서",
    stepLabel: "답변서·이의신청",
    intro:
      "소장을 받은 피고가 원고의 청구를 받아들일 수 있는지, 원고가 주장한 사실을 인정하는지를 법원에 밝히는 문서예요. 법원 답변서 양식의 항목 순서를 따랐어요.",
    tips: [
      "소장과 함께 온 법원 안내에 답변서를 낼 기간이 적혀 있어요. 받은 날짜를 먼저 확인하세요. 기간 안에 내지 않으면 원고가 청구한 대로 정해질 수 있어요.",
      "지급명령이나 이행권고결정을 받았다면 답변서와 따로 이의신청서를 내야 해요. 이의신청서 서식은 따로 있어요.",
      "원고가 주장한 사실을 하나씩 나눠, 인정하는 것과 인정하지 않는 것을 따로 적어요. 인정하지 않는 사실에는 이유를 적어요.",
      "내 말을 보여 주는 자료(대화, 이체 내역, 배송 기록 등)의 사본을 함께 내요.",
      "원고의 수만큼 답변서 부본을 함께 내요.",
      "청구를 인정한다고 적으면 그대로 판결이 날 수 있어요. 어떻게 적을지 어렵다면 내기 전에 전문가 상담을 권해요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
    officialForms: [{ name: "[민사] 답변서", source: COURT_SOURCE, url: SCOURT_FORMS }],
    basis: ["민사소송법 제256조(답변서의 제출의무)"],
    draftFields: "",
    officialNotice: { text: ANSWER_NOTICE, source: "법원 답변서 서식 (유의 사항)" },
    fields: [
      court("소장을 보낸 법원이에요. 받은 서류에 적혀 있어요."),
      caseNumber("○○가소○○○○"),
      name("plaintiffName", "원고 이름", "소장에 적힌 원고 이름을 그대로 옮겨요."),
      {
        ...address("plaintiffAddress", "원고 주소"),
        optional: true,
        help: "소장에 적힌 주소를 옮겨요. 모르면 비워 두세요.",
      },
      name("defendantName", "피고 이름", "소장을 받은 사람, 곧 나예요."),
      address("defendantAddress", "피고 주소"),
      phone("defendantPhone", "피고 연락처"),
      {
        key: "stance",
        label: "원고의 청구를 받아들일 수 있나요",
        type: "choice",
        max: 10,
        help: "받아들일 수 없다고 고르면 법원에서 널리 쓰는 기본 문장(청구 기각을 구한다)이 들어가요. 모두 인정한다고 적으면 그대로 판결이 날 수 있으니, 그렇게 고르기 전에 전문가 상담을 권해요.",
        options: ANSWER_STANCES,
      },
      {
        key: "aimDetail",
        label: "청구취지에 대한 답변 (직접 적기)",
        type: "textarea",
        max: LONG,
        when: { key: "stance", value: "partial" },
        help: "원고의 청구 가운데 어디까지 인정하고 어디부터 받아들일 수 없는지 적어요.",
      },
      {
        key: "causeAnswer",
        label: "청구원인에 대한 답변",
        type: "textarea",
        max: LONG,
        help: "원고가 소장에 적은 사실을 하나씩 짚어, 인정하는 것과 인정하지 않는 것을 나눠 적어요. 인정하지 않는 사실에는 이유를 함께 적어요.",
      },
      {
        key: "evidence",
        label: "증거방법에 관한 의견·붙이는 자료",
        type: "textarea",
        max: LONG,
        optional: true,
        help: "내 주장을 보여 주는 자료를 한 줄에 하나씩 적어요.",
        example: "대화 캡처\n배송 조회 화면",
      },
      { ...writtenOn, help: "답변서를 내는 날이에요. 비워 두면 직접 적을 수 있어요." },
    ],
    pages: [
      { title: "법원·사건번호", fields: ["court", "caseNumber"] },
      { title: "원고 (상대방)", fields: ["plaintiffName", "plaintiffAddress"] },
      {
        title: "피고 (나)",
        help: RRN_NOTICE,
        fields: ["defendantName", "defendantAddress", "defendantPhone"],
      },
      { title: "청구취지에 대한 답변", fields: ["stance", "aimDetail"] },
      { title: "청구원인에 대한 답변", fields: ["causeAnswer"] },
      { title: "증거·작성일", fields: ["evidence", "writtenOn"] },
    ],
  },

  "order-objection": {
    kind: "order-objection",
    title: "지급명령에 대한 이의신청서",
    stepLabel: "답변서·이의신청",
    intro:
      "지급명령을 받은 채무자가 그 명령을 받아들일 수 없다고 법원에 알리는 문서예요. 법원 지급명령에 대한 이의신청서 양식을 따랐어요.",
    tips: [
      "이의신청서에는 이유를 적는 칸이 없어요. 다투는 이유는 답변서에 따로 적어 내요.",
      "기간은 지급명령 정본을 받은 날부터 세요. 받은 날짜를 정확히 적으세요.",
      "이의를 내면 사건이 소송 절차로 이어져요. 그 뒤 법원 안내를 확인하세요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
    officialForms: [
      { name: "[민사] 지급명령에 대한 이의신청서", source: COURT_SOURCE, url: SCOURT_FORMS },
    ],
    basis: ["민사소송법 제469조(지급명령의 송달)·제470조(이의신청의 효력)"],
    draftFields: "",
    officialNotice: {
      text: ORDER_OBJECTION_NOTICE,
      source: "법원 지급명령에 대한 이의신청서 서식 (유의 사항)",
    },
    fields: [
      court("지급명령을 보낸 법원이에요. 받은 서류에 적혀 있어요."),
      caseNumber("○○차○○○○"),
      name("creditorName", "채권자 이름", "지급명령에 적힌 채권자 이름을 그대로 옮겨요."),
      name("debtorName", "채무자 이름", "지급명령을 받은 사람, 곧 나예요."),
      address("debtorAddress", "채무자 주소"),
      phone("debtorPhone", "연락 가능한 전화번호"),
      servedOn("지급명령 정본을"),
      { ...writtenOn, help: "이의신청서를 내는 날이에요. 비워 두면 직접 적을 수 있어요." },
    ],
    pages: [
      { title: "법원·사건번호", fields: ["court", "caseNumber"] },
      { title: "채권자 (상대방)", fields: ["creditorName"] },
      { title: "채무자 (나)", fields: ["debtorName", "debtorAddress", "debtorPhone"] },
      { title: "받은 날·작성일", fields: ["servedOn", "writtenOn"] },
    ],
  },

  "decision-objection": {
    kind: "decision-objection",
    title: "이행권고결정에 대한 이의신청서",
    stepLabel: "답변서·이의신청",
    intro:
      "소액 사건에서 법원이 보낸 이행권고결정을 받아들일 수 없다고 알리는 문서예요. 법원 이행권고결정에 대한 이의신청서 양식을 따랐어요.",
    tips: [
      "이의신청서에는 이유를 적는 칸이 없어요. 다투는 이유는 답변서에 따로 적어 내요.",
      "기간은 결정을 받은 날부터 세요. 받은 날짜를 정확히 적으세요.",
      "이의를 내면 법원이 변론기일을 정해요. 그 뒤 법원 안내를 확인하세요.",
    ],
    links: [OFFICIAL.ecfs, OFFICIAL.klac],
    officialForms: [
      {
        name: "[민사] 이행권고결정에 대한 이의신청서",
        source: COURT_SOURCE,
        url: SCOURT_FORMS,
      },
    ],
    basis: ["소액사건심판법 제5조의4(이행권고결정에 대한 이의신청)"],
    draftFields: "",
    officialNotice: {
      text: DECISION_OBJECTION_NOTICE,
      source: "법원 이행권고결정에 대한 이의신청서 서식 (유의 사항)",
    },
    fields: [
      court("이행권고결정을 보낸 법원이에요. 받은 서류에 적혀 있어요."),
      caseNumber("○○가소○○○○"),
      name("plaintiffName", "원고 이름", "결정문에 적힌 원고 이름을 그대로 옮겨요."),
      name("defendantName", "피고 이름", "결정을 받은 사람, 곧 나예요."),
      phone("defendantPhone", "연락 가능한 전화번호"),
      servedOn("이행권고결정을"),
      { ...writtenOn, help: "이의신청서를 내는 날이에요. 비워 두면 직접 적을 수 있어요." },
    ],
    pages: [
      { title: "법원·사건번호", fields: ["court", "caseNumber"] },
      { title: "원고와 피고", fields: ["plaintiffName", "defendantName", "defendantPhone"] },
      { title: "받은 날·작성일", fields: ["servedOn", "writtenOn"] },
    ],
  },

  settlement: {
    kind: "settlement",
    title: "합의서",
    stepLabel: "피해 회복·합의 협의",
    intro:
      "수사 중인 사건에서 피해자와 가해자가 합의한 내용을 적어 사건 담당자에게 내는 문서예요. 서명은 피해자가 내용을 다 읽고 직접 해요. 경찰청 합의서 양식의 순서(피해자 · 가해자 · 합의 내용 · 피해자 서명)를 따랐어요.",
    tips: [
      "합의서는 피해자가 스스로 정해 서명하는 문서예요. 미리 적어 가더라도 대신 서명하거나 서명을 재촉하면 안 돼요.",
      "피해자에게 직접 연락하지 말고, 담당 수사관이나 변호인을 통해 뜻을 확인하세요. 연락이나 접근을 막는 조치가 내려져 있으면 연락하는 것부터 문제가 돼요.",
      "피해자의 주소처럼 모르는 정보는 비워 두세요. 알아내려고 하지 말고, 피해자가 직접 적게 두세요.",
      "문서 아래쪽의 '처벌을 원하지 않습니다'와 '이의를 제기하지 않겠습니다'는 빈 칸으로 나와요. 피해자가 뜻을 정했을 때 손으로 직접 표시해요.",
      "'이의를 제기하지 않겠습니다'에 표시하면 나중에 손해배상을 청구하기 어려워질 수 있어요. 피해자가 그 뜻을 알고 정해야 해요.",
      "무엇을 언제 어떻게 하기로 했는지를 있는 그대로 적어요. 아직 하지 않은 일을 이미 한 것처럼 적지 않아요.",
      "합의가 절차에 주는 영향은 죄의 종류에 따라 달라요. 담당 수사관이나 전문가에게 확인하세요.",
      "혐의를 다투는 경우에는 합의가 해당하지 않을 수 있어요. 할지 말지는 본인이 정해요.",
      "본인이 아닌 사람이 대신 낼 때 필요한 서류(위임장 등)는 양식의 안내와 사건 담당자에게 확인하세요.",
    ],
    links: [OFFICIAL.police, OFFICIAL.klac],
    officialForms: [{ name: "[수사] 합의서", source: POLICE_SOURCE, url: POLICE_FORMS }],
    basis: ["법령이 정한 서식이 아니에요 (경찰 민원 서식의 순서를 따랐어요)"],
    draftFields: "",
    fields: [
      name("victimName", "피해자 이름", "합의서에 서명하는 사람이에요."),
      {
        ...address("victimAddress", "피해자 주소"),
        optional: true,
        help: "피해자가 직접 적는 칸이에요. 모르면 비워 두고, 알아내려고 하지 마세요.",
      },
      name(
        "offenderName",
        "가해자 이름",
        "신고나 고소를 당한 사람이에요. 양식에서 쓰는 이름이에요.",
      ),
      {
        ...address("offenderAddress", "가해자 주소"),
        help: "도로명주소와 동·호수까지 적어요.",
      },
      {
        key: "policeStation",
        label: "사건을 맡은 경찰서",
        type: "text",
        max: 50,
        help: "신고나 고소를 받은 경찰서예요. 합의서는 사건 담당자에게 내요.",
        example: "○○경찰서",
      },
      {
        key: "incident",
        label: "어떤 사건인가요",
        type: "textarea",
        max: LONG,
        help: "언제 어디서 어떤 일이 있었고 신고나 고소가 있었는지 사실만 적어요.",
        example: "○월 ○일 ○○ 게임 채팅에서 있었던 일로 신고가 접수되었습니다.",
      },
      {
        key: "terms",
        label: "합의한 내용",
        type: "textarea",
        max: LONG,
        help: "서로 하기로 한 일을 적어요. 사과, 글 삭제, 돈을 주고받는 방법과 때 같은 것이에요.",
        example: "가해자는 피해자에게 사과하고 문제가 된 글을 지우기로 하였습니다.",
      },
      {
        key: "amount",
        label: "주고받는 돈 (있을 때만)",
        type: "money",
        max: 20,
        optional: true,
        help: "돈을 주고받기로 했다면 그 금액을 숫자로 적어요. 없으면 비워 두세요.",
      },
      { ...writtenOn, help: "합의서를 쓰는 날이에요. 비워 두면 직접 적을 수 있어요." },
    ],
    pages: [
      { title: "피해자", help: RRN_NOTICE, fields: ["victimName", "victimAddress"] },
      { title: "가해자", fields: ["offenderName", "offenderAddress"] },
      { title: "어떤 사건인가요", fields: ["policeStation", "incident"] },
      { title: "합의한 내용", fields: ["terms", "amount"] },
      { title: "작성일", fields: ["writtenOn"] },
    ],
  },

  "complaint-withdrawal": {
    kind: "complaint-withdrawal",
    title: "고소취소장",
    stepLabel: "피해 회복·합의 협의",
    intro:
      "고소한 사람이 그 고소를 취소한다고 수사기관에 알리는 문서예요. 고소한 사람이 스스로 정해 쓰고 서명해요 — 고소당한 사람이 대신 서명할 수 없어요. 고소를 취소하면 같은 일로 다시 고소할 수 없어요. 경찰청 고소취소장 양식의 순서(고소인 · 피고소인 · 취소 내용 · 고소인 서명)를 따랐어요.",
    tips: [
      "고소를 취소하면 같은 일로 다시 고소할 수 없어요. 내기 전에 충분히 생각하고, 어렵다면 전문가 상담을 권해요.",
      "고소당한 사람이 이 문서를 미리 적어 가더라도 서명을 재촉하면 안 돼요. 고소한 사람에게 직접 연락하지 말고 담당 수사관이나 변호인을 통해 뜻을 확인하세요. 연락이나 접근을 막는 조치가 내려져 있으면 연락하는 것부터 문제가 돼요.",
      "고소한 사람의 주소처럼 모르는 정보는 비워 두세요. 알아내려고 하지 마세요.",
      "받기로 한 것이 있다면 실제로 받았는지, 아직이라면 어떻게 받기로 했는지를 사유에 있는 그대로 적어요.",
      "취소가 절차에 주는 영향은 죄의 종류에 따라 달라요. 담당 수사관에게 확인하세요.",
      "본인이 아닌 사람이 대신 낼 때 필요한 서류(위임장 등)는 양식의 안내와 사건 담당자에게 확인하세요.",
    ],
    links: [OFFICIAL.police, OFFICIAL.klac],
    officialForms: [{ name: "[수사] 고소취소장", source: POLICE_SOURCE, url: POLICE_FORMS }],
    basis: ["형사소송법 제232조(고소의 취소)"],
    draftFields: "",
    fields: [
      name("complainantName", "고소인 이름", "고소를 한 사람이에요. 이 문서에 서명해요."),
      {
        ...address("complainantAddress", "고소인 주소"),
        optional: true,
        help: "고소인이 직접 적는 칸이에요. 모르면 비워 두고, 알아내려고 하지 마세요.",
      },
      name("accusedName", "피고소인 이름", "고소를 당한 사람이에요."),
      {
        ...address("accusedAddress", "피고소인 주소"),
        optional: true,
        help: "알면 적고, 모르면 비워 두세요.",
      },
      {
        key: "crime",
        label: "어떤 혐의로 고소했나요",
        type: "text",
        max: 60,
        help: "고소장에 적은 죄명을 그대로 옮겨요.",
        example: "모욕",
      },
      {
        key: "policeStation",
        label: "고소한 경찰서",
        type: "text",
        max: 50,
        example: "○○경찰서",
      },
      {
        key: "reason",
        label: "취소하는 사유",
        type: "textarea",
        max: LONG,
        help: "왜 취소하는지 있는 그대로 적어요. 취소하면 같은 일로 다시 고소할 수 없어요.",
        example: "피고소인에게서 사과를 받고 문제가 된 글이 지워진 것을 확인하였습니다.",
      },
      { ...writtenOn, help: "고소취소장을 내는 날이에요. 비워 두면 직접 적을 수 있어요." },
    ],
    pages: [
      { title: "고소인", help: RRN_NOTICE, fields: ["complainantName", "complainantAddress"] },
      { title: "피고소인", fields: ["accusedName", "accusedAddress"] },
      { title: "어떤 고소인가요", fields: ["crime", "policeStation"] },
      { title: "취소하는 사유·작성일", fields: ["reason", "writtenOn"] },
    ],
  },
} satisfies Record<
  | "defamation-complaint"
  | "trade-fraud-complaint"
  | "obscenity-complaint"
  | "answer"
  | "order-objection"
  | "decision-objection"
  | "settlement"
  | "complaint-withdrawal",
  DocumentSpec
>;
