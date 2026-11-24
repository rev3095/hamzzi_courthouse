// @vitest-environment node
// 가상 사건 프리셋 보강 (사용자 요청 2026-11-25, DEC-061). **유료** — ALLOW_PAID_API=1 PRESET_ENRICH=1일 때만 돈다.
// ① 근거가 비어 있는 쟁점마다 쟁점 정리 경로(DeepSearch, Opus 5.5 effort PRESET_EFFORT(기본 medium) + 인용 검증) 1회 → 검증 통과 문단만 붙인다
// ② 사건마다 Opus 5.5 effort PRESET_EFFORT(기본 medium) 1회로 서류 원본(지어낸 가상 서류 본문)과 '한눈에 보는 요약본' 노트를 만든다
// 결과는 lib/matters/presets.json에 사건 하나씩 바로 쓴다. PRESET_BUDGET_USD(기본 35)를 넘기 전에 멈춘다.
// 모델이 쓴 서류 본문·요약은 저장 전에 거른다: 사건번호·법령 조문 인용, 결과 단정 표현, 연락처·등록번호 꼴이 든 줄은 뺀다.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { organizeIssues } = await import("@/lib/ai/matter");
const { runDeepAnalysis } = await import("@/lib/ai/deep");
const { isAssertive } = await import("@/lib/ai/policy");
const { caseNumbersIn } = await import("@/lib/citations/patterns");
const { scanInput } = await import("@/lib/pii");
const { newId } = await import("@/lib/matters/model");
const { LEANING, dropLeaning } = await import("@/lib/matters/preset-screen");
type MatterData = import("@/lib/matters/model").MatterData;
type Preset = { id: string; title: string; data: MatterData };

const RUN =
  process.env.ALLOW_PAID_API === "1" &&
  process.env.PRESET_ENRICH === "1" &&
  !!process.env.ANTHROPIC_API_KEY &&
  !!process.env.OPEN_LAW_API_KEY;
const BUDGET = Number(process.env.PRESET_BUDGET_USD ?? "40");
const FILE = path.join(process.cwd(), "lib/matters/presets.json");
// 범위: PRESET_ONLY=preset-1,preset-2 · PRESET_SKIP_ISSUES=1 · PRESET_SKIP_DOCS=1 · PRESET_MAX_ISSUES=n · PRESET_LOG=<파일>
const ONLY = new Set((process.env.PRESET_ONLY ?? "").split(",").filter(Boolean));
const SKIP_ISSUES = process.env.PRESET_SKIP_ISSUES === "1";
const SKIP_DOCS = process.env.PRESET_SKIP_DOCS === "1";
const MAX_ISSUES = Number(process.env.PRESET_MAX_ISSUES ?? "999");
/** Opus 5.5 정가 (입력 $5 · 출력 $25 / 100만 토큰) — 서류 원본 호출 비용 계산용 */
const OPUS = { in: 5 / 1e6, out: 25 / 1e6 };
/** 쟁점 하나를 채우는 DeepSearch 상한 + 여유 — 시작 전 남은 예산을 본다 */
const ISSUE_MAX_USD = 2.2;
/** Opus 생각 단계 — 기본 medium (2026-11-25 사용자 요청으로 xhigh에서 바꿈) */
const EFFORT = (process.env.PRESET_EFFORT ?? "medium") as "medium" | "high" | "xhigh";
const DOCS_MAX_USD = 1.5;

const DOC_SYSTEM = `당신은 한국 법률 사건 정리 도구 "사건 분석"의 예시 사건에 들어갈 가상 서류를 쓰는 작가다. 사건은 모두 지어낸 가상 사건이다.
사건 자료(JSON)를 받아, 자료 목록(docs)의 각 서류에 '서류 원본'을 쓴다. 실제 그 서류처럼 보이게(제목, 당사자 표시, 본문, 날짜, 서명란 자리) 쓰되 모두 지어낸 내용이다.
규칙:
- 사람 이름을 쓰지 않는다. "근로자 갑", "점주 A", "가맹본부 B 대표"처럼 사건 자료의 역할·기호를 그대로 쓴다. 회사도 사건 자료의 기호를 쓴다.
- 연락처·주소·지번·계좌번호·주민등록번호·사업자등록번호·사건번호를 쓰지 않는다. 주소 자리는 "(주소 생략)"으로 둔다.
- 법령 조문(○○법 제N조)과 판례 번호를 쓰지 않는다. 계약서·약관·내규 안의 조항 번호(예: "제14조(계약 해지)")는 써도 된다.
- 날짜·금액·기한은 사건 자료(사실관계·요구·조항)와 어긋나지 않게 쓴다. 자료에 없는 법정 기한·이자율·소송 비용은 지어내지 않는다.
- 결과를 판정하지 않는다(승패·유불리·처벌 단정 금지). 서류 속 당사자의 주장은 "~라고 주장한다", "~를 요구한다"처럼 쓴다.
- 서류마다 600~1,400자. 줄바꿈으로 서류 모양을 갖춘다.
그리고 brief를 쓴다: '한눈에 보는 요약본' — 사건 요약(두세 줄), 쟁점별 지금 상태(쟁점마다 한 줄, 결론 없이 무엇을 확인 중인지), 다음 할 일(서너 줄). 8~14줄, 한 줄 90자 이내. 법률 판단·결과 예측 없이 정리만.`;

const DOC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["docs", "brief"],
  properties: {
    docs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "body"],
        properties: { id: { type: "string" }, body: { type: "string" } },
      },
    },
    brief: { type: "string" },
  },
};

/** 서류 본문·요약 거르기: 줄 단위로 사건번호·법령 조문 인용·단정 표현·개인정보 꼴이 든 줄을 뺀다 */
const STATUTE = /[가-힣]{2,}(법|법률|령|규칙)\s*제\s*\d+\s*조/;
function screenText(text: string, max: number): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (caseNumbersIn(t).length > 0 || STATUTE.test(t)) return false;
      if (isAssertive(t) || LEANING.test(t)) return false;
      if (scanInput(t).findings.length > 0) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const META_ISSUE = /확인이 필요한 사실/;
/** 쟁점 제목과 가장 많이 겹치는 하위 쟁점 고르기 (글자 두 개 묶음, 흔한 어미 묶음 제외) — 제목 묶음의 30% 이상 겹치고 2위와 두 묶음 이상 차이가 나야 고른다 */
const COMMON = new Set([
  "는지",
  "인지",
  "한지",
  "되는",
  "하는",
  "에서",
  "으로",
  "있는",
  "어떻",
  "떻게",
]);
function bigrams(t: string): Set<string> {
  const c = t.replace(/[^가-힣A-Za-z0-9]/g, "");
  const all = Array.from({ length: Math.max(0, c.length - 1) }, (_, i) => c.slice(i, i + 2));
  return new Set(all.filter((x) => !COMMON.has(x)));
}
function closest<T extends { title: string }>(title: string, list: T[]): T | undefined {
  const g = bigrams(title);
  let best: T | undefined;
  let score = 0;
  let second = 0;
  for (const it of list) {
    const n = [...bigrams(it.title)].filter((x) => g.has(x)).length;
    if (n > score) [best, score, second] = [it, n, score];
    else if (n > second) second = n;
  }
  return g.size > 0 && score / g.size >= 0.3 && score - second >= 2 ? best : undefined;
}

const load = (): Preset[] => JSON.parse(readFileSync(FILE, "utf8")) as Preset[];
const save = (all: Preset[]) => writeFileSync(FILE, `${JSON.stringify(all, null, 2)}\n`);

describe.skipIf(!RUN)("가상 사건 프리셋 보강 (DEC-061)", () => {
  test(
    "빈 쟁점에 검증된 근거를, 서류마다 원본을, 사건마다 요약본을 더한다",
    async () => {
      const client = new Anthropic({ maxRetries: 0 });
      let spent = 0;
      const log: unknown[] = [];
      const all = load();
      let issuesRun = 0;
      for (const preset of all) {
        if (ONLY.size > 0 && !ONLY.has(preset.id)) continue;
        const d = preset.data;
        const now = new Date().toISOString();

        // ① 빈 쟁점 채우기
        for (const issue of d.issues) {
          // '확인이 필요한 사실' 모음 쟁점은 법령 근거를 붙일 대상이 아니다
          if (META_ISSUE.test(issue.title)) continue;
          if (SKIP_ISSUES || issue.points.length > 0 || issuesRun >= MAX_ISSUES) continue;
          issuesRun++;
          if (spent + ISSUE_MAX_USD > BUDGET) {
            log.push({ preset: preset.id, issue: issue.title, skipped: "budget" });
            continue;
          }
          const text = scanInput(
            `사건 개요: ${d.summary}\n\n살펴볼 쟁점: ${issue.title}\n${issue.detail}`,
          ).maskedText;
          const org = await organizeIssues(text, {
            tier: "max",
            // 생각 단계는 PRESET_EFFORT(기본 medium, 사용자 요청 2026-11-25). xhigh는 생각이 길어 출력 한도·상한을 넓힌다
            run: (input, o) =>
              runDeepAnalysis(input, {
                ...o,
                effort: EFFORT,
                answerMaxTokens: EFFORT === "xhigh" ? 40_000 : 16_000,
                costCapUsd: 2,
              }),
          });
          spent += org.costUsd;
          // 사건 진행 화면은 유불리를 말하지 않는다(DEC-053) — 유리·가능성 판단 문장은 빼고, 빈 문단은 버린다
          const pick = closest(issue.title, org.issues);
          const points = (pick?.points ?? [])
            .map((p) => ({ ...p, text: dropLeaning(p.text) }))
            .filter((p) => p.text.length > 0)
            .slice(0, 6);
          if (points.length === 0)
            log.push({
              preset: preset.id,
              issue: issue.title.slice(0, 40),
              empty: true,
              found: org.issues.map((i) => [i.title.slice(0, 30), i.points.length]),
            });
          issue.points = points;
          if (issue.unknowns.length === 0) issue.unknowns = org.unknowns.slice(0, 3);
          if (points.length > 0) {
            d.notes.push({
              id: newId(),
              title: `법령·판례 — ${issue.title}`.slice(0, 110),
              body: points.map((p) => `• ${p.label}: ${p.text}`).join("\n"),
              kind: "search",
              refs: [issue.id],
              sources: points.map((p) => ({ title: p.label, url: p.url })),
              byAi: true,
              at: now,
            });
          }
          log.push({
            preset: preset.id,
            issue: issue.title.slice(0, 40),
            points: points.length,
            cost: Number(org.costUsd.toFixed(3)),
          });
          save(all);
        }

        // ② 서류 원본 + 한눈에 보는 요약본
        const needDocs = d.docs.some((x) => !x.body);
        if (!SKIP_DOCS && needDocs && spent + DOCS_MAX_USD <= BUDGET) {
          // 출력 한도가 커서 SDK가 스트리밍을 요구한다 — 끝까지 받아 한 메시지로 쓴다
          const res = await client.messages
            .stream({
              model: "claude-opus-5-5",
              max_tokens: 32_000,
              thinking: { type: "adaptive" },
              output_config: {
                effort: EFFORT,
                format: { type: "json_schema", schema: DOC_SCHEMA },
              },
              system: DOC_SYSTEM,
              messages: [
                {
                  role: "user",
                  content: `사건 이름: ${preset.title}\n사건 자료:\n${JSON.stringify({
                    summary: d.summary,
                    docs: d.docs.map(({ id, title, type, date, gist, pages }) => ({
                      id,
                      title,
                      type,
                      date,
                      gist,
                      pages,
                    })),
                    facts: d.facts.map(({ when, what, docId }) => ({ when, what, docId })),
                    parties: d.parties.map(({ name, kind, side, role }) => ({
                      name,
                      kind,
                      side,
                      role,
                    })),
                    demands: d.demands.map(({ what, due, docId }) => ({ what, due, docId })),
                    clauses: d.clauses.map(({ ref, gist, docId }) => ({ ref, gist, docId })),
                    issues: d.issues.map((i) => i.title),
                  })}`,
                },
              ],
            } as never)
            .finalMessage();
          const r = res as unknown as {
            content: { type: string; text?: string }[];
            usage: { input_tokens: number; output_tokens: number };
          };
          const cost = r.usage.input_tokens * OPUS.in + r.usage.output_tokens * OPUS.out;
          spent += cost;
          const out = JSON.parse(r.content.find((c) => c.type === "text")?.text ?? "{}") as {
            docs: { id: string; body: string }[];
            brief: string;
          };
          for (const doc of d.docs) {
            const body = out.docs.find((x) => x.id === doc.id)?.body;
            if (body) doc.body = screenText(body, 6_000);
          }
          const brief = screenText(out.brief ?? "", 6_000);
          if (brief) {
            d.notes.unshift({
              id: newId(),
              title: "한눈에 보는 요약본",
              body: brief,
              kind: "summary",
              refs: [],
              sources: [],
              byAi: true,
              at: now,
            });
          }
          log.push({
            preset: preset.id,
            docs: d.docs.filter((x) => x.body).length,
            brief: !!brief,
            cost: Number(cost.toFixed(3)),
          });
          save(all);
        }
        console.info(JSON.stringify({ preset: preset.id, spent: Number(spent.toFixed(3)) }));
      }
      console.info(JSON.stringify({ total: Number(spent.toFixed(3)), log }));
      if (process.env.PRESET_LOG)
        writeFileSync(process.env.PRESET_LOG, JSON.stringify({ total: spent, log }, null, 2));
      expect(spent).toBeLessThanOrEqual(BUDGET + 2);
    },
    4 * 60 * 60_000,
  );
});
