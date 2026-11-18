// AI 절차 분류 라벨 — 순수 규칙 (DEC-033). 규칙(policy.ts)이 절차를 정하지 못한 질문만 다룬다.
// - 저장해 둔 라벨의 낱말이 질문에 있으면 AI를 다시 부르지 않는다 (같은 일을 두 번 하지 않기).
// - AI가 낸 결과는 저장 전에 여기서 검사한다: 숫자(기간·금액·조문 번호)·단정 표현·개인정보 패턴이 있으면 버린다 (절대 규칙 1·2·3·4).
// - 검증해 둔 기존 타임라인에 붙인 라벨은 바로 쓰고, AI가 새로 만든 단계 초안은 운영자 승인 뒤에만 화면에 나간다.
import { scanInput } from "@/lib/pii";
import { LIFE_TRACKS, type LifeTrackKey } from "./life-tracks";
import {
  OFFICIAL,
  TRACKS,
  type Difficulty,
  type OfficialLink,
  type ProcedureStep,
  type TrackKey,
} from "./steps";

export type KnownTrack = TrackKey | LifeTrackKey;

export const KNOWN_TRACKS = [...Object.keys(TRACKS), ...Object.keys(LIFE_TRACKS)] as KnownTrack[];
export const isKnownTrack = (v: unknown): v is KnownTrack =>
  typeof v === "string" && (KNOWN_TRACKS as string[]).includes(v);

/** AI에게 보여 줄 기존 타임라인 목록 (키와 제목만) */
export const TRACK_MENU: { key: KnownTrack; title: string }[] = KNOWN_TRACKS.map((key) => ({
  key,
  title: key in TRACKS ? TRACKS[key as TrackKey].title : LIFE_TRACKS[key as LifeTrackKey].title,
}));

export type LabelStep = {
  label: string;
  difficulty: Difficulty;
  prepare: string[];
  cautions: string[];
};

export type LabelStatus = "pending" | "approved" | "rejected";

export type ProcedureLabel = {
  id: string;
  title: string;
  keywords: string[];
  track: KnownTrack | null;
  steps: LabelStep[] | null;
  status: LabelStatus;
  hits: number;
  createdAt: string;
};

/** 결과에 실어 화면으로 보내는 값. 승인된 것만 담는다 */
export type ProcedureHint =
  { kind: "track"; track: KnownTrack } | { kind: "custom"; title: string; steps: LabelStep[] };

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

// 절대 규칙 2: 결과를 단정하거나 유불리를 말하는 표현
const ASSERTIVE =
  /반드시|무조건|확실|틀림없|승소|패소|이길수|이깁니다|질수없|유리합|불리합|%|꼭|항상|보장|처벌됩|처벌받|판결합|해결됩|받을수있습니다|인정됩니다/;
// 절대 규칙 3: 숫자(기간·금액·조문 번호)는 계산 함수·공식 기준만 낼 수 있다 — AI 문구에는 아예 두지 않는다.
// 아라비아 숫자뿐 아니라 한글로 쓴 숫자 + 단위("삼 개월", "십사 일", "석 달", "일주일", "보름")도 막는다
const DIGIT = /[0-9０-９]/;
const HANGUL_NUMBER =
  /(?:^|[^가-힣])[일이삼사오육칠팔구십백천만억]+\s*(?:일|주일|주|개월|달|년|해|시간|원|회|번|차례|명|건)(?![가-힣])|(?:^|[^가-힣])(?:한|두|세|석|네|넉|다섯|여섯|일곱|여덟|아홉|열|스무|서른)\s*(?:달|주|번|차례|시간|명|건)|일주일|보름|열흘|사흘|나흘|닷새|엿새|이레|며칠|이틀|하루/;
// 절대 규칙 1: 그 요청의 근거와 대조하지 않은 법령·조문 언급은 내보내지 않는다 ("○○법에 따라", "시행령", "조항")
const LAW_MENTION =
  /[가-힣]{2,}(?:법률|법|령|규칙)(?:에따라|에따른|에의하|상의|상|제[가-힣0-9])|시행령|시행규칙|조항|판례/;
// 너무 흔해서 다른 사건까지 끌어올 낱말
const TOO_COMMON =
  /^(문제|질문|방법|경우|상황|사람|상대|상대방|돈|소송|법|법률|신고|피해|계약|해결|어떻게|가능|내용|관련)$/;

/** AI가 쓴 문구 한 줄이 화면에 나가도 되는지 */
export function isCleanText(s: string, max: number): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > max) return false;
  if (DIGIT.test(t) || HANGUL_NUMBER.test(t)) return false;
  if (ASSERTIVE.test(norm(t)) || LAW_MENTION.test(norm(t).replace(/방법/g, ""))) return false;
  const scan = scanInput(t);
  return scan.findings.length === 0 && scan.sensitive.length === 0;
}

/** 질문에서 찾을 낱말: 질문에 실제로 있고, 흔한 낱말·숫자·개인정보가 아니어야 한다 */
export function cleanKeywords(raw: string[], question: string): string[] {
  const text = norm(question);
  const out: string[] = [];
  for (const k of raw) {
    const w = norm(k);
    if (w.length < 2 || w.length > 12 || TOO_COMMON.test(w)) continue;
    if (!/^[가-힣A-Za-z]+$/.test(w) || !text.includes(w)) continue;
    if (!isCleanText(w, 12) || out.includes(w)) continue;
    out.push(w);
  }
  return out.slice(0, 3);
}

export function cleanSteps(raw: LabelStep[]): LabelStep[] | null {
  if (raw.length < 2 || raw.length > 6) return null;
  const ok = raw.every(
    (s) =>
      isCleanText(s.label, 24) &&
      ["self", "depends", "expert"].includes(s.difficulty) &&
      s.prepare.length <= 4 &&
      s.cautions.length <= 4 &&
      [...s.prepare, ...s.cautions].every((t) => isCleanText(t, 80)),
  );
  return ok
    ? raw.map((s) => ({
        label: s.label.trim(),
        difficulty: s.difficulty,
        prepare: s.prepare.map((t) => t.trim()),
        cautions: s.cautions.map((t) => t.trim()),
      }))
    : null;
}

export type ClassifyOutput = {
  track: string;
  keywords: string[];
  proposal: { title: string; steps: LabelStep[] } | null;
};

/** 분류하지 못한 유형. 단계가 없어 승인할 수 없다 */
export const UNDECIDED_TITLE = "절차 미정";

export type NewLabel = Pick<ProcedureLabel, "title" | "keywords" | "track" | "steps" | "status">;

/**
 * AI 분류 결과를 저장할 라벨로 바꾼다. 검사를 통과하지 못하면 null (저장도 표시도 하지 않는다).
 * 라벨은 모두 pending으로 저장한다 — 낱말 하나가 다른 사람의 질문에도 적용되므로, 한 질문의 분류 결과를
 * 운영자 확인 없이 모두에게 쓰지 않는다. 기존 타임라인을 고른 경우 그 질문 한 건에만 바로 보인다(immediateHint).
 */
export function labelFromClassification(out: ClassifyOutput, question: string): NewLabel | null {
  const keywords = cleanKeywords(out.keywords, question);
  if (keywords.length === 0) return null;
  if (isKnownTrack(out.track)) {
    const title =
      out.track in TRACKS
        ? TRACKS[out.track as TrackKey].title
        : LIFE_TRACKS[out.track as LifeTrackKey].title;
    return { title, keywords, track: out.track, steps: null, status: "pending" };
  }
  const steps =
    out.proposal && isCleanText(out.proposal.title, 30) ? cleanSteps(out.proposal.steps) : null;
  // 맞는 절차도, 쓸 만한 초안도 없으면 "절차 미정"으로 남긴다 — 같은 낱말의 질문에 모델을 다시 부르지 않기 위해서다
  if (!out.proposal || !steps)
    return { title: UNDECIDED_TITLE, keywords, track: null, steps: [], status: "pending" };
  return { title: out.proposal.title.trim(), keywords, track: null, steps, status: "pending" };
}

/** 질문에 낱말이 있는 라벨. 거절된 것은 보지 않고, 낱말이 많이 맞는 것 → 긴 낱말 순 */
export function matchLabel(labels: ProcedureLabel[], question: string): ProcedureLabel | null {
  const text = norm(question);
  let best: { label: ProcedureLabel; score: number } | null = null;
  for (const label of labels) {
    if (label.status === "rejected") continue;
    const hit = label.keywords.filter((k) => text.includes(norm(k)));
    if (hit.length === 0) continue;
    const score = hit.length * 100 + Math.max(...hit.map((k) => k.length));
    if (!best || score > best.score) best = { label, score };
  }
  return best?.label ?? null;
}

/** 화면에 보낼 값. 승인 전 라벨은 null (AI는 다시 부르지 않되 타임라인은 보이지 않는다) */
export function hintOf(label: ProcedureLabel): ProcedureHint | null {
  if (label.status !== "approved") return null;
  if (label.track) return { kind: "track", track: label.track };
  return label.steps?.length ? { kind: "custom", title: label.title, steps: label.steps } : null;
}

/**
 * 방금 분류한 그 질문에 바로 보일 값. 검증해 둔 기존 타임라인을 고른 경우뿐이다 —
 * AI가 새로 쓴 단계는 승인 전에는 그 질문에도 보이지 않는다.
 */
export function immediateHint(label: NewLabel): ProcedureHint | null {
  return label.track ? { kind: "track", track: label.track } : null;
}

/** 서버가 보낸 값이 형식에 맞는지 (저장된 결과를 다시 읽을 때도 쓴다) */
export function parseHint(v: unknown): ProcedureHint | null {
  if (!v || typeof v !== "object") return null;
  const h = v as Record<string, unknown>;
  if (h.kind === "track") return isKnownTrack(h.track) ? { kind: "track", track: h.track } : null;
  if (h.kind !== "custom" || typeof h.title !== "string" || !Array.isArray(h.steps)) return null;
  const steps = cleanSteps(h.steps as LabelStep[]);
  return steps && isCleanText(h.title, 30) ? { kind: "custom", title: h.title, steps } : null;
}

export const CUSTOM_SECTION = "그 밖의 절차";
export const CUSTOM_REASON =
  "이 유형은 정해 둔 절차 안내가 없어 AI가 단계 초안을 쓰고 운영자가 문구를 확인했어요. 법률 전문가의 검토를 거친 것은 아니에요.";
/** AI가 분류했거나 단계를 쓴 안내에 붙는 문구 (규칙으로 고른 안내와 구분한다) */
export const AI_PROCEDURE_NOTE =
  "AI가 질문을 분류해 고른 안내이며 사건 결과를 판단한 것이 아니에요.";
export const CUSTOM_NOTE =
  "기관·사건에 따라 절차가 다를 수 있어요. 아래 공식 안내에서 먼저 확인해 주세요.";

const CUSTOM_LINKS: OfficialLink[] = [OFFICIAL.klac, OFFICIAL.ecfs];

/** 승인된 단계 초안을 타임라인 단계로. 링크는 AI가 정하지 않고 공식 안내 두 곳으로 고정한다 */
export function customSteps(steps: LabelStep[]): ProcedureStep[] {
  return steps.map((s, i) => ({
    key: `custom-${i + 1}`,
    label: s.label,
    difficulty: s.difficulty,
    prepare: s.prepare,
    cautions: s.cautions,
    links: CUSTOM_LINKS,
    question: `${s.label} 단계는 어떻게 진행하나요?`,
  }));
}
