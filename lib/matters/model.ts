// 사건 진행 (F-016, DEC-053) — 사건 한 건의 자료 모양과 순수 도우미. 브라우저와 서버가 함께 쓴다(다른 모듈을 끌어오지 않는다).
// 정리 도구다: 서류에 적힌 사실·당사자·요구·조항, 사용자가 덧붙인 메모, 출처가 붙은 조사 내용을 모을 뿐
// 승패·유불리·책임 비율 같은 판정 항목은 두지 않는다 (절대 규칙 2).

export const MATTER_LIMITS = {
  /** 한 계정이 만들 수 있는 사건 수 */
  perUser: 30,
  titleChars: 80,
  /** 사건 한 건 자료(JSON)의 크기 */
  dataBytes: 400_000,
  short: 120,
  line: 400,
  body: 6_000,
  docs: 40,
  facts: 200,
  parties: 60,
  relations: 120,
  demands: 80,
  clauses: 120,
  issues: 40,
  notes: 200,
  sources: 20,
} as const;

/** group = 이용자 집단·불특정 다수·신원 미상처럼 한 사람이나 한 회사가 아닌 것 */
export const MATTER_KINDS = ["business", "agency", "person", "group"] as const;
export type MatterKind = (typeof MATTER_KINDS)[number];
export const MATTER_KIND_LABEL: Record<MatterKind, string> = {
  business: "회사",
  agency: "기관",
  person: "개인",
  group: "집단·기타",
};

export const MATTER_SIDES = ["claimant", "respondent", "other"] as const;
export type MatterSide = (typeof MATTER_SIDES)[number];
export const MATTER_SIDE_LABEL: Record<MatterSide, string> = {
  claimant: "요구·청구하는 쪽",
  respondent: "요구·청구를 받는 쪽",
  other: "그 밖 (기관·제3자)",
};

export type MatterDocEntry = {
  id: string;
  title: string;
  type: string;
  /** 서류에 적힌 날짜 그대로 */
  date: string;
  gist: string;
  pages: number;
  addedAt: string;
};
export type MatterFact = { id: string; when: string; what: string; docId: string | null };
export type MatterParty = {
  id: string;
  name: string;
  kind: MatterKind;
  side: MatterSide;
  /** 서류에 적힌 역할 (발신, 수탁사, 통지 대리 등) */
  role: string;
  note: string;
};
export type MatterRelation = { id: string; from: string; to: string; label: string };
export type MatterDemand = { id: string; what: string; due: string; docId: string | null };
/** 서류가 든 계약·법령 조항. 서류에 적힌 그대로이며 원문과 대조하기 전이다 */
export type MatterClause = { id: string; ref: string; gist: string; docId: string | null };
export type MatterSource = { title: string; url: string };
export type MatterIssue = {
  id: string;
  /** 살펴볼 질문 */
  title: string;
  /** 사용자가 적는 메모 */
  detail: string;
  /** 법제처 조회로 인용을 확인한 문단만 (AI 정리일 때) */
  points: { text: string; label: string; url: string }[];
  unknowns: string[];
  byAi: boolean;
};
export const NOTE_KINDS = ["memo", "company", "search", "summary"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  memo: "메모",
  company: "기업 조사",
  search: "법령·판례",
  summary: "요약",
};
export type MatterNote = {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  /** 연결한 당사자·쟁점의 id */
  refs: string[];
  sources: MatterSource[];
  byAi: boolean;
  at: string;
};

export type MySide = "claimant" | "respondent" | "unknown";

export type MatterData = {
  version: 1;
  /** 사건 한 줄 요약 (사용자가 적는다) */
  summary: string;
  mySide: MySide;
  docs: MatterDocEntry[];
  facts: MatterFact[];
  parties: MatterParty[];
  relations: MatterRelation[];
  demands: MatterDemand[];
  clauses: MatterClause[];
  issues: MatterIssue[];
  notes: MatterNote[];
};

export const emptyMatter = (): MatterData => ({
  version: 1,
  summary: "",
  mySide: "unknown",
  docs: [],
  facts: [],
  parties: [],
  relations: [],
  demands: [],
  clauses: [],
  issues: [],
  notes: [],
});

export type MatterSummary = {
  id: string;
  title: string;
  updatedAt: string;
  counts: { docs: number; parties: number; issues: number; notes: number };
};

/** 서류 한 묶음을 읽은 결과 (POST /matters/read). 저장되지 않고 화면이 사건 자료에 합친다 */
export type MatterReading = {
  doc: { type: string; title: string; date: string; gist: string };
  parties: { name: string; kind: MatterKind; side: MatterSide; role: string; note: string }[];
  relations: { from: string; to: string; label: string }[];
  facts: { when: string; what: string }[];
  demands: { what: string; due: string }[];
  clauses: { ref: string; gist: string }[];
};

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);

const same = (a: string, b: string) =>
  a.normalize("NFKC").replace(/\s+/g, "").toLowerCase() ===
  b.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/**
 * 읽은 서류를 사건 자료에 합친다. 이름이 같은 당사자는 하나로 보고(비어 있던 역할·메모만 채움),
 * 사실·요구·조항은 그 서류에 묶어 덧붙인다. 모델을 쓰지 않는 단순 합치기다.
 */
export function mergeReading(data: MatterData, reading: MatterReading, pages: number): MatterData {
  const docId = newId();
  const now = new Date().toISOString();
  const parties = data.parties.map((p) => ({ ...p }));
  const idOf = (name: string): string | null => {
    const hit = parties.find((p) => same(p.name, name));
    return hit ? hit.id : null;
  };
  for (const p of reading.parties) {
    if (!p.name.trim()) continue;
    const hit = parties.find((x) => same(x.name, p.name));
    if (hit) {
      if (!hit.role) hit.role = p.role;
      if (!hit.note) hit.note = p.note;
      continue;
    }
    if (parties.length >= MATTER_LIMITS.parties) break;
    parties.push({ id: newId(), ...p });
  }
  const relations = [...data.relations];
  for (const r of reading.relations) {
    const from = idOf(r.from);
    const to = idOf(r.to);
    if (!from || !to || from === to) continue;
    if (relations.some((x) => x.from === from && x.to === to && same(x.label, r.label))) continue;
    if (relations.length >= MATTER_LIMITS.relations) break;
    relations.push({ id: newId(), from, to, label: r.label });
  }
  return {
    ...data,
    docs: [...data.docs, { id: docId, ...reading.doc, pages, addedAt: now }].slice(
      -MATTER_LIMITS.docs,
    ),
    parties,
    relations,
    facts: [...data.facts, ...reading.facts.map((f) => ({ id: newId(), ...f, docId }))].slice(
      0,
      MATTER_LIMITS.facts,
    ),
    demands: [...data.demands, ...reading.demands.map((d) => ({ id: newId(), ...d, docId }))].slice(
      0,
      MATTER_LIMITS.demands,
    ),
    clauses: [...data.clauses, ...reading.clauses.map((c) => ({ id: newId(), ...c, docId }))].slice(
      0,
      MATTER_LIMITS.clauses,
    ),
  };
}

/** "2026-11-05 00:53"·"2026.03.05 이후"처럼 날짜로 시작하면 정렬용 값, 아니면 null */
export function sortKeyOf(when: string): string | null {
  const m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/.exec(
    when,
  );
  if (!m) return null;
  const pad = (v: string | undefined) => (v ?? "0").padStart(2, "0");
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5])}`;
}

/** 날짜가 있는 사실은 날짜순, 없는 사실은 넣은 순서대로 뒤에 */
export function sortFacts<T extends { when: string }>(facts: T[]): T[] {
  return facts
    .map((f, i) => ({ f, i, k: sortKeyOf(f.when) }))
    .sort((a, b) => {
      if (a.k && b.k) return a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i;
      if (a.k) return -1;
      if (b.k) return 1;
      return a.i - b.i;
    })
    .map((x) => x.f);
}

/**
 * 쟁점 정리에 보낼 글 (사실·요구·조항을 한 문장으로). 서버가 이름·연락처를 가린 뒤 모델에 보낸다.
 * 사람 이름 대신 역할이 보이도록 당사자 표를 앞에 둔다.
 */
export function composeIssueText(data: MatterData, maxChars = 1_900): string {
  const head = [
    data.summary.trim() ? `사건 요약: ${data.summary.trim()}` : "",
    data.mySide !== "unknown"
      ? `질문자의 자리: ${data.mySide === "claimant" ? "요구·청구하는 쪽" : "요구·청구를 받은 쪽"}`
      : "",
    data.parties.length > 0
      ? `당사자: ${data.parties
          .slice(0, 8)
          .map((p) => `${p.name}(${p.role || MATTER_KIND_LABEL[p.kind]})`)
          .join(", ")}`
      : "",
  ].filter(Boolean);
  const facts = sortFacts(data.facts).map((f) => `- ${f.when ? `${f.when} ` : ""}${f.what}`);
  const demands = data.demands.map((d) => `- ${d.what}${d.due ? ` (${d.due})` : ""}`);
  const out: string[] = [...head];
  let length = out.join("\n").length;
  const push = (title: string, lines: string[]) => {
    if (lines.length === 0) return;
    if (length + title.length + 1 > maxChars) return;
    out.push(title);
    length += title.length + 1;
    for (const l of lines) {
      if (length + l.length + 1 > maxChars) break;
      out.push(l);
      length += l.length + 1;
    }
  };
  push("사실관계:", facts);
  push("서류의 요구:", demands);
  out.push("질문: 이 사건에서 따로 살펴봐야 할 법률 쟁점과 관련 법령·판례를 정리해 주세요.");
  return out.join("\n").slice(0, 2_000);
}
