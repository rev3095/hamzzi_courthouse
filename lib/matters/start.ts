// 새 사건 만들기 창(2026-11-27 사용자 요청, DEC-073 보강)의 순수 규칙 — DeepSearch 양식(lib/inquiries/deep.ts)처럼
// 칸을 나눠 받은 내용을 사건 자료(MatterData)로 바꾼다. 모델을 부르지 않고(비용 0), 적은 것만 담는다 — 판정 항목은 만들지 않는다.
// 글자 수·개수는 저장 검증(MatterDataZ)과 같은 한도로 미리 자른다. 연락처·등록번호 꼴은 저장할 때 서버가 가린다.
import {
  MATTER_LIMITS,
  emptyMatter,
  newId,
  type MatterData,
  type MatterKind,
  type MatterSide,
  type MySide,
} from "./model";

export type StartMode = "docs" | "write";
export type StartParty = { name: string; kind: MatterKind };
export type StartValues = {
  title: string;
  mySide: MySide;
  parties: StartParty[];
  /** 있었던 일 — 한 줄에 하나, 앞에 날짜를 적으면 날짜 칸으로 나눈다 */
  facts: string;
  /** 받은 요구·하려는 요구 — 한 줄에 하나 */
  demands: string;
  summary: string;
};

export const START_LIMITS = {
  title: MATTER_LIMITS.titleChars,
  summary: MATTER_LIMITS.line,
  /** 처음 만들 때 받는 상대방 수 (나머지는 사건 화면에서 더한다) */
  parties: 6,
  partyName: MATTER_LIMITS.short,
  /** 여러 줄 칸 하나의 글자 수 */
  lines: 4_000,
} as const;

export const EMPTY_START: StartValues = {
  title: "",
  mySide: "unknown",
  parties: [],
  facts: "",
  demands: "",
  summary: "",
};

export const MY_SIDE_CHOICES: { value: MySide; label: string; hint: string }[] = [
  { value: "claimant", label: "요구하는 쪽", hint: "돈·물건·행동을 돌려받거나 요구해요" },
  { value: "respondent", label: "요구받는 쪽", hint: "요구·청구·통지를 받았어요" },
  { value: "unknown", label: "아직 모르겠어요", hint: "나중에 사건 화면에서 고를 수 있어요" },
];

export const START_MODES: { value: StartMode; title: string; body: string; next: string }[] = [
  {
    value: "docs",
    title: "서류부터 올리기",
    body: "계약서·내용증명·통지서 사진을 올리면 AI가 읽어 사실관계·당사자·요구로 나눠 담아요.",
    next: "이름과 입장만 정하고 바로 서류 올리기로 넘어가요",
  },
  {
    value: "write",
    title: "직접 적어서 시작",
    body: "상대방·있었던 일·요구를 칸에 나눠 적으면 그대로 사건 자료로 담아요. 담을 때는 AI를 쓰지 않아요.",
    next: "적은 내용을 확인한 뒤 사건을 만들어요",
  },
];

/** 가상 예시 (지어낸 사건). 실제 사람·회사가 아니다 */
export const START_EXAMPLE: StartValues = {
  title: "전세 보증금 반환",
  mySide: "claimant",
  parties: [
    { name: "집주인", kind: "person" },
    { name: "공인중개사사무소 A", kind: "business" },
  ],
  facts: [
    "2024.03.02 전세 계약을 맺고 입주",
    "2026.01.10 재계약하지 않겠다고 문자로 알림",
    "2026.03.02 계약이 끝났지만 보증금을 돌려받지 못함",
    "집주인은 새 세입자가 들어와야 돌려줄 수 있다고 답함",
  ].join("\n"),
  demands: [
    "보증금을 돌려 달라고 요구",
    "이사 날짜를 정해야 해서 언제 돌려줄지 알려 달라고 요구",
  ].join("\n"),
  summary: "계약이 끝났는데 전세 보증금을 돌려받지 못한 일",
};

const lines = (text: string) =>
  text
    .slice(0, START_LIMITS.lines)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);

// 줄 앞의 날짜: 2026.03.02 · 2026-3-2 · 2026/03 · 2026년 3월 2일 · 3월 2일 · 3.2
const LEADING_DATE =
  /^((?:\d{4}\s*[.\-/년]\s*\d{1,2}(?:\s*[.\-/월]\s*\d{1,2}\s*일?)?\s*(?:월|\.)?)|(?:\d{1,2}\s*월\s*\d{1,2}\s*일)|(?:\d{1,2}\.\d{1,2}\.?))\s*[:\-–·,]?\s+(.+)$/;

/** 있었던 일 한 줄 → 날짜·내용. 날짜를 알아보지 못하면 날짜 칸을 비운다 (지어내지 않는다) */
export function splitFactLine(line: string): { when: string; what: string } {
  const m = LEADING_DATE.exec(line.trim());
  if (!m) return { when: "", what: line.trim().slice(0, MATTER_LIMITS.line) };
  return {
    when: m[1].trim().replace(/\.$/, "").slice(0, MATTER_LIMITS.short),
    what: m[2].trim().slice(0, MATTER_LIMITS.line),
  };
}

const partySide = (mySide: MySide): MatterSide =>
  mySide === "claimant" ? "respondent" : mySide === "respondent" ? "claimant" : "other";

/** 칸에 적은 내용을 사건 자료로. 비운 칸은 비운 채로 둔다 */
export function composeStart(v: StartValues, mode: StartMode): { title: string; data: MatterData } {
  const data = emptyMatter();
  data.mySide = v.mySide;
  const title = v.title.trim().slice(0, START_LIMITS.title);
  if (mode === "docs") return { title, data };
  data.summary = v.summary.trim().slice(0, START_LIMITS.summary);
  data.parties = v.parties
    .map((p) => ({ ...p, name: p.name.trim().slice(0, START_LIMITS.partyName) }))
    .filter((p) => p.name)
    .slice(0, START_LIMITS.parties)
    .map((p) => ({
      id: newId(),
      name: p.name,
      kind: p.kind,
      side: partySide(v.mySide),
      role: "상대방",
      note: "",
    }));
  data.facts = lines(v.facts)
    .slice(0, MATTER_LIMITS.facts)
    .map((l) => ({ id: newId(), ...splitFactLine(l), docId: null }));
  data.demands = lines(v.demands)
    .slice(0, MATTER_LIMITS.demands)
    .map((l) => ({ id: newId(), what: l.slice(0, MATTER_LIMITS.line), due: "", docId: null }));
  return { title, data };
}

/** 확인 단계에 보이는 담길 항목 수 */
export function startCounts(v: StartValues, mode: StartMode) {
  const { data } = composeStart(v, mode);
  return {
    parties: data.parties.length,
    facts: data.facts.length,
    dated: data.facts.filter((f) => f.when).length,
    demands: data.demands.length,
    summary: data.summary.length > 0,
  };
}
