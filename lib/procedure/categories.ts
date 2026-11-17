// 홈 카테고리 버튼 (DEC-028). 순수 상수·규칙 — LLM을 쓰지 않는다.
// 버튼 분류는 법제처 찾기쉬운 생활법령정보 분야를 따르고, 판례 사건 종류(민사·가사·형사·행정)는
// 각 카테고리에서 찾는 판례의 범위 설명(caseKinds)에만 쓴다 (docs/research/06_카테고리_분류_조사.md).
// 카테고리는 ① 질문 입력 안내(placeholder·문장 시작) ② 분류 보조(classifyCase가 규칙으로 정하지 못할 때만)
// ③ 무료 법제처 판례 검색에 고정 검색어 하나를 더하는 데만 쓴다. 모델이 카테고리를 정하지 않는다 (DEC-021).
import type { LifeTrackKey } from "./life-tracks";
import type { TrackKey } from "./steps";

export const CATEGORY_KEYS = [
  "lease",
  "deposit",
  "labor",
  "fraud",
  "traffic",
  "neighbor",
  "loan",
  "family",
  "inheritance",
  "consumer",
  "defamation",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export type Category = {
  key: CategoryKey;
  /** 버튼 이름 */
  label: string;
  /** 버튼 한 줄 설명 */
  description: string;
  /** 질문을 고른 뒤 질문창 위 안내 */
  guide: string;
  /** 질문창 placeholder */
  placeholder: string;
  /** 질문창에 넣는 문장 시작 (사용자가 이어 적는다) */
  starters: string[];
  /** 분류 보조: 규칙이 타임라인을 정하지 못할 때 쓸 타임라인 */
  track: TrackKey | LifeTrackKey;
  /** 무료 법제처 판례 검색에 더하는 고정 검색어 (법률 용어) */
  caseQuery: string;
  /** 찾는 판례의 사건 종류 (법원 사건부호 기준, 설명용) */
  caseKinds: string;
  /** 이 카테고리의 예시 답변 (lib/demo/examples.json id) */
  examples: string[];
};

export const CATEGORIES: Record<CategoryKey, Category> = {
  lease: {
    key: "lease",
    label: "임대차",
    description: "전세·월세 보증금, 계약 갱신, 집주인 변경",
    guide:
      "집을 빌린 쪽(세입자) 기준으로 안내해요. 계약이 언제 끝났는지, 무엇이 문제인지 적어 주세요.",
    placeholder: "예: 전세 계약이 끝났는데 집주인이 보증금을 돌려주지 않아요.",
    starters: [
      "전세 계약이 끝났는데 보증금을 돌려받지 못하고 있어요. ",
      "집주인이 계약 갱신을 거절했어요. ",
      "살고 있는 집의 주인이 바뀌었어요. ",
    ],
    track: "lease_deposit",
    caseQuery: "임대차보증금",
    caseKinds: "민사",
    examples: ["lease-01", "lease-02", "lease-03"],
  },
  deposit: {
    key: "deposit",
    label: "계약금",
    description: "매매·임대 계약금, 가계약금 반환",
    guide: "계약금을 낸 쪽 기준으로 안내해요. 어떤 계약인지, 누가 계약을 깨려는지 적어 주세요.",
    placeholder: "예: 가계약금을 보냈는데 계약을 취소하고 싶어요.",
    starters: ["계약금을 보냈는데 상대방이 계약을 깨자고 해요. ", "가계약금을 돌려받고 싶어요. "],
    track: "contract_deposit",
    caseQuery: "계약금",
    caseKinds: "민사",
    examples: ["deposit-01", "deposit-02"],
  },
  labor: {
    key: "labor",
    label: "노동",
    description: "월급·퇴직금 체불, 부당해고",
    guide:
      "일한 사람(근로자) 기준으로 안내해요. 일한 기간과 받지 못한 것, 해고 통보 방식을 적어 주세요.",
    placeholder: "예: 퇴사했는데 마지막 달 월급과 퇴직금을 받지 못했어요.",
    starters: [
      "월급을 받지 못하고 있어요. ",
      "퇴직금을 주지 않아요. ",
      "갑자기 해고 통보를 받았어요. ",
    ],
    track: "wage",
    caseQuery: "임금",
    caseKinds: "민사·행정",
    examples: ["wage-02", "trap-number"],
  },
  fraud: {
    key: "fraud",
    label: "사기",
    description: "중고거래·온라인 거래 사기 피해",
    guide: "피해를 본 쪽 기준으로 안내해요. 어떻게 거래했고 돈을 어떻게 보냈는지 적어 주세요.",
    placeholder: "예: 중고거래로 돈을 먼저 보냈는데 판매자가 연락이 끊겼어요.",
    starters: [
      "중고거래로 돈을 보냈는데 물건을 받지 못했어요. ",
      "거래 상대방이 돈을 받고 연락이 끊겼어요. ",
    ],
    track: "fraud",
    caseQuery: "사기",
    caseKinds: "형사·민사",
    examples: ["fraud-01"],
  },
  traffic: {
    key: "traffic",
    label: "교통사고",
    description: "사고 손해배상, 보험사 과실 다툼",
    guide: "사고로 피해를 본 쪽 기준으로 안내해요. 사고 상황과 보험사가 한 말을 적어 주세요.",
    placeholder: "예: 횡단보도에서 차에 부딪혔는데 보험사가 과실을 나누자고 해요.",
    starters: ["교통사고로 다쳤는데 ", "보험사가 과실 비율을 나누자고 해요. "],
    track: "traffic",
    caseQuery: "손해배상(자)",
    caseKinds: "민사",
    examples: ["other-01"],
  },
  neighbor: {
    key: "neighbor",
    label: "이웃 분쟁",
    description: "층간소음, 누수, 반려동물 피해",
    guide: "피해를 본 쪽 기준으로 안내해요. 어떤 피해가 언제부터 반복됐는지 적어 주세요.",
    placeholder: "예: 윗집 누수로 천장이 망가졌는데 수리를 해 주지 않아요.",
    starters: ["윗집 때문에 피해를 보고 있어요. ", "옆집 반려동물 때문에 "],
    track: "neighbor",
    caseQuery: "생활방해",
    caseKinds: "민사",
    examples: ["trap-vague"],
  },
  loan: {
    key: "loan",
    label: "빌려준 돈",
    description: "빌려준 돈·못 받은 대금 돌려받기",
    guide:
      "돈을 받아야 하는 쪽 기준으로 안내해요. 언제 어떻게 빌려줬고 증거가 무엇인지 적어 주세요.",
    placeholder: "예: 친구에게 빌려준 돈을 갚으라고 했는데 계속 미뤄요.",
    starters: ["빌려준 돈을 돌려받지 못하고 있어요. ", "일을 해 주고 대금을 받지 못했어요. "],
    track: "money",
    caseQuery: "대여금",
    caseKinds: "민사",
    examples: [],
  },
  family: {
    key: "family",
    label: "가족·이혼",
    description: "이혼, 재산분할, 양육비",
    guide: "이혼·양육 절차를 안내해요. 혼인 상황과 자녀 유무, 원하는 것을 적어 주세요.",
    placeholder: "예: 이혼한 배우자가 정해진 양육비를 보내지 않아요.",
    starters: ["이혼을 생각하고 있는데 ", "정해진 양육비를 받지 못하고 있어요. "],
    track: "family",
    caseQuery: "이혼",
    caseKinds: "가사",
    examples: [],
  },
  inheritance: {
    key: "inheritance",
    label: "상속",
    description: "상속재산·빚 정리, 상속포기, 유류분",
    guide:
      "상속인 기준으로 안내해요. 누가 돌아가셨는지, 재산·빚과 다른 상속인과의 상황을 적어 주세요.",
    placeholder: "예: 부모님이 돌아가셨는데 빚이 있는지 모르겠어요.",
    starters: ["가족이 돌아가셨는데 상속재산과 빚을 ", "상속재산을 나누는 문제로 "],
    track: "inheritance",
    caseQuery: "상속재산분할",
    caseKinds: "가사·민사",
    examples: [],
  },
  consumer: {
    key: "consumer",
    label: "소비자·환불",
    description: "온라인 쇼핑·서비스 환불, 청약철회",
    guide:
      "물건이나 서비스를 산 쪽 기준으로 안내해요. 어디서 무엇을 샀고 판매자가 뭐라고 했는지 적어 주세요.",
    placeholder: "예: 온라인 쇼핑몰에서 산 옷을 반품하려는데 환불을 거절해요.",
    starters: ["온라인으로 산 물건을 환불받고 싶은데 ", "헬스장 이용권을 중간에 해지하고 싶어요. "],
    track: "consumer",
    caseQuery: "청약철회",
    caseKinds: "민사",
    examples: [],
  },
  defamation: {
    key: "defamation",
    label: "명예훼손·온라인",
    description: "악성 댓글, 허위 게시글, 단체방 모욕",
    guide:
      "피해를 본 쪽 기준으로 안내해요. 어디에 어떤 글이 올라왔는지 적어 주세요(실명·연락처는 빼고).",
    placeholder: "예: 커뮤니티에 저에 대한 허위 사실이 담긴 글이 올라왔어요.",
    starters: ["온라인에 저를 비방하는 글이 올라왔어요. ", "단체 대화방에서 모욕을 당했어요. "],
    track: "defamation",
    caseQuery: "명예훼손",
    caseKinds: "형사·민사",
    examples: [],
  },
};

export const CATEGORY_LIST: Category[] = CATEGORY_KEYS.map((k) => CATEGORIES[k]);

export function isCategoryKey(v: unknown): v is CategoryKey {
  return typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);
}
