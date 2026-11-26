// 예시 답변의 빈 칸 채우기 (DEC-062). **과금된다** — 쪽 답변마다 Opus 5.5 effort medium 1회 (상한 $0.4, 2026-11-27부터 — 이전 xhigh).
// 실행(사용자 허락 2026-11-25, 1회): ALLOW_PAID_API=1 BOARD_FILL=1 pnpm exec vitest run --config vitest.live.config.ts tests/live/board-fill.live.test.ts
//   BOARD_BUDGET_USD=15  전체 금액 상한(넘을 수 있는 건은 시작하지 않는다)
// 결과는 evals/board-gen/out/<예시>--<쪽>.json에 한 건씩 쓴다(이미 있으면 건너뛰어 다시 과금하지 않는다).
// 반영은 무료 `python -X utf8 scripts/merge_board_fill.py`. 질문은 직접 쓴 가상 사연(lib/demo/examples.json)이다. 실패해도 재시도하지 않는다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { parseDeepMap } from "@/lib/ai/deep-policy";

vi.mock("server-only", () => ({}));
const { fillBoard, BOARD_FILL_CAP_USD } = await import("@/lib/ai/board-fill");

const RUN =
  process.env.ALLOW_PAID_API === "1" &&
  process.env.BOARD_FILL === "1" &&
  !!process.env.ANTHROPIC_API_KEY;
const BUDGET = Number(process.env.BOARD_BUDGET_USD ?? "15");
const OUT = path.join(process.cwd(), "evals/board-gen/out");

type Side = {
  key: string;
  question: string;
  context: string;
  result: { deep?: unknown; answer: { points: { text: string }[] } };
  guide: unknown;
};

describe.skipIf(!RUN)("예시 답변 빈 칸 채우기 (DEC-062)", () => {
  test(
    "쪽 답변마다 Opus 5.5 medium 1회로 정리판·빈 쟁점·없는 문서만 채운다",
    async () => {
      fs.mkdirSync(OUT, { recursive: true });
      const { examples } = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "lib/demo/examples.json"), "utf8"),
      ) as { examples: { id: string; sides?: Side[] }[] };
      const todo = examples.flatMap((e) =>
        (e.sides ?? []).flatMap((s) => {
          const deep = parseDeepMap(s.result.deep);
          const file = path.join(OUT, `${e.id}--${s.key}.json`);
          return deep && !deep.plan && !fs.existsSync(file) ? [{ id: e.id, s, deep, file }] : [];
        }),
      );
      let spent = 0;
      let reserved = 0;
      const failed: string[] = [];
      const lanes = [0, 1, 2, 3].map((lane) => todo.filter((_, i) => i % 4 === lane));
      await Promise.all(
        lanes.map(async (items) => {
          for (const t of items) {
            if (spent + reserved + BOARD_FILL_CAP_USD > BUDGET) {
              failed.push(`${t.id}--${t.s.key}:budget`);
              continue;
            }
            reserved += BOARD_FILL_CAP_USD;
            try {
              const out = await fillBoard({
                question: `${t.s.question}\n${t.s.context}`,
                deep: t.deep,
                points: t.s.result.answer.points,
                needDocument: !t.s.guide,
              });
              spent += out.costUsd;
              fs.writeFileSync(
                t.file,
                `${JSON.stringify({ id: t.id, side: t.s.key, ...out }, null, 1)}\n`,
              );
              console.log(
                `${t.id}--${t.s.key} $${out.costUsd.toFixed(3)} 정리판 ${out.plan ? "있음" : "없음"} 빈 쟁점 문단 ${out.issueAnswers.length} 문서 ${out.document ? "있음" : "-"}`,
              );
            } catch (err) {
              // 실패한 건도 상한만큼 쓴 것으로 본다 (전체 상한을 낮게 세지 않게)
              spent += BOARD_FILL_CAP_USD;
              failed.push(`${t.id}--${t.s.key}:${err instanceof Error ? err.name : "error"}`);
            } finally {
              reserved -= BOARD_FILL_CAP_USD;
            }
          }
        }),
      );
      console.log(
        `대상 ${todo.length}건 · 쓴 금액(실패는 상한으로) $${spent.toFixed(2)} · 실패 ${failed.join(", ") || "없음"}`,
      );
      expect(spent).toBeLessThanOrEqual(BUDGET);
    },
    60 * 60 * 1000,
  );
});
