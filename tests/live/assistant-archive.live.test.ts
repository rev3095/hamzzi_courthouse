// 전문 에이전트 아카이브 만들기 (F-018, DEC-057). **과금된다** — 세트마다 Haiku 1회 + Opus 5.5 effort high 2회(근거 답변·정리).
// 실행(사용자 허락 뒤): ALLOW_PAID_API=1 ARCHIVE_GEN=1 pnpm exec vitest run --config vitest.live.config.ts tests/live/assistant-archive.live.test.ts
//   ARCHIVE_ONLY=home-01,report-03  특정 세트만 · ARCHIVE_REDO=1  이미 있는 세트도 다시 · ARCHIVE_BUDGET_USD=40  전체 금액 상한(넘으면 멈춤)
// 결과는 lib/assistants/archive-data/{에이전트}.json에 한 세트씩 바로 쓴다(중간에 멈춰도 만든 것은 남는다). 질문은 직접 쓴 가상 사연이다.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { TIERS } from "@/lib/ai/models";
import { ASSISTANT_IDS, type AssistantId } from "@/lib/assistants/agents";
import type { ArchiveItem } from "@/lib/assistants/archive";
import { ARCHIVE_SCENARIOS, scenariosOf } from "@/lib/assistants/archive-scenarios";

vi.mock("server-only", () => ({}));
const { buildArchiveItem } = await import("@/lib/ai/archive");
const { createLawSource } = await import("@/lib/search/law-source");

const RUN =
  process.env.ALLOW_PAID_API === "1" &&
  process.env.ARCHIVE_GEN === "1" &&
  !!process.env.ANTHROPIC_API_KEY &&
  !!process.env.OPEN_LAW_API_KEY;

const BUDGET = Number(process.env.ARCHIVE_BUDGET_USD ?? "40");
const ONLY = new Set((process.env.ARCHIVE_ONLY ?? "").split(",").filter(Boolean));
const REDO = process.env.ARCHIVE_REDO === "1";
/** 세트 하나의 최대 금액: DeepSearch 상한(Pro Max deep) + 정리 상한(Pro Max). 서비스 기간 예산 밖에서 과금된다 */
const SET_MAX_USD = TIERS.max.deep.capUsd + TIERS.max.capUsd;
const file = (id: AssistantId) =>
  path.join(process.cwd(), "lib/assistants/archive-data", `${id}.json`);
const order = new Map(ARCHIVE_SCENARIOS.map((s, i) => [s.id, i]));

function load(id: AssistantId): ArchiveItem[] {
  return (JSON.parse(fs.readFileSync(file(id), "utf8")) as { items: ArchiveItem[] }).items;
}
function save(id: AssistantId, items: ArchiveItem[]) {
  items.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  fs.writeFileSync(file(id), `${JSON.stringify({ items }, null, 2)}\n`);
}

describe.skipIf(!RUN)("전문 에이전트 아카이브 만들기 (DEC-057)", () => {
  test(
    "에이전트마다 시나리오 10개를 Opus 5.5 high로 만들고 검증된 것만 저장한다",
    async () => {
      const source = createLawSource({ timeoutMs: 20_000 });
      let spent = 0;
      // 진행 중인 세트가 잡아 둔 최대 금액
      let reserved = 0;
      const failed: string[] = [];
      // 에이전트끼리는 동시에, 한 에이전트 안에서는 차례로
      await Promise.all(
        ASSISTANT_IDS.map(async (id) => {
          const items = load(id);
          for (const sc of scenariosOf(id)) {
            if (ONLY.size > 0 && !ONLY.has(sc.id)) continue;
            if (!REDO && items.some((i) => i.id === sc.id)) continue;
            // 세트 하나가 쓸 수 있는 최대 금액(DeepSearch 상한 + 정리 상한)까지 미리 본다 — 동시에 돌아도 상한을 넘지 않게
            if (spent + reserved + SET_MAX_USD > BUDGET) {
              failed.push(`${sc.id}:budget`);
              continue;
            }
            const started = Date.now();
            reserved += SET_MAX_USD;
            try {
              const { item, costUsd } = await buildArchiveItem(sc, { lawSource: source });
              reserved -= SET_MAX_USD;
              spent += costUsd;
              const rest = items.filter((i) => i.id !== sc.id);
              items.length = 0;
              items.push(...rest, item);
              save(id, items);
              console.info(
                JSON.stringify({
                  id: sc.id,
                  costUsd: item.meta.costUsd,
                  spent: Number(spent.toFixed(3)),
                  ms: Date.now() - started,
                  points: item.result.answer.points.length,
                  civil: item.civil.points.length,
                  criminal: item.criminal.points.length,
                  evidence: item.evidence.length,
                  deep: !!item.result.deep,
                }),
              );
            } catch (e) {
              reserved -= SET_MAX_USD;
              failed.push(`${sc.id}:${e instanceof Error ? e.name : "error"}`);
              console.info(JSON.stringify({ id: sc.id, failed: true, ms: Date.now() - started }));
            }
          }
        }),
      );
      console.info(JSON.stringify({ total: Number(spent.toFixed(3)), failed }));
      expect(spent).toBeLessThanOrEqual(BUDGET + 2);
    },
    4 * 60 * 60_000,
  );
});
