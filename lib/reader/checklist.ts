// 섹션별 "확인할 사실" (DEC-048) — 고정 문안. 질문에서 이미 보이는 항목은 "적어 주신 것"으로, 없는 항목은 "더 확인할 것"으로 나눈다.
// 문구에는 숫자·기간·단정 표현을 넣지 않는다 (reader.test.ts가 막는다). 유불리를 말하지 않고, 무엇이 있으면 상담·절차가 쉬워지는지만 적는다.
import type { Facts } from "./facts";
import type { Section } from "./lexicon";
import type { Role } from "./role";

export type CheckItem = { key: string; text: string; has: (f: Facts, text: string) => boolean };

const when: CheckItem = {
  key: "when",
  text: "언제 일어난 일인지 (날짜·기간)",
  has: (f) => f.when.length > 0,
};
const who: CheckItem = {
  key: "who",
  text: "상대방이 누구인지 (관계·회사 이름 등)",
  has: (f) => f.parties.length > 0,
};
const money: CheckItem = {
  key: "money",
  text: "주고받은 돈이나 받지 못한 금액",
  has: (f) => f.money.length > 0,
};
const proof: CheckItem = {
  key: "proof",
  text: "남아 있는 자료 (계약서·문자·이체 내역·사진 등)",
  has: (f) => f.evidence.length > 0,
};
const done: CheckItem = {
  key: "done",
  text: "지금까지 해 본 일 (요구·신고·상담 등)",
  has: (f) => f.done.length > 0,
};
const contract: CheckItem = {
  key: "contract",
  text: "계약서나 약속한 내용이 남아 있는지",
  has: (f) => f.evidence.some((e) => /계약서|차용증|문자|메신저/.test(e)),
};
const notice: CheckItem = {
  key: "notice",
  text: "받은 통지서·고지서에 적힌 처분 이름과 받은 날",
  has: (f) => f.evidence.some((e) => /고지서|통지서/.test(e)),
};
const papers: CheckItem = {
  key: "papers",
  text: "받은 서류의 이름과 받은 날, 서류에 적힌 기한",
  has: (f) => f.evidence.some((e) => /법원 서류|고지서|통지서/.test(e)),
};
const safety: CheckItem = {
  key: "safety",
  text: "지금 안전한지, 상대방과 떨어져 있는지",
  has: (_f, t) => /안전|분리|피했|떨어져|이사했|따로살/.test(t),
};
const injury: CheckItem = {
  key: "injury",
  text: "다친 곳이 있다면 진료 기록이나 진단서",
  has: (f) => f.evidence.some((e) => /진단서|진료 기록/.test(e)),
};
const work: CheckItem = {
  key: "work",
  text: "일한 기간과 근무 형태 (정규직·계약직·아르바이트)",
  has: (_f, t) => /정규직|계약직|알바|아르바이트|수습|프리랜서|근무|일했|다녔/.test(t),
};
const workProof: CheckItem = {
  key: "workProof",
  text: "근로계약서·급여 내역·출퇴근 기록",
  has: (f) => f.evidence.some((e) => /근로계약서|급여명세서|출퇴근|이체 내역/.test(e)),
};
const place: CheckItem = {
  key: "place",
  text: "어디서 일어났는지 (온라인이면 어느 곳의 글·메시지인지)",
  has: (_f, t) =>
    /단톡|카톡|인스타|유튜브|커뮤니티|카페|댓글|게시판|회사|학교|집|부대|현장|매장|병원/.test(t),
};
const capture: CheckItem = {
  key: "capture",
  text: "글·메시지를 지우기 전에 남긴 캡처와 주소",
  has: (f) => f.evidence.some((e) => /캡처|메신저|문자/.test(e)),
};
const family: CheckItem = {
  key: "family",
  text: "가족 관계와 지금까지 정한 것 (협의한 내용·자녀 여부)",
  has: (_f, t) => /자녀|아이|아들|딸|협의|합의/.test(t),
};
const property: CheckItem = {
  key: "property",
  text: "관련 재산이나 물건의 목록 (부동산·예금·빚)",
  has: (_f, t) => /집|아파트|땅|예금|통장|빚|재산|주식|차/.test(t),
};
const purpose: CheckItem = {
  key: "purpose",
  text: "무엇을 하려는지 (신청·등록·참여하려는 것)",
  has: (_f, t) => /하려|하고싶|할수|가능|방법|어떻게/.test(t),
};
const debt: CheckItem = {
  key: "debt",
  text: "빚의 종류와 채권자 목록, 소득과 재산",
  has: (_f, t) => /대출|카드|대부|사채|소득|월급/.test(t),
};
const record: CheckItem = {
  key: "record",
  text: "진료·작업 기록이나 사고 당시 기록",
  has: (f) => f.evidence.some((e) => /진단서|진료 기록|사진|영상|CCTV|본 사람/.test(e)),
};

/** 섹션 묶음별 확인 항목 */
const GROUPS: { sections: Section[]; items: CheckItem[] }[] = [
  {
    sections: ["lease_deposit", "lease_residence", "commercial_lease", "contract_deposit"],
    items: [contract, when, money, done, proof],
  },
  { sections: ["wage", "dismissal"], items: [work, workProof, when, money, done] },
  { sections: ["workplace_harassment"], items: [who, place, when, proof, done] },
  { sections: ["industrial_accident", "medical"], items: [when, place, record, injury, done] },
  {
    sections: ["fraud", "money", "consumer", "insurance_claim", "property_defect"],
    items: [who, money, when, contract, done],
  },
  { sections: ["traffic"], items: [when, place, record, injury, done] },
  { sections: ["neighbor"], items: [who, when, proof, done] },
  { sections: ["family", "inheritance"], items: [family, property, when, proof] },
  {
    sections: ["defamation", "insult", "copyright", "privacy"],
    items: [place, capture, when, who, done],
  },
  {
    sections: [
      "assault",
      "stalking",
      "sex_crime",
      "domestic_violence",
      "school_violence",
      "military_abuse",
    ],
    items: [safety, when, who, injury, proof],
  },
  { sections: ["voice_phishing", "crime_report"], items: [when, money, proof, done] },
  {
    sections: ["admin_appeal", "welfare_appeal", "tax_appeal", "fine_objection"],
    items: [notice, when, money, done],
  },
  { sections: ["military_discharge"], items: [record, when, done] },
  { sections: ["respond_civil"], items: [papers, who, money, proof] },
  { sections: ["respond_criminal", "military_criminal"], items: [papers, when, proof, done] },
  { sections: ["debt_relief"], items: [debt, money, done] },
  { sections: ["auction", "registration", "business_permit"], items: [purpose, property, when] },
];

const OWES_ITEMS: CheckItem[] = [papers, who, money, contract, done];
const DEFAULT_ITEMS: CheckItem[] = [when, who, money, proof, done];

export type Checklist = { given: string[]; missing: string[] };

/** 섹션(없으면 기본)과 입장에 맞는 확인 항목을 적어 준 것 / 더 확인할 것으로 나눈다 */
export function checklistFor(
  section: Section | null,
  role: Role,
  facts: Facts,
  text: string,
): Checklist {
  const items =
    role === "owes" && !section
      ? OWES_ITEMS
      : (GROUPS.find((g) => section && g.sections.includes(section))?.items ?? DEFAULT_ITEMS);
  const given: string[] = [];
  const missing: string[] = [];
  for (const it of items) (it.has(facts, text) ? given : missing).push(it.text);
  return { given, missing };
}

/** 고정 문구 전부 (숫자·단정 표현 검사용) */
export const CHECK_TEXTS: string[] = [
  ...new Set(
    [...GROUPS.flatMap((g) => g.items), ...OWES_ITEMS, ...DEFAULT_ITEMS].map((i) => i.text),
  ),
];
