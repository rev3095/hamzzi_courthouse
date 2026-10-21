// ③ 에이전트 재검색 (PRD 8.2 데모 파이프라인, Opus 5.5). 모델이 법령·판례 도구로 부족한 근거를 더 찾는다. 최대 3라운드.
// 응답 content는 thinking 블록까지 그대로 다음 요청에 붙인다 (preserved thinking).
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { EvidenceSet } from "@/lib/search/evidence";
import type { LawSource } from "@/lib/search/law-source";
import { OPUS_FALLBACK, callModel, type ModelClient, type ModelMessage } from "./client";
import { runTool } from "./gather";
import { userMessage } from "./message";
import {
  LIMITS,
  MODELS,
  evidenceDigest,
  type FollowupTurn,
  type Intent,
  type TraceRecord,
} from "./policy";
import { AGENT_SYSTEM, AGENT_TOOLS } from "./prompts";

export type AgentRound = { round: 1 | 2 | 3; trace: TraceRecord[] };

export async function agentSearch(
  deps: {
    model: ModelClient;
    source: LawSource;
    /** 이번 라운드에 쓸 수 있는 시간. 0 이하면 멈춘다 */
    timeLeft: () => number;
    onRound: (r: AgentRound) => void;
    onResponse: (res: ModelMessage) => void;
  },
  input: { maskedText: string; context: FollowupTurn[]; intent: Intent },
  evidence: EvidenceSet,
): Promise<TraceRecord[]> {
  const trace: TraceRecord[] = [];
  const intro = [
    userMessage(input.maskedText, input.context),
    `<의도>\n분야: ${input.intent.area}\n알고 싶은 것: ${input.intent.goal}\n</의도>`,
    `<지금까지_찾은_근거>\n${evidenceDigest(evidence, { article: LIMITS.toolResultChars, case: LIMITS.toolResultChars }) || "(없음)"}\n</지금까지_찾은_근거>`,
  ].join("\n\n");
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: intro }];

  for (let round = 1 as 1 | 2 | 3; round <= LIMITS.agentRounds; round = (round + 1) as 1 | 2 | 3) {
    const budget = deps.timeLeft();
    if (budget < 5_000) break;
    const res = await callModel(
      deps.model,
      "agent",
      {
        model: MODELS.agent,
        max_tokens: 8_000,
        ...OPUS_FALLBACK,
        system: [{ type: "text", text: AGENT_SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: AGENT_TOOLS,
        output_config: { effort: "low" },
        messages,
      },
      budget,
    );
    deps.onResponse(res);
    const calls = res.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (res.stop_reason !== "tool_use" || calls.length === 0) break;

    messages.push({ role: "assistant", content: res.content });
    // 한 라운드 도구 수를 제한한다. 넘친 호출에도 tool_result는 돌려준다 (짝이 맞아야 한다)
    const outcomes = await Promise.all(
      calls.map((c, i) =>
        i < LIMITS.toolCallsPerRound
          ? runTool(deps.source, evidence, c.name, c.input)
          : Promise.resolve({
              tool: "law" as const,
              query: "",
              added: [],
              content: "이번 라운드 도구 호출 한도를 넘었습니다.",
              isError: true,
            }),
      ),
    );
    messages.push({
      role: "user",
      content: calls.map((c, i) => ({
        type: "tool_result" as const,
        tool_use_id: c.id,
        content: outcomes[i].content,
        is_error: outcomes[i].isError,
      })),
    });

    const roundTrace: TraceRecord[] = outcomes
      .filter((o) => o.query)
      .map((o) => ({ round, tool: o.tool, query: o.query, added: o.added }));
    trace.push(...roundTrace);
    deps.onRound({ round, trace: roundTrace });
  }
  return trace;
}
