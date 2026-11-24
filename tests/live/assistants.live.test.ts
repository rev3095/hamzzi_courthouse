// 분야별 비서 실호출 기능 테스트 (F-018, DEC-057). **과금된다** — 질문 1건에 Haiku 2회(질문 해석·대화 한마디) + Opus 5.5 effort medium 1회.
// 실행(사용자 허락 뒤 1회만, 절대 규칙 8): ALLOW_PAID_API=1 ASSISTANT_LIVE=1 pnpm exec vitest run --config vitest.live.config.ts tests/live/assistants.live.test.ts
// 질문은 직접 쓴 가상 사연이다. ASSISTANT_LIVE_OUT에 경로를 주면 결과(대화 한마디·검증된 문단·비용)를 그 파일에 남긴다 — 저장소에 올리지 않는다.
import fs from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { ASSISTANTS, type AssistantId } from "@/lib/assistants/agents";
import { assistantLiteOptions } from "@/lib/assistants/run-config";
import { talkLineOk } from "@/lib/assistants/talk";
import { scanInput } from "@/lib/pii";

vi.mock("server-only", () => ({}));
const { runLiteAnalysis } = await import("@/lib/ai/lite");
const { verifyDraft } = await import("@/lib/citations/verify");
const { isAssertive } = await import("@/lib/ai/policy");
const { AI_NOTICE } = await import("@/lib/api/respond");
const { TIERS } = await import("@/lib/ai/models");
const { createLawSource } = await import("@/lib/search/law-source");

type Turn = { id: AssistantId; question: string; followupOf?: number; wantCase?: string };

/** 비서마다 하나 + 내집마련 이어 묻기 하나. 가상 사연(직접 씀) */
const TURNS: Turn[] = [
  {
    id: "home",
    question:
      "월세 계약이 다음 달에 끝나는데 집주인이 연락을 받지 않아요. 이사할 집은 구했는데 보증금을 못 받을까 봐 걱정돼요. 이사 가기 전에 무엇을 해 두어야 하나요?",
  },
  {
    id: "home",
    followupOf: 0,
    question:
      "전세보증금반환보증에 가입해 두었는데, 보증기관이 보증금 지급을 늦게 하면 지연된 만큼 더 받을 수 있나요?",
    wantCase: "2026다200365",
  },
  {
    id: "report",
    question:
      "온라인 게임 채팅에서 어떤 사람이 제 닉네임을 부르며 성적인 욕설을 했고, 차단했더니 SNS에서 제 계정을 멘션해서 같은 말을 계속 올려요. 어떻게 대응할 수 있나요?",
    wantCase: "2025도986",
  },
  {
    id: "market",
    question:
      "중고거래 앱에서 노트북을 사려고 판매자에게 돈을 먼저 보냈는데, 판매자가 물건을 보내지 않고 연락이 끊겼어요. 어떻게 해야 하나요?",
  },
];

const PAID =
  process.env.ALLOW_PAID_API === "1" &&
  process.env.ASSISTANT_LIVE === "1" &&
  !!process.env.ANTHROPIC_API_KEY &&
  !!process.env.OPEN_LAW_API_KEY;

describe.skipIf(!PAID)("분야별 비서 실호출 (DEC-057)", () => {
  const source = createLawSource({ timeoutMs: 15_000 });
  const report: unknown[] = [];
  const summaries: string[] = [];

  test.each(TURNS.map((t, i) => [i, ASSISTANTS[t.id].name, t] as const))(
    "%i %s: 대화 한마디(Haiku) + Pro Max(Opus) 근거 답변이 상한 안에서 검증을 거쳐 나온다",
    async (i, _name, turn) => {
      const maskedText = scanInput(turn.question).maskedText;
      const opts = assistantLiteOptions(turn.id, maskedText);
      const context =
        turn.followupOf !== undefined
          ? [
              {
                question: TURNS[turn.followupOf].question,
                answer: summaries[turn.followupOf] ?? "",
              },
            ]
          : [];
      const started = Date.now();
      const out = await runLiteAnalysis({ maskedText, context }, { ...opts, lawSource: source });
      const verified = await verifyDraft(out.draft, out.evidence, {
        lawSource: source,
        screened: out.dropped.length,
      });
      const r = verified.result;
      summaries[i] = r.answer.points
        .map((p) => p.text)
        .join(" ")
        .slice(0, 600);
      const row = {
        turn: i,
        assistant: turn.id,
        question: maskedText,
        elapsedMs: Date.now() - started,
        model: out.model,
        promptVersion: out.promptVersion,
        costUsd: Number(out.costUsd.toFixed(5)),
        costCapped: out.costCapped,
        pinned: opts.assistant.pinnedCaseIds,
        talk: out.talk ?? null,
        points: r.answer.points.map((p) => ({ text: p.text, source: p.source, check: p.check })),
        removed: r.recheck.removed,
        dropped: out.dropped,
        evidence: out.evidence.list().map((e) => e.key),
        section: out.draft.section ?? null,
      };
      report.push(row);
      if (process.env.ASSISTANT_LIVE_OUT)
        fs.writeFileSync(process.env.ASSISTANT_LIVE_OUT, JSON.stringify(report, null, 2));
      console.info(
        JSON.stringify({
          turn: i,
          costUsd: row.costUsd,
          points: row.points.length,
          removed: row.removed,
          talk: !!row.talk,
          ms: row.elapsedMs,
        }),
      );

      // 모델 고정: 근거 답변은 Opus 5.5, 질문 1건 상한 안
      expect(out.model).toBe("claude-opus-5-5");
      expect(out.promptVersion).toMatch(new RegExp(`\\+assistant-${turn.id}-v3$`));
      expect(out.costUsd).toBeLessThanOrEqual(TIERS.max.capUsd);
      expect(r.aiNotice).toBe(AI_NOTICE);
      // 대화 한마디는 거르기를 통과한 것만 (없을 수는 있다)
      if (out.talk)
        for (const s of [out.talk.reply, ...out.talk.asks]) expect(talkLineOk(s), s).toBe(true);
      // 근거 답변: 검증을 통과한 문단이 있고, 출처는 그 요청의 근거, 단정 표현 없음
      expect(r.answer.points.length).toBeGreaterThan(0);
      for (const p of r.answer.points) {
        expect(out.evidence.has(p.source), p.source).toBe(true);
        expect(isAssertive(p.text), p.text).toBe(false);
      }
      // 사례 판례가 낱말에 맞으면 그 요청에서 법제처로 다시 가져와 근거에 들어간다
      if (turn.wantCase)
        expect(
          row.evidence.some((k) => k.includes(turn.wantCase!)),
          turn.wantCase,
        ).toBe(true);
    },
    120_000,
  );
});
