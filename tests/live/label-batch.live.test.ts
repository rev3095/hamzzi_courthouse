// 공개 질문 라벨링 (DEC-042). **유료** — 질문 1건마다 Haiku 질문 해석 1회 (약 $0.0004).
// 실행: ALLOW_PAID_API=1 LABEL_BATCH=1 node node_modules/vitest/vitest.mjs run --config vitest.live.config.ts tests/live/label-batch.live.test.ts
// 절대 규칙 8: 사용자 허락을 받고 실행한다. LABEL_BATCH=1이 없으면 pnpm test:live에서도 돌지 않는다.
// - 서비스의 질문 해석과 같은 지시문·출력 형식·예시 뱅크를 쓴다 (lib/ai) — 라벨링 결과가 곧 서비스 동작의 표본이다.
// - 이미 라벨이 있는 질문은 건너뛴다 (다시 실행해도 재과금 없음). 누적 추정 비용이 한도를 넘으면 멈춘다. 재시도하지 않는다.
// - 입력: evals/labels/easylaw-questions.jsonl (법제처 생활법령 100문 100답의 질문 문장). 출력: evals/labels/labeled.jsonl
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { UNDERSTAND_TOKENS, usageCost } from "@/lib/ai/cost";
import { examplesBlock } from "@/lib/ai/label-bank";
import { UNDERSTAND_SCHEMA, UnderstandZ, screenUnderstanding } from "@/lib/ai/policy";
import { scanInput } from "@/lib/pii";

vi.mock("server-only", () => ({}));
const { callModel, createModelClient, textOf, withCostCap } = await import("@/lib/ai/client");
const { UNDERSTAND_SYSTEM } = await import("@/lib/ai/prompts");
const { UNDERSTAND_MODEL } = await import("@/lib/ai/lite");

// LABEL_IN으로 다른 질문 파일을 줄 수 있다 (예: 평가셋 evals/labels/eval-set.jsonl)
const IN = process.env.LABEL_IN ?? "evals/labels/easylaw-questions.jsonl";
const OUT = process.env.LABEL_OUT ?? "evals/labels/labeled.jsonl";
// 다시 라벨링: 이 파일에서 section이 none이었던 질문만 고른다 (섹션을 늘린 뒤 효과를 잴 때)
const ONLY_NONE_FROM = process.env.LABEL_ONLY_NONE_FROM;
const BUDGET_USD = Number.parseFloat(process.env.LABEL_BUDGET_USD ?? "0.4");
const LIMIT = Number.parseInt(process.env.LABEL_LIMIT ?? "1000", 10);
const CONCURRENCY = 4;

type Row = { id: string; area: number; question: string };

describe.skipIf(!process.env.ANTHROPIC_API_KEY || process.env.LABEL_BATCH !== "1")(
  "공개 질문 라벨링 (DEC-042, 유료)",
  () => {
    test("질문마다 Haiku 질문 해석 1회 — 라벨·함께 걸린 절차·온/오프라인·새 라벨 제안을 남긴다", async () => {
      const rows = readFileSync(IN, "utf8")
        .split("\n")
        .filter((l) => l.startsWith('{"id"'))
        .map((l) => JSON.parse(l) as Row);
      const done = new Set(
        existsSync(OUT)
          ? readFileSync(OUT, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => (JSON.parse(l) as { id: string }).id)
          : [],
      );
      const wasNone = ONLY_NONE_FROM
        ? new Set(
            readFileSync(ONLY_NONE_FROM, "utf8")
              .split(String.fromCharCode(10))
              .filter(Boolean)
              .map((l) => JSON.parse(l) as { id: string; section: string | null })
              .filter((r) => r.section === "none")
              .map((r) => r.id),
          )
        : null;
      const todo = rows
        .filter((r) => !done.has(r.id) && (!wasNone || wasNone.has(r.id)))
        .slice(0, LIMIT);
      const client = createModelClient();
      let spent = 0;
      let failed = 0;
      let next = 0;

      async function worker() {
        for (;;) {
          const row = todo[next++];
          if (!row || spent >= BUDGET_USD || failed >= 10) return;
          const masked = scanInput(row.question).maskedText;
          const model = withCostCap(client, 0.0015);
          try {
            const res = await callModel(
              model,
              "understand",
              {
                model: UNDERSTAND_MODEL,
                max_tokens: UNDERSTAND_TOKENS.max,
                thinking: { type: "disabled" },
                // 지시문·라벨 목록은 요청마다 같아 캐시에서 싸게 다시 읽는다 (DEC-042)
                system: [
                  { type: "text", text: UNDERSTAND_SYSTEM, cache_control: { type: "ephemeral" } },
                ],
                output_config: { format: { type: "json_schema", schema: UNDERSTAND_SCHEMA } },
                messages: [
                  {
                    role: "user",
                    content: [examplesBlock(masked), `<질문>\n${masked}\n</질문>`]
                      .filter(Boolean)
                      .join("\n\n"),
                  },
                ],
              },
              20_000,
              { minOutputTokens: UNDERSTAND_TOKENS.min },
            );
            const cost = usageCost(UNDERSTAND_MODEL, {
              inputTokens: res.usage.input_tokens ?? 0,
              outputTokens: res.usage.output_tokens ?? 0,
              cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
              cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
            });
            spent += cost;
            const parsed = UnderstandZ.safeParse(JSON.parse(textOf(res)));
            const u = parsed.success ? screenUnderstanding(parsed.data, masked) : null;
            appendFileSync(
              OUT,
              `${JSON.stringify({
                id: row.id,
                area: row.area,
                question: row.question,
                section: u?.section ?? null,
                others: u?.others ?? [],
                channel: u?.channel ?? "unknown",
                newLabel: u?.newLabel ?? null,
                // 모델이 낸 그대로의 제안 (거르기 전) — 어떤 유형이 빠져 있는지 분석할 때만 본다
                rawNewLabel: parsed.success ? (parsed.data.newLabel?.title ?? null) : null,
                tokensIn: res.usage.input_tokens ?? 0,
                tokensCached: res.usage.cache_read_input_tokens ?? 0,
                tokensOut: res.usage.output_tokens ?? 0,
                costUsd: Math.round(cost * 1e7) / 1e7,
              })}\n`,
            );
          } catch {
            failed += 1;
            spent += model.spentUsd();
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      console.log(
        JSON.stringify({ todo: todo.length, failed, spentUsd: Math.round(spent * 1e4) / 1e4 }),
      );
      expect(failed).toBeLessThan(10);
    }, 1_800_000);
  },
);
