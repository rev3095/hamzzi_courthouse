// 생활 분쟁 섹션 타임라인 (DEC-028). 홈 카테고리 버튼(lib/procedure/categories)에서 새로 연 섹션 —
// 가족·이혼, 상속, 소비자·환불, 명예훼손·온라인. 분류 기준은 법제처 찾기쉬운 생활법령정보 분야(가정법률·소비자·
// 정보통신 등)이고, 판례 사건 종류(가사·민사·형사)는 검색 범위 설명에만 쓴다 (docs/research/06).
// steps.ts(기존 섹션)와 규칙이 같다: LLM 없음, 기간·비용 숫자 없음(절대 규칙 3), 단정·승패 표현 없음(절대 규칙 2),
// 공식 기관 링크만. 문서 작성(document)은 달지 않는다 — 공식 서식 작성기(lib/documents)는 기존 섹션만 다룬다.
import { OFFICIAL, type OfficialLink, type ProcedureStep, type Track } from "./steps";

export type LifeTrackKey = "family" | "inheritance" | "consumer" | "defamation";

export type LifeTrack = Omit<Track, "key"> & { key: LifeTrackKey };

export const LIFE_OFFICIAL = {
  efamily: { label: "대법원 전자가족관계등록시스템", url: "https://efamily.scourt.go.kr" },
  childSupport: { label: "양육비이행관리원", url: "https://www.childsupport.or.kr" },
  inheritanceLookup: {
    label: "정부24 (안심상속 원스톱 서비스)",
    url: "https://www.gov.kr",
  },
  iros: { label: "인터넷등기소", url: "https://www.iros.go.kr" },
  consumerCenter: { label: "소비자상담센터", url: "https://www.1372.go.kr" },
  kca: { label: "한국소비자원 (피해구제)", url: "https://www.kca.go.kr" },
  kocsc: { label: "방송통신심의위원회 (불법·유해정보 심의)", url: "https://www.kocsc.or.kr" },
} satisfies Record<string, OfficialLink>;

const L = LIFE_OFFICIAL;

const SUIT: ProcedureStep = {
  key: "suit",
  label: "소송 (소장·변론)",
  difficulty: "depends",
  prepare: ["소장 (청구취지·청구원인)", "증거 목록과 증거 사본", "인지대·송달료 (법원 안내 기준)"],
  cautions: [
    "상대방이 다투면 답변서·준비서면을 주고받고 변론 기일에 나가야 해요.",
    "쟁점이 복잡하면 변호사·법무사 상담을 함께 검토하세요.",
  ],
  links: [OFFICIAL.proSe, OFFICIAL.ecfs],
  question: "소송을 하면 소장에는 무엇을 적고 어떤 절차를 거치나요?",
};

export const LIFE_TRACKS: Record<LifeTrackKey, LifeTrack> = {
  family: {
    key: "family",
    section: "가족·이혼",
    title: "이혼·양육비",
    recommended: "records",
    reason:
      "이혼이나 양육 문제로 보여서, 가족관계와 재산·양육 자료를 먼저 정리하는 단계부터 안내해요.",
    steps: [
      {
        key: "records",
        label: "가족관계·재산 자료 정리",
        difficulty: "self",
        prepare: [
          "가족관계증명서·혼인관계증명서",
          "부부 재산 목록 (부동산·예금·보험·빚)",
          "자녀 양육 상황 기록",
          "주고받은 메시지 등 사실을 보여 주는 자료",
        ],
        cautions: [
          "상대방의 휴대전화나 계정에 몰래 접속해 자료를 모으면 다른 법적 문제가 생길 수 있어요.",
        ],
        links: [L.efamily],
        shortcut: L.efamily,
        question: "이혼을 준비할 때 어떤 자료를 모아 두어야 하나요?",
      },
      {
        key: "agreement",
        label: "협의이혼 의사확인 신청",
        difficulty: "self",
        prepare: [
          "협의이혼의사확인신청서",
          "미성년 자녀가 있으면 양육과 친권자 결정에 관한 협의서",
          "가족관계 서류",
        ],
        cautions: [
          "부부가 함께 가정법원에 출석해 이혼 의사를 확인받아요. 미성년 자녀가 있으면 이혼 안내를 받고 숙려기간을 거쳐요. 기간은 법원 안내에서 확인하세요.",
          "양육비를 정했다면 법원 문서(양육비부담조서 등)로 남겨 두는 것이 좋아요.",
        ],
        links: [OFFICIAL.proSe, OFFICIAL.klac],
        shortcut: OFFICIAL.proSe,
        question: "협의이혼은 어떻게 신청하고, 양육비는 어떻게 정하나요?",
      },
      {
        key: "mediation",
        label: "조정 신청",
        difficulty: "depends",
        prepare: ["조정 신청서 또는 소장", "재산·양육 자료"],
        cautions: [
          "협의가 되지 않아 재판상 이혼을 청구하면 보통 먼저 가정법원 조정 절차를 거쳐요.",
          "조정이 성립하면 그 내용대로 이혼과 재산분할·양육 사항이 정해져요.",
        ],
        links: [OFFICIAL.proSe, OFFICIAL.klac],
        question: "이혼 조정은 어떻게 진행되나요?",
      },
      {
        ...SUIT,
        label: "이혼 소송",
        difficulty: "expert",
        prepare: [
          "소장 (청구취지·청구원인)",
          "재판상 이혼 사유를 보여 주는 증거",
          "재산·양육 자료",
        ],
        cautions: [
          "재판상 이혼은 민법에 정한 이혼 사유가 있어야 해서 전문가 상담을 권해요.",
          "위자료·재산분할·양육비·친권자 지정을 함께 청구할 수 있어요.",
        ],
        question: "이혼 소송에서는 무엇을 함께 청구할 수 있나요?",
      },
      {
        key: "support",
        label: "양육비 이행 확보",
        difficulty: "depends",
        prepare: ["양육비를 정한 판결·조서·심판문", "받지 못한 양육비 내역"],
        cautions: [
          "양육비를 정한 법원 문서가 있는데 지급하지 않으면 이행명령 같은 절차를 가정법원에 신청할 수 있어요.",
          "양육비이행관리원에서 상담과 이행 지원을 받을 수 있어요.",
        ],
        links: [L.childSupport, OFFICIAL.proSe],
        shortcut: L.childSupport,
        question: "정해진 양육비를 받지 못하면 어떻게 하나요?",
      },
    ],
  },

  inheritance: {
    key: "inheritance",
    section: "상속",
    title: "상속 정리",
    recommended: "lookup",
    reason:
      "상속 문제로 보여서, 물려받을 재산과 빚이 얼마나 있는지 먼저 조회하는 단계부터 안내해요.",
    steps: [
      {
        key: "lookup",
        label: "상속재산·채무 조회",
        difficulty: "self",
        prepare: ["사망 사실이 적힌 서류", "신청인 신분증", "가족관계증명서"],
        cautions: [
          "안심상속 원스톱 서비스로 예금·보험·대출·세금 같은 재산과 빚을 한 번에 조회 신청할 수 있어요.",
          "빚이 재산보다 많을 수 있으니 조회 결과를 먼저 확인하세요.",
        ],
        links: [L.inheritanceLookup],
        shortcut: L.inheritanceLookup,
        question: "상속재산과 빚은 어떻게 조회하나요?",
      },
      {
        key: "renounce",
        label: "상속포기·한정승인 검토",
        difficulty: "depends",
        prepare: ["상속포기 또는 한정승인 심판청구서", "가족관계 서류", "재산·채무 조회 결과"],
        cautions: [
          "상속포기·한정승인은 상속이 시작된 것을 안 날부터 정해진 기간 안에 가정법원에 신청해야 해요. 기간은 법원 안내에서 바로 확인하세요.",
          "한정승인은 물려받는 재산 범위 안에서만 빚을 갚는 제도라 재산 목록을 빠짐없이 적어야 해요.",
        ],
        links: [OFFICIAL.proSe, OFFICIAL.klac],
        question: "상속포기와 한정승인은 어떻게 다르고 어떻게 신청하나요?",
      },
      {
        key: "agreement",
        label: "상속재산 분할 협의",
        difficulty: "depends",
        prepare: [
          "상속인 모두가 참여한 분할 협의서",
          "상속재산 목록",
          "등기·명의변경에 필요한 서류",
        ],
        cautions: [
          "분할 협의는 상속인 모두가 참여해야 해요.",
          "부동산을 나눴다면 상속 등기를 따로 해야 해요.",
        ],
        links: [L.iros, OFFICIAL.klac],
        question: "상속재산 분할 협의는 어떻게 하나요?",
      },
      {
        key: "adjudication",
        label: "분할 심판·유류분 청구",
        difficulty: "expert",
        prepare: ["심판청구서 또는 소장", "재산·생전 증여 자료"],
        cautions: [
          "협의가 되지 않으면 가정법원에 상속재산 분할을 청구할 수 있어요.",
          "다른 사람이 생전 증여나 유언으로 많이 받아 내 몫이 줄었다면 유류분 반환 청구를 검토할 수 있어요. 청구할 수 있는 기간이 정해져 있어요.",
          "쟁점이 복잡해 전문가 상담을 권해요.",
        ],
        links: [OFFICIAL.proSe, OFFICIAL.klac],
        question: "상속재산 분할 심판과 유류분 청구는 어떻게 하나요?",
      },
    ],
  },

  consumer: {
    key: "consumer",
    section: "소비자·환불",
    title: "환불·소비자 피해",
    recommended: "request",
    reason:
      "판매자와 환불·교환을 다투는 상황으로 보여서, 기록이 남는 방법으로 판매자에게 먼저 요청하는 단계부터 안내해요.",
    steps: [
      {
        key: "records",
        label: "구매·대화 기록 정리",
        difficulty: "self",
        prepare: [
          "주문 내역·영수증",
          "상품 페이지와 환불 규정 화면 캡처",
          "판매자와 주고받은 메시지",
          "하자가 있다면 사진·영상",
        ],
        cautions: ["판매 페이지는 바뀌거나 사라질 수 있어 미리 캡처해 두세요."],
        links: [L.consumerCenter],
        question: "환불을 요청하기 전에 어떤 기록을 모아 두어야 하나요?",
      },
      {
        key: "request",
        label: "판매자에게 환불·청약철회 요청",
        difficulty: "self",
        prepare: ["요청 내용 (환불·교환·수리)", "주문 번호", "구매·대화 기록"],
        cautions: [
          "온라인으로 산 물건은 법에 정한 기간 안에 청약철회를 요청할 수 있고, 예외도 있어요. 기간과 예외는 소비자상담센터 안내에서 확인하세요.",
          "요청은 문자·메일·게시판처럼 기록이 남는 방법으로 하세요.",
        ],
        links: [L.consumerCenter],
        question: "판매자에게 환불이나 청약철회를 어떻게 요청하나요?",
      },
      {
        key: "counsel",
        label: "소비자상담센터 상담",
        difficulty: "self",
        prepare: ["구매·대화 기록", "판매자의 답변"],
        cautions: ["상담 내용에 따라 한국소비자원 피해구제 신청으로 이어질 수 있어요."],
        links: [L.consumerCenter],
        shortcut: L.consumerCenter,
        question: "소비자상담센터에서는 어떤 도움을 받을 수 있나요?",
      },
      {
        key: "relief",
        label: "한국소비자원 피해구제 신청",
        difficulty: "depends",
        prepare: ["피해구제 신청서", "구매·대화 기록과 증빙 자료"],
        cautions: [
          "한국소비자원이 사실을 조사하고 합의를 권고해요. 권고는 판매자에게 강제력이 없어요.",
          "합의가 되지 않으면 소비자분쟁조정위원회 조정으로 넘어갈 수 있어요.",
        ],
        links: [L.kca],
        shortcut: L.kca,
        question: "한국소비자원 피해구제는 어떻게 신청하나요?",
      },
      {
        ...SUIT,
        cautions: [
          "조정이 성립하지 않거나 판매자가 따르지 않으면 소송을 검토해요.",
          ...SUIT.cautions,
        ],
        question: "판매자를 상대로 환불 소송을 하려면 어떻게 하나요?",
      },
    ],
  },

  defamation: {
    key: "defamation",
    section: "명예훼손·온라인",
    title: "온라인 명예훼손·모욕 피해",
    recommended: "evidence",
    reason:
      "온라인 글이나 메시지로 피해를 본 상황으로 보여서, 게시물이 사라지기 전에 증거를 보존하는 단계부터 안내해요.",
    note: "작성자를 형사 고소하는 절차와 손해배상을 청구하는 민사 절차는 따로 진행돼요.",
    steps: [
      {
        key: "evidence",
        label: "게시물 증거 보존",
        difficulty: "self",
        prepare: [
          "게시물·댓글 화면 캡처 (주소·작성자·날짜가 보이게)",
          "게시물 주소 (URL)",
          "피해를 보여 주는 자료",
        ],
        cautions: [
          "게시물이 지워지기 전에 주소와 날짜가 보이게 저장하세요.",
          "증거를 모으려고 상대방 계정에 몰래 접속하면 다른 법적 문제가 생길 수 있어요.",
        ],
        links: [OFFICIAL.cyberPolice],
        question: "온라인 명예훼손 증거는 어떻게 남겨 두어야 하나요?",
      },
      {
        key: "takedown",
        label: "삭제·임시조치 요청",
        difficulty: "self",
        prepare: ["게시물 주소", "어떤 피해가 있는지 설명"],
        cautions: [
          "사이트 운영자에게 게시물 삭제나 임시조치를 요청할 수 있어요.",
          "방송통신심의위원회에 심의를 신청하는 방법도 있어요.",
        ],
        links: [L.kocsc],
        shortcut: L.kocsc,
        question: "명예를 훼손하는 게시물은 어떻게 내려 달라고 요청하나요?",
      },
      {
        key: "report",
        label: "고소·신고",
        difficulty: "depends",
        prepare: ["고소장", "증거 자료", "작성자를 알고 있다면 그 정보"],
        cautions: [
          "명예훼손과 모욕은 성립 요건과 고소 요건이 서로 달라요. 모욕은 피해자가 고소해야 수사가 진행되고, 고소할 수 있는 기간이 정해져 있어요.",
          "어떤 죄에 해당하는지는 수사기관과 법원이 판단해요.",
        ],
        links: [OFFICIAL.cyberPolice, OFFICIAL.police],
        shortcut: OFFICIAL.cyberPolice,
        question: "온라인 명예훼손이나 모욕은 어떻게 고소하나요?",
      },
      {
        key: "investigation",
        label: "수사",
        difficulty: "depends",
        prepare: ["수사기관의 출석·자료 요청에 낼 자료"],
        cautions: [
          "작성자를 찾는 데 시간이 걸릴 수 있어요. 진행 상황은 담당 수사관에게 확인하세요.",
        ],
        links: [OFFICIAL.police],
        question: "고소한 뒤 수사는 어떻게 진행되나요?",
      },
      {
        key: "civil",
        label: "손해배상 청구",
        difficulty: "expert",
        prepare: ["소장 (청구취지·청구원인)", "게시물 증거와 피해 자료"],
        cautions: [
          "형사 절차와 따로 정신적 손해(위자료) 배상을 민사로 청구할 수 있어요.",
          "쟁점이 복잡해 전문가 상담을 권해요.",
        ],
        links: [OFFICIAL.proSe, OFFICIAL.klac],
        question: "명예훼손 피해 배상은 어떻게 청구하나요?",
      },
    ],
  },
};

/** 생활 분쟁 타임라인의 모든 단계 (검사용) */
export const LIFE_STEPS: ProcedureStep[] = Object.values(LIFE_TRACKS).flatMap((t) => t.steps);
