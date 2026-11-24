// 전문 에이전트 아카이브 한 세트 만들기 (F-018, DEC-057). 생성은 tests/live/assistant-archive.live.test.ts(유료)만 부른다 — 서비스 요청 경로에서 쓰지 않는다.
// ① DeepSearch(lib/ai/deep.ts): Haiku 사건 구조화 → 쟁점별 법제처 검색 → Pro Max(Opus 5.5 effort high) 근거 답변
// ② 인용 검증(verifyDraft) + 사건 구조 시각자료(buildDeepMap)
// ③ 정리 한 번(Opus 5.5 high, 같은 근거 목록): 상황·단계·민사·형사·증거·서류 단계 → 민사·형사 문단은 ②와 같은 검증, 나머지는 guideLineOk로 거른다
import "server-only";
import { ASSISTANTS } from "@/lib/assistants/agents";
import {
  ArchiveRawZ,
  archiveSchema,
  screenGuide,
  type ArchiveItem,
} from "@/lib/assistants/archive";
import {
  DOC_STAGE_LABEL,
  SIDE_LABEL,
  type ArchiveScenario,
} from "@/lib/assistants/archive-scenarios";
import { verifyDraft } from "@/lib/citations/verify";
import { scanInput } from "@/lib/pii";
import type { LawSource } from "@/lib/search/law-source";
import { callModel, createModelClient, textOf, withCostCap, type ModelClient } from "./client";
import { runDeepAnalysis, DEEP_PROMPT_VERSION } from "./deep";
import { DEEP_LIMITS, buildDeepMap } from "./deep-policy";
import { liteDigest, liteEvidenceKeys } from "./lite";
import { userMessage } from "./message";
import { tierOf } from "./models";
import { screenPoints } from "./policy";

export const ARCHIVE_PROMPT_VERSION = "archive-2026-11-25";

const ARCHIVE_SYSTEM = `당신은 햄찌법원 전문 에이전트의 사례 정리 담당(AI)입니다. 한 사연에 대해 사용자가 실제로 도움을 받을 수 있게 아래 항목을 정리합니다.
입력: 사연, 사용자의 입장(원고 쪽 또는 피고 쪽)과 서류 단계(내용증명을 쓰는지·받았는지, 소장·고소장을 쓰는지·받았는지, 서류 전 내용 정리 단계인지), 이미 검증된 답변 요약, 근거 목록.

- situation: 지금 상황을 사연에 적힌 사실만으로 두세 문장에 정리합니다. 사용자가 말하지 않은 사실을 지어내지 않습니다.
- steps.now: 절차상 지금 어느 단계인지 한 문장. steps.next: 이 단계 다음에 밟을 수 있는 절차를 순서대로 넷까지.
- civil.points: 민사 관점. 근거 목록의 조문·판례가 어떤 요건을 정하는지, 사연의 어떤 사실이 그 요건과 닿는지 설명합니다(넷까지). 문단마다 근거 키(source)와 그 원문에서 글자 그대로 옮긴 20~60자 구절(quote)을 붙입니다.
- criminal.points: 형사 관점. 같은 방식입니다. 근거 목록에 형사 근거가 없으면 빈 목록으로 두고 note에 왜 주로 민사 문제인지 한 줄을 씁니다. 민사 근거가 없을 때도 civil.note에 같은 방식으로 씁니다. 근거가 있으면 note는 빈 문자열.
- evidence: 필요한 증거를 일곱까지. item(무엇), why(왜 필요한지), status(사연에 이미 있으면 "있음", 아니면 "확인 필요").
- document: 이 서류 단계에서 서류를 쓰거나 받았을 때 정리할 순서. title(예: "소장을 받았을 때 정리할 것")과 steps(여섯까지).

지킬 것:
- 근거 목록에 없는 법령·조문·판례·사건번호를 쓰지 않습니다. 요건 설명은 civil·criminal 문단에서 근거 키와 함께만 합니다.
- situation·steps·evidence·document·note에는 숫자(날짜·기간·금액)와 조문 번호·사건번호를 쓰지 않습니다. 기간은 "정해진 기간 안에"처럼 씁니다.
- 사용자 사건이 성립한다·처벌된다·이긴다·돌려받는다고 단정하지 않습니다. 요건은 "이 조문은 ~한 경우를 정하고 있어요"처럼 설명하고, 판단은 법원·수사기관이 한다고 씁니다. "반드시"·"무조건" 같은 표현과 승패·가능성·유불리 판단을 쓰지 않습니다.
- 쉬운 말과 존댓말로 씁니다.`;

export type ArchiveBuild = { item: ArchiveItem; costUsd: number };

export async function buildArchiveItem(
  scenario: ArchiveScenario,
  deps: { lawSource: LawSource; model?: ModelClient },
): Promise<ArchiveBuild> {
  const a = ASSISTANTS[scenario.assistant];
  const tier = tierOf("max");
  const maskedText = scanInput(scenario.question).maskedText;

  // ① DeepSearch
  const deep = await runDeepAnalysis(
    { maskedText },
    {
      model: deps.model,
      lawSource: deps.lawSource,
      tier: "max",
      caseHint: a.caseHint,
      lawHints: a.lawHints,
    },
  );
  // ② 검증 + 시각자료
  const verified = await verifyDraft(deep.draft, deep.evidence, {
    lawSource: deps.lawSource,
    screened: deep.dropped.length,
  });
  const result = { ...verified.result, assistant: a.id, trace: [] };
  if (deep.struct) result.deep = buildDeepMap(deep.struct, deep.drafted, result.answer.points);

  // ③ 정리 (같은 근거 목록)
  const keys = liteEvidenceKeys(deep.evidence, {
    articles: DEEP_LIMITS.articles,
    cases: DEEP_LIMITS.cases,
  });
  const model = withCostCap(deps.model ?? createModelClient(), tier.capUsd);
  const res = await callModel(
    model,
    "archive",
    {
      model: tier.model,
      max_tokens: tier.answerTokens.max,
      thinking: tier.thinking,
      system: [
        { type: "text", text: ARCHIVE_SYSTEM },
        { type: "text", text: a.persona },
      ],
      output_config: {
        effort: tier.effort,
        format: { type: "json_schema", schema: archiveSchema(keys) },
      },
      messages: [
        {
          role: "user",
          content: [
            userMessage(maskedText, []),
            `<입장_서류단계>\n${SIDE_LABEL[scenario.side]} · ${DOC_STAGE_LABEL[scenario.stage]}\n</입장_서류단계>`,
            `<검증된_답변>\n${result.answer.points.map((p) => `- ${p.text}`).join("\n") || "(없음)"}\n</검증된_답변>`,
            `<근거_목록>\n${liteDigest(deep.evidence, keys)}\n</근거_목록>`,
            `출처로 쓸 수 있는 근거 키: ${keys.join(", ")}`,
          ].join("\n\n"),
        },
      ],
    },
    tier.timeoutMs,
    { minOutputTokens: tier.answerTokens.min },
  );
  const raw = ArchiveRawZ.parse(JSON.parse(textOf(res)));
  const guide = screenGuide(raw);

  // 민사·형사 문단: 1차 거르기(근거·숫자·단정) → 인용 검증
  const verifySide = async (points: typeof raw.civil.points) => {
    const { kept } = screenPoints(points.slice(0, 4), deep.evidence);
    if (kept.length === 0) return [];
    const v = await verifyDraft({ ...deep.draft, answer: { points: kept } }, deep.evidence, {
      lawSource: deps.lawSource,
    });
    return v.result.answer.points;
  };
  const [civil, criminal] = await Promise.all([
    verifySide(raw.civil.points),
    verifySide(raw.criminal.points),
  ]);

  const costUsd = deep.costUsd + model.spentUsd();
  return {
    costUsd,
    item: {
      id: scenario.id,
      assistant: a.id,
      side: scenario.side,
      stage: scenario.stage,
      title: scenario.title,
      question: maskedText,
      result,
      situation: guide.situation,
      steps: guide.steps,
      civil: { points: civil, note: civil.length > 0 ? null : guide.civilNote },
      criminal: { points: criminal, note: criminal.length > 0 ? null : guide.criminalNote },
      evidence: guide.evidence,
      document: guide.document,
      meta: {
        model: tier.model,
        effort: tier.effort,
        promptVersion: `${deep.promptVersion || DEEP_PROMPT_VERSION}+${ARCHIVE_PROMPT_VERSION}`,
        costUsd: Number(costUsd.toFixed(4)),
        generatedAt: new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10), // 한국 시간 날짜
      },
    },
  };
}
