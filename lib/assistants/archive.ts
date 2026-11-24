// 전문 에이전트 아카이브 (F-018, DEC-057): 미리 만든 질답 세트. 순수 모듈 — 형식·거르기 규칙.
// 한 세트 = DeepSearch 결과(Opus 5.5 high 근거 답변 + 인용 검증 + 사건 구조 시각자료) + 정리 한 번(Opus 5.5 high):
//   지금 상황 · 절차 단계 · 민사 관점 · 형사 관점 · 필요한 증거 · 서류 정리 단계.
// 민사·형사 문단은 근거 키를 달고 같은 인용 검증(verifyDraft)을 거친 것만 남는다 (절대 규칙 1).
// 근거 키가 없는 정리 문장(상황·단계·증거·서류)은 숫자·조문·사건번호·결과 판정·단정 표현·개인정보가 있으면 버린다 (절대 규칙 2·3·4).
import { z } from "zod";
import { isAssertive } from "@/lib/ai/policy";
import type { CheckedPoint, DemoAnalysisResult } from "@/lib/citations/policy";
import { articlesIn, caseNumbersIn } from "@/lib/citations/patterns";
import { scanInput } from "@/lib/pii";
import type { AssistantId } from "./agents";
import type { ArchiveSide, DocStage } from "./archive-scenarios";
import { hasNumber } from "./talk";

export const ARCHIVE_LIMITS = {
  pointsPerSide: 4,
  evidence: 7,
  nextSteps: 4,
  docSteps: 6,
  line: 220,
} as const;

/** 아카이브 한 세트 (lib/assistants/archive-data/*.json) */
export type ArchiveItem = {
  id: string;
  assistant: AssistantId;
  side: ArchiveSide;
  stage: DocStage;
  title: string;
  question: string;
  /** DeepSearch 결과 (검증된 문단·근거 목록·사건 구조 시각자료) — 체험하기는 이것을 재생한다 */
  result: DemoAnalysisResult;
  /** 지금 상황 (사연 속 사실만) */
  situation: string;
  /** 절차상 지금 단계와 다음 단계 */
  steps: { now: string; next: string[] };
  /** 민사·형사 관점 — 검증을 통과한 문단만. 해당이 적으면 note에 한 줄 */
  civil: { points: CheckedPoint[]; note: string | null };
  criminal: { points: CheckedPoint[]; note: string | null };
  /** 필요한 증거 */
  evidence: { item: string; why: string; status: "있음" | "확인 필요" }[];
  /** 서류 정리 단계 (쓸 때·받았을 때) */
  document: { title: string; steps: string[] };
  meta: {
    model: string;
    effort: string;
    promptVersion: string;
    costUsd: number;
    generatedAt: string;
  };
};

// ── 정리 호출 출력 형식 ────────────────────────────────────────
const pointSchema = (keys: string[]) => ({
  type: "array",
  items: {
    type: "object",
    properties: {
      text: { type: "string", description: "근거로 뒷받침되는 설명 한 문단" },
      source: { type: "string", enum: keys },
      quote: { type: "string", description: "근거 원문에서 글자 그대로 옮긴 20~60자" },
    },
    required: ["text", "source", "quote"],
    additionalProperties: false,
  },
});

export function archiveSchema(keys: string[]) {
  return {
    type: "object",
    properties: {
      situation: { type: "string" },
      steps: {
        type: "object",
        properties: { now: { type: "string" }, next: { type: "array", items: { type: "string" } } },
        required: ["now", "next"],
        additionalProperties: false,
      },
      civil: {
        type: "object",
        properties: { points: pointSchema(keys), note: { type: "string" } },
        required: ["points", "note"],
        additionalProperties: false,
      },
      criminal: {
        type: "object",
        properties: { points: pointSchema(keys), note: { type: "string" } },
        required: ["points", "note"],
        additionalProperties: false,
      },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            why: { type: "string" },
            status: { type: "string", enum: ["있음", "확인 필요"] },
          },
          required: ["item", "why", "status"],
          additionalProperties: false,
        },
      },
      document: {
        type: "object",
        properties: {
          title: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
        },
        required: ["title", "steps"],
        additionalProperties: false,
      },
    },
    required: ["situation", "steps", "civil", "criminal", "evidence", "document"],
    additionalProperties: false,
  };
}

const PointZ = z.object({ text: z.string(), source: z.string(), quote: z.string() });
export const ArchiveRawZ = z.object({
  situation: z.string(),
  steps: z.object({ now: z.string(), next: z.array(z.string()) }),
  civil: z.object({ points: z.array(PointZ), note: z.string() }),
  criminal: z.object({ points: z.array(PointZ), note: z.string() }),
  evidence: z.array(
    z.object({ item: z.string(), why: z.string(), status: z.enum(["있음", "확인 필요"]) }),
  ),
  document: z.object({ title: z.string(), steps: z.array(z.string()) }),
});
export type ArchiveRaw = z.infer<typeof ArchiveRawZ>;

// ── 근거 키 없는 정리 문장 거르기 ───────────────────────────────
/** 사건 결과·유불리 판정 (절대 규칙 2). 요건 설명은 근거 문단(민사·형사)에서만 한다 */
const OUTCOME =
  /승률|승소|패소|이길|이깁|이기실|질\s*거|성공\s*(확률|가능)|가능성|확률|유리|불리|처벌\s*(을|이)?\s*(받|될|됩)|무죄|유죄|구속(될|됩)|인정될\s*거|돌려받을\s*수\s*있습니다/;

/**
 * 성립 요건·해당 여부 같은 법적 결론은 근거 문단(민사·형사)에서만 한다 — 정리 문장에는 두지 않는다 (절대 규칙 1·2).
 * "판결·법률구조기관·제도에 해당하는지"처럼 절차를 가리키는 말은 통과시킨다
 */
const LEGAL_CONCLUSION =
  /[가-힣]죄(가|로|에|입|이에|는|를)|(?<!(제도|기관|절차|대상|서류|요건)에\s*)해당(해|합|될|됩|하므로|한다)|성립(해|합|할|하|될|됩|한다)|범죄(예|입|이에|로)|돌려받(으실|을)\s*수\s*있/;
/** "○○법에 따라·○○법상·○○법 제" 꼴의 법적 근거 주장 (조문 대조 없이 정리 문장에 두지 않는다). 띄어쓰기를 지우고 본다 */
const LAW_BASIS = /[가-힣]{2,}(법률|법|령|규칙)(에따라|에따른|에의하|상의|상|제[가-힣0-9])/;

export function guideLineOk(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > ARCHIVE_LIMITS.line) return false;
  if (hasNumber(t)) return false;
  if (isAssertive(t) || OUTCOME.test(t)) return false;
  // 정리 문장은 사용자의 상황만 — 에이전트·서비스 자신에 대한 말은 버린다
  if (/고소미|내집마련|중고천국|비서|에이전트|햄찌/.test(t)) return false;
  if (LEGAL_CONCLUSION.test(t) || LAW_BASIS.test(t.replace(/\s+/g, ""))) return false;
  if (articlesIn(t).length > 0 || caseNumbersIn(t).length > 0) return false;
  if (scanInput(t).findings.length > 0) return false;
  return true;
}

const keepLines = (lines: string[], max: number) =>
  lines
    .map((s) => s.trim())
    .filter(guideLineOk)
    .slice(0, max);

/** 저장된 세트도 읽을 때 같은 규칙으로 다시 거른다 — 규칙을 강화하면 다시 만들지 않아도 화면에 바로 적용된다 */
export function rescreenItem(item: ArchiveItem): ArchiveItem {
  const ok = (s: string) => guideLineOk(s);
  return {
    ...item,
    situation: ok(item.situation) ? item.situation : "",
    steps: { now: ok(item.steps.now) ? item.steps.now : "", next: item.steps.next.filter(ok) },
    civil: { ...item.civil, note: item.civil.note && ok(item.civil.note) ? item.civil.note : null },
    criminal: {
      ...item.criminal,
      note: item.criminal.note && ok(item.criminal.note) ? item.criminal.note : null,
    },
    evidence: item.evidence.filter((e) => ok(e.item) && ok(e.why)),
    document: {
      title: ok(item.document.title) ? item.document.title : "",
      steps: item.document.steps.filter(ok),
    },
  };
}

/** 근거 키가 없는 부분을 거른다. 민사·형사 문단은 따로 인용 검증을 거친다 */
export function screenGuide(raw: ArchiveRaw) {
  const note = (s: string) => (s.trim() && guideLineOk(s) ? s.trim() : null);
  return {
    situation: guideLineOk(raw.situation) ? raw.situation.trim() : "",
    steps: {
      now: guideLineOk(raw.steps.now) ? raw.steps.now.trim() : "",
      next: keepLines(raw.steps.next, ARCHIVE_LIMITS.nextSteps),
    },
    civilNote: note(raw.civil.note),
    criminalNote: note(raw.criminal.note),
    evidence: raw.evidence
      .filter((e) => guideLineOk(e.item) && guideLineOk(e.why))
      .slice(0, ARCHIVE_LIMITS.evidence)
      .map((e) => ({ item: e.item.trim(), why: e.why.trim(), status: e.status })),
    document: {
      title: guideLineOk(raw.document.title) ? raw.document.title.trim() : "",
      steps: keepLines(raw.document.steps, ARCHIVE_LIMITS.docSteps),
    },
  };
}
