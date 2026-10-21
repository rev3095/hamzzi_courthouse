// P9 데모 평가 실행기 (PRD 8.4). 실행: pnpm eval:demo
// 실제 서비스와 같은 경로(runDemoAnalysis → verifyDraft)를 질문마다 돌리고, 자동 채점 + Haiku 채점을 기록한다.
// DB 저장·비로그인 차감은 하지 않는다. 과금된다 — EVAL_BUDGET_USD(기본 4.5달러)를 넘으면 새 질문을 시작하지 않는다.
// 환경변수: EVAL_IDS=lease-01,wage-01 (일부만) · EVAL_JUDGE=0 (AI 채점 끄기) · EVAL_CONCURRENCY=3 · EVAL_RUN_ID (이어서 실행)
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { runDemoAnalysis } = await import("@/lib/ai/orchestrator");
const { verifyDraft } = await import("@/lib/citations/verify");
const { claimForKey, claimsInText, uniqueClaims } = await import("@/lib/citations/policy");
const { createLawSource } = await import("@/lib/search/law-source");
const { autoGrade, costUpperBound, summarize } = await import("./grade");
const { judge, JUDGE_KEYS, JUDGE_MODEL } = await import("./judge");
import type { EvalCase, AutoGrade } from "./grade";
import type { Verdict } from "./judge";

const ROOT = path.join(process.cwd(), "evals");
const cases: EvalCase[] = JSON.parse(
  fs.readFileSync(path.join(ROOT, "demo", "cases.json"), "utf8"),
);
const ids = process.env.EVAL_IDS?.split(",").map((s) => s.trim());
const selected = ids ? cases.filter((c) => ids.includes(c.id)) : cases;
const budget = Number(process.env.EVAL_BUDGET_USD ?? "4.5");
const concurrency = Number(process.env.EVAL_CONCURRENCY ?? "3");
const useJudge = process.env.EVAL_JUDGE !== "0";
const runId =
  process.env.EVAL_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(ROOT, "results", runId);

type Row = {
  id: string;
  tags: string[];
  latencyMs: number;
  costUsd: number;
  judgeCostUsd: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  grade: AutoGrade;
  verdict: Verdict | null;
  error?: string;
};

describe.skipIf(!process.env.OPEN_LAW_API_KEY || !process.env.ANTHROPIC_API_KEY)(
  "P9 데모 평가",
  () => {
    test(
      `질문 ${selected.length}건 (예산 $${budget})`,
      async () => {
        fs.mkdirSync(path.join(outDir, "traces"), { recursive: true });
        const resultsPath = path.join(outDir, "results.jsonl");
        const done = new Set(
          fs.existsSync(resultsPath)
            ? fs
                .readFileSync(resultsPath, "utf8")
                .split("\n")
                .filter(Boolean)
                .map((l) => JSON.parse(l).id)
            : [],
        );
        const rows: Row[] = fs.existsSync(resultsPath)
          ? fs
              .readFileSync(resultsPath, "utf8")
              .split("\n")
              .filter(Boolean)
              .map((l) => JSON.parse(l))
          : [];
        let spent = rows.reduce((s, r) => s + r.costUsd + r.judgeCostUsd, 0);
        const source = createLawSource({ timeoutMs: 15_000 });
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, logLevel: "off" });
        const queue = selected.filter((c) => !done.has(c.id));
        let skippedForBudget = 0;

        const runOne = async (c: EvalCase) => {
          // 질문 1건 상한(약 0.35달러)을 남겨 두고 예산을 넘지 않게 한다
          if (spent + 0.35 > budget) {
            skippedForBudget += 1;
            return;
          }
          const started = Date.now();
          let row: Row;
          try {
            const analysis = await runDemoAnalysis(
              { maskedText: c.question },
              { lawSource: source },
            );
            const verified = await verifyDraft(analysis.draft, analysis.evidence, {
              lawSource: source,
              screened: analysis.dropped.length,
            });
            const latencyMs = Date.now() - started;
            const costUsd = costUpperBound(analysis.usage);
            spent += costUsd;

            // 허위 인용: 최종 결과에 남은 출처·본문 인용을 법제처에 다시 조회한다 (검증기와 별개로 한 번 더)
            const claims = verified.result.answer.points.flatMap((p) => {
              const own = claimForKey(p.source, analysis.evidence);
              return [...(own ? [own] : []), ...claimsInText(p.text, analysis.evidence).claims];
            });
            const { statutes, cases: caseNos } = uniqueClaims(claims);
            const recheck = [
              ...(statutes.length ? await source.verifyStatutes(statutes) : []),
              ...(caseNos.length ? await source.verifyCases(caseNos) : []),
            ];
            const grade = autoGrade(c, verified.result, verified.stats, analysis.evidence, recheck);
            const j = useJudge
              ? await judge(client, c.question, verified.result, (k) =>
                  analysis.evidence.sourceText(k),
                )
              : null;
            spent += j?.costUsd ?? 0;
            row = {
              id: c.id,
              tags: c.tags,
              latencyMs,
              costUsd,
              judgeCostUsd: j?.costUsd ?? 0,
              usage: analysis.usage,
              grade,
              verdict: j?.verdict ?? null,
            };
            fs.writeFileSync(
              path.join(outDir, "traces", `${c.id}.json`),
              JSON.stringify(
                {
                  question: c.question,
                  result: verified.result,
                  stats: verified.stats,
                  recheck,
                  verdict: row.verdict,
                },
                null,
                2,
              ),
            );
          } catch (e) {
            const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? "error";
            row = {
              id: c.id,
              tags: c.tags,
              latencyMs: Date.now() - started,
              costUsd: 0,
              judgeCostUsd: 0,
              usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
              grade: null as unknown as AutoGrade,
              verdict: null,
              error: String(code),
            };
          }
          rows.push(row);
          fs.appendFileSync(resultsPath, `${JSON.stringify(row)}\n`);
          console.info(
            `[${rows.length}/${selected.length}] ${c.id} ${row.error ?? `${row.grade.points}문단 ${(row.latencyMs / 1000).toFixed(1)}초`} · 누적 $${spent.toFixed(2)}`,
          );
        };

        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
          while (queue.length) await runOne(queue.shift()!);
        });
        await Promise.all(workers);

        const ok = rows.filter((r) => !r.error);
        const summary = summarize(ok);
        const judged = ok.filter((r) => r.verdict);
        const judgeRates = Object.fromEntries(
          JUDGE_KEYS.map((k) => [
            `AI 채점 ${k}`,
            judged.length ? `${judged.filter((r) => r.verdict![k]).length}/${judged.length}` : "-",
          ]),
        );
        const all = {
          runId,
          judgeModel: useJudge ? JUDGE_MODEL : null,
          errors: rows.filter((r) => r.error).map((r) => `${r.id}:${r.error}`),
          skippedForBudget,
          spentUsd: Number(spent.toFixed(3)),
          ...summary,
          ...judgeRates,
        };
        fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(all, null, 2));
        fs.writeFileSync(path.join(outDir, "report.md"), report(all, rows));
        console.info(JSON.stringify(all, null, 2));
      },
      60 * 60_000,
    );
  },
);

/** 사람이 읽는 보고서 (마크다운). 답변 본문은 traces/에 있고 여기에는 지표만 */
function report(summary: Record<string, unknown>, rows: Row[]): string {
  const head = Object.entries(summary)
    .map(([k, v]) => `| ${k} | ${Array.isArray(v) ? v.join(", ") || "-" : String(v)} |`)
    .join("\n");
  const per = rows
    .map((r) =>
      r.error
        ? `| ${r.id} | 오류 ${r.error} | | | | | | |`
        : `| ${r.id} | ${r.grade.outcome} | ${r.grade.points} (제거 ${r.grade.removed}) | ${r.grade.verified}/${r.grade.points} | ${r.grade.fabricated}·${r.grade.assertive}·${r.grade.inventedNumbers}·${r.grade.pii} | ${r.grade.coverageHit ? "✓" : "✗"} | ${(r.latencyMs / 1000).toFixed(1)}초 · $${r.costUsd.toFixed(2)} | ${r.verdict ? JUDGE_KEYS.filter((k) => !r.verdict![k]).join(", ") || "모두 통과" : "-"} |`,
    )
    .join("\n");
  return `# P9 데모 평가 결과 (${summary.runId})

| 지표 | 값 |
|---|---|
${head}

## 질문별
| id | 결과 | 문단 | verified | 허위·단정·숫자·PII | 핵심 포함 | 시간·비용 | AI 채점 실패 항목 |
|---|---|---|---|---|---|---|---|
${per}

답변 전문은 \`traces/<id>.json\`에 있다. 비용은 Opus 가격으로 잡은 상한이다.
`;
}
