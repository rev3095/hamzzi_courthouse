// 심층 질문 (DeepSearch, DEC-034) — 순수 규칙. 길고 복잡한 사연을 정해 둔 칸으로 받아 짧고 빠짐없이 만든다.
// - 칸마다 길이를 정해 합쳐도 질문 한도(MAX_INPUT_CHARS) 안에 들어온다 — 자유 양식보다 모델 입력이 줄어든다.
// - 보내기 전 점검(reviewDeep)은 모델 없이 규칙으로 한다(비용 0). 빠진 내용을 알려 주고, 많이 부족하면 한 번 더 묻는다.
// - 점검은 "있어야 할 내용이 있는가"만 본다. 사연의 유불리나 결과를 판단하지 않는다 (절대 규칙 2).
import { MAX_INPUT_CHARS } from "./policy";

export type DeepKey = "facts" | "other" | "done" | "proof" | "ask";

export type DeepField = {
  key: DeepKey;
  label: string;
  required: boolean;
  hint: string;
  placeholder: string;
  max: number;
  rows: number;
};

export const DEEP_FIELDS: DeepField[] = [
  {
    key: "facts",
    label: "무슨 일이 있었나요",
    required: true,
    hint: "언제, 어떤 일이 있었는지 일어난 순서대로 적어 주세요. 날짜나 기간, 금액이 있으면 함께 적어 주세요.",
    placeholder:
      "예: 2년 전세 계약이 지난달에 끝났어요. 계약 끝나기 세 달 전에 나가겠다고 문자로 알렸는데, 이사한 뒤에도 보증금 1억 원을 돌려받지 못했어요.",
    max: 1100,
    rows: 6,
  },
  {
    key: "other",
    label: "상대방은 누구인가요",
    required: true,
    hint: "이름 대신 관계로 적어 주세요 (집주인, 회사, 판매자, 이웃 등).",
    placeholder: "예: 집주인 (개인)",
    max: 120,
    rows: 1,
  },
  {
    key: "done",
    label: "지금까지 한 일",
    required: false,
    hint: "연락, 내용증명, 신고처럼 이미 해 본 것이 있으면 적어 주세요.",
    placeholder: "예: 문자와 전화로 여러 번 요청했고, 내용증명은 아직 보내지 않았어요.",
    max: 280,
    rows: 2,
  },
  {
    key: "proof",
    label: "가지고 있는 자료",
    required: false,
    hint: "계약서, 문자, 이체 내역, 사진 등",
    placeholder: "예: 임대차계약서, 주고받은 문자, 보증금 이체 내역",
    max: 180,
    rows: 1,
  },
  {
    key: "ask",
    label: "알고 싶은 것",
    required: true,
    hint: "무엇을 하고 싶은지, 무엇이 궁금한지 적어 주세요.",
    placeholder: "예: 보증금을 돌려받으려면 어떤 절차를 밟아야 하나요?",
    max: 240,
    rows: 2,
  },
];

export type DeepValues = Record<DeepKey, string>;

export const EMPTY_DEEP: DeepValues = { facts: "", other: "", done: "", proof: "", ask: "" };

const HEAD: Record<DeepKey, string> = {
  facts: "있었던 일",
  other: "상대방",
  done: "지금까지 한 일",
  proof: "가지고 있는 자료",
  ask: "알고 싶은 것",
};

/** 칸을 한 문장으로 합친다. 빈 칸은 뺀다. 칸 길이의 합이 질문 한도를 넘지 않게 정해져 있다 */
export function composeDeep(v: DeepValues): string {
  return DEEP_FIELDS.map((f) => [f, v[f.key].trim().slice(0, f.max)] as const)
    .filter(([, text]) => text)
    .map(([f, text]) => `[${HEAD[f.key]}] ${text}`)
    .join("\n")
    .slice(0, MAX_INPUT_CHARS);
}

/** 직접 입력할 때 화면에 보여 주는 안내 (칸과 같은 내용) */
export const DEEP_FREE_GUIDE: string[] = [
  "언제, 어떤 일이 있었는지 (일어난 순서대로)",
  "상대방이 누구인지 (이름 대신 관계)",
  "금액이나 대상 (보증금, 월급, 물건 등)",
  "지금까지 한 일과 가지고 있는 자료",
  "무엇을 알고 싶은지",
];

export type DeepCheck = { key: "length" | "when" | "who" | "what" | "ask"; message: string };

export type DeepReview = {
  /** 빠진 것으로 보이는 내용 (없으면 빈 배열) */
  missing: DeepCheck[];
  /** 많이 부족하다 — 보내기 전에 "그래도 진행하시겠습니까?"를 묻는다 */
  thin: boolean;
};

const WHEN =
  /[0-9０-９]+\s*(년|월|일|주|개월|달|시간)|작년|재작년|올해|지난|어제|오늘|그저께|최근|얼마\s*전|전부터|때부터|동안|당시|만료|끝났|끝난|이후/;
const WHO =
  /집주인|임대인|임차인|세입자|회사|사장|대표|직장|상사|동료|판매자|구매자|업체|가게|이웃|윗집|아랫집|옆집|친구|지인|가족|배우자|남편|아내|부모|형제|자매|상대|가해자|보험사|은행|기관|학원|병원|플랫폼|쇼핑몰/;
const WHAT =
  /[0-9０-９,]+\s*(원|만\s*원|억)|보증금|전세금|월세|월급|임금|퇴직금|수당|대금|계약금|위약금|환불|물건|차량|집|건물|땅|빌려|배상|치료비|수리비/;
const ASK = /[?？]|싶|궁금|가능|할\s*수|될까|되나|인가요|나요|방법|어떻게|알려|절차|받을\s*수/;

const MIN_FACTS = 40;

const MESSAGES: Record<DeepCheck["key"], string> = {
  length: "있었던 일을 조금 더 자세히 적어 주세요.",
  when: "언제 있었던 일인지 (날짜나 기간)",
  who: "상대방이 누구인지 (이름 대신 관계)",
  what: "무엇에 관한 일인지 (금액이나 대상)",
  ask: "무엇을 알고 싶은지",
};

/**
 * 보내기 전 점검 (모델 없음). 양식이면 칸 값, 직접 입력이면 text만 준다.
 * 날짜·상대방·대상·질문이 보이는지만 본다 — 내용을 평가하지 않는다.
 */
export function reviewDeep(input: { values?: DeepValues; text?: string }): DeepReview {
  const v = input.values;
  const facts = (v ? v.facts : (input.text ?? "")).trim();
  const all = (v ? composeDeep(v) : (input.text ?? "")).normalize("NFKC");
  const who = v ? v.other.trim().length > 0 : WHO.test(all);
  const ask = v ? v.ask.trim().length > 0 : ASK.test(all);

  const keys: DeepCheck["key"][] = [];
  if (facts.length < MIN_FACTS) keys.push("length");
  if (!WHEN.test(all)) keys.push("when");
  if (!who) keys.push("who");
  if (!WHAT.test(all)) keys.push("what");
  if (!ask) keys.push("ask");

  return {
    missing: keys.map((key) => ({ key, message: MESSAGES[key] })),
    thin: keys.includes("length") || keys.length >= 3,
  };
}

/** 심층 질문에서 모델에 넘겨 볼 근거 수 — 같은 비용 상한 안에서만 더 넣는다 (넘으면 뒤에서부터 뺀다) */
export const DEEP_EVIDENCE = { articles: 8, cases: 4 } as const;
