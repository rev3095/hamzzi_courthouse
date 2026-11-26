// @vitest-environment node
// 가상 사건 프리셋 채우기 (사용자 요청 2026-11-25, DEC-061). **유료** — 사건마다 Opus 5.5(effort medium, 2026-11-27부터) 1회 + 쟁점 정리
// (기존 DeepSearch 경로 + 인용 검증, Pro Max) 1회. ALLOW_PAID_API=1 PRESET_FILL=1일 때만 돈다. 결과 파일이 있으면 건너뛴다.
//
// 입력: evals/matter-presets/source/<id>.json ([가상] 사건 자료, 사람 이름 없이 역할·가상 상호만)
// 출력: evals/matter-presets/filled/<id>.json — 비어 있거나 모자란 항목(자료·사실관계·당사자·관계·요구·조항·쟁점·노트)을
//   3개 이상으로 채우고, 개요를 늘리고, 요약본 노트를 더한 사건 자료. 쟁점 근거는 법제처 인용 검증을 통과한 문단만.
// 모델이 쓴 글은 저장 전에 거른다: 법령 조문·사건번호(검증 전이라 싣지 않음), 결과 단정 표현, 기한·비용을 지어낸 숫자.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { organizeIssues } = await import("@/lib/ai/matter");
const { isAssertive } = await import("@/lib/ai/policy");
const { composeIssueText, newId } = await import("@/lib/matters/model");
const { parseMatterData, maskForModel, maskNamesOf } = await import("@/lib/matters/policy");
type MatterData = import("@/lib/matters/model").MatterData;

const DIR = "evals/matter-presets";
const run = process.env.ALLOW_PAID_API === "1" && process.env.PRESET_FILL === "1";

const SYSTEM = `당신은 한국 법률 사건 정리 도구 "사건 분석"의 예시 사건을 채우는 작가다. 사건은 모두 지어낸 가상 사건이다.
지금 사건 자료(JSON)를 받아, 같은 사건이 더 구체적이고 일관되게 보이도록 빠진 항목을 채우고 늘린다.
규칙:
- 사람 이름을 쓰지 않는다. 사람은 "근로자 갑", "회사 을 인사팀장", "점주 A"처럼 역할·기호로, 회사는 "가맹본부 B", "의류업체 B"처럼 쓴다. 연락처·주소·지번·계좌·주민번호·사업자번호·사건번호를 쓰지 않는다.
- 법령 조문(○○법 제N조)과 판례 번호를 쓰지 않는다(근거는 따로 검증해 붙인다). 계약서·약관·내규의 조항(예: "가맹계약서 제14조")은 써도 된다.
- 결과를 판정하지 않는다: 승패·유불리·책임 비율·처벌 여부를 단정하지 않는다("반드시", "무조건", "승소", "처벌됩니다" 금지).
- 법정 기한·소송 비용·이자율 같은 숫자를 지어내지 않는다. 사건 속 사실(계약일, 금액, 서류에 적힌 회신 기한 등)은 지금 자료와 어긋나지 않게 써도 된다.
- 지금 자료의 사실·쟁점과 모순되지 않게 쓰고, 기존 항목은 다시 쓰지 않는다(새로 더할 것만).
출력(JSON):
- overview: 사건 개요 300~400자 — 누가 누구에게 무엇을 요구하는지, 지금 어디까지 왔는지, 질문자의 자리
- brief: 요약본 4~6줄(한 줄 80자 이내)
- docs: 이 사건에 있을 법한 서류 4~6개(계약서, 내용증명, 통지서, 회신, 진단서·사진 목록 등) — key(짧은 영문), title, type, date, gist(무엇이 적혀 있는지 2~3문장), pages
- facts: 더할 사실 6~10개 — when(YYYY-MM-DD 또는 YYYY-MM), what, docKey(그 사실이 적힌 서류의 key 또는 빈 문자열)
- parties: 당사자 4~6명 — name(역할·기호), kind(business|agency|person|group), side(claimant|respondent|other), role, note
- relations: 관계 4~8개 — from·to(parties의 name 그대로), label
- demands: 서류에 적힌 요구 3~5개 — what, due(서류에 적힌 기한, 없으면 빈 문자열), docKey
- clauses: 서류 속 계약·약관·내규 조항 3~5개 — ref, gist, docKey
- issues: 더할 쟁점(살펴볼 질문) — 지금 쟁점과 합쳐 4개 이상이 되게, 각각 title(묻는 말), detail(무엇을 확인해야 하는지 2~3문장), unknowns(확인할 사실 2~3개)
- notes: 노트 3~5개 — title, body(4~8줄: 증거 정리 순서, 상대방 주장 정리, 다음 할 일, 확인할 서류 등 사건 정리 메모. 법률 판단 없이)`;

const S = { type: "string" } as const;
const arr = (props: Record<string, unknown>) => ({
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: Object.keys(props),
    properties: props,
  },
});
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "overview",
    "brief",
    "docs",
    "facts",
    "parties",
    "relations",
    "demands",
    "clauses",
    "issues",
    "notes",
  ],
  properties: {
    overview: S,
    brief: { type: "array", items: S },
    docs: arr({ key: S, title: S, type: S, date: S, gist: S, pages: { type: "integer" } }),
    facts: arr({ when: S, what: S, docKey: S }),
    parties: arr({
      name: S,
      kind: { type: "string", enum: ["business", "agency", "person", "group"] },
      side: { type: "string", enum: ["claimant", "respondent", "other"] },
      role: S,
      note: S,
    }),
    relations: arr({ from: S, to: S, label: S }),
    demands: arr({ what: S, due: S, docKey: S }),
    clauses: arr({ ref: S, gist: S, docKey: S }),
    issues: arr({ title: S, detail: S, unknowns: { type: "array", items: S } }),
    notes: arr({ title: S, body: S }),
  },
};

// 법령 조문·사건번호가 든 문장은 뺀다 (검증하지 않은 인용, 절대 규칙 1). 계약서·약관·내규 조항은 둔다
const STATUTE = /(법|법률|령|규칙)\s*(상\s*)?제\s*\d+\s*조/;
const CASE_NO = /\d{2,4}\s?(?![년월일])[가-힣]{1,4}\s?\d{2,7}(?!\s*(원|명|개|건|층|쪽|장|%))/;
// 기한·비용을 지어낸 꼴 (사건 속 날짜·금액은 그대로 둔다)
const MADE_UP =
  /(\d+\s*(일|주|개월|년)\s*(이내|안에|내에|전까지))|(인지대|송달료|이자율|연\s*\d+\s*%)/;
const drop = { statute: 0, assertive: 0, number: 0 };
function cleanLine(s: string): string {
  return s
    .split(/(?<=[.?!다요])\s+/)
    .filter((x) => {
      if (STATUTE.test(x) || CASE_NO.test(x)) return (void drop.statute++, false);
      if (isAssertive(x)) return (void drop.assertive++, false);
      if (MADE_UP.test(x)) return (void drop.number++, false);
      return true;
    })
    .join(" ")
    .trim();
}

type Fill = {
  overview: string;
  brief: string[];
  docs: { key: string; title: string; type: string; date: string; gist: string; pages: number }[];
  facts: { when: string; what: string; docKey: string }[];
  parties: {
    name: string;
    kind: "business" | "agency" | "person" | "group";
    side: "claimant" | "respondent" | "other";
    role: string;
    note: string;
  }[];
  relations: { from: string; to: string; label: string }[];
  demands: { what: string; due: string; docKey: string }[];
  clauses: { ref: string; gist: string; docKey: string }[];
  issues: { title: string; detail: string; unknowns: string[] }[];
  notes: { title: string; body: string }[];
};

function mergeFill(data: MatterData, f: Fill, now: string): MatterData {
  const docIds = new Map(f.docs.map((d) => [d.key, newId()]));
  const docOf = (k: string) => docIds.get(k) ?? null;
  const parties = f.parties
    .map((p) => ({
      ...p,
      name: cleanLine(p.name),
      role: cleanLine(p.role),
      note: cleanLine(p.note),
    }))
    .filter((p) => p.name)
    .map((p) => ({ id: newId(), ...p }));
  const pid = (name: string) => parties.find((p) => p.name === name.trim())?.id;
  const keepRows = <T>(rows: T[], ok: (r: T) => boolean) => rows.filter(ok);
  return {
    ...data,
    summary: cleanLine(f.overview) || data.summary,
    docs: [
      ...data.docs,
      ...f.docs.map((d) => ({
        id: docIds.get(d.key)!,
        title: cleanLine(d.title),
        type: cleanLine(d.type),
        date: d.date,
        gist: cleanLine(d.gist),
        pages: Math.max(1, Math.min(50, d.pages)),
        addedAt: now,
      })),
    ].filter((d) => d.title && d.gist),
    facts: [
      ...data.facts,
      ...keepRows(
        f.facts.map((x) => ({
          id: newId(),
          when: x.when,
          what: cleanLine(x.what),
          docId: docOf(x.docKey),
        })),
        (x) => !!x.what,
      ),
    ],
    parties: [...data.parties, ...parties],
    relations: [
      ...data.relations,
      ...f.relations.flatMap((r) => {
        const from = pid(r.from);
        const to = pid(r.to);
        return from && to && from !== to
          ? [{ id: newId(), from, to, label: cleanLine(r.label) }]
          : [];
      }),
    ],
    demands: [
      ...data.demands,
      ...keepRows(
        f.demands.map((d) => ({
          id: newId(),
          what: cleanLine(d.what),
          due: d.due,
          docId: docOf(d.docKey),
        })),
        (d) => !!d.what,
      ),
    ],
    clauses: [
      ...data.clauses,
      ...keepRows(
        f.clauses.map((c) => ({
          id: newId(),
          ref: c.ref,
          gist: cleanLine(c.gist),
          docId: docOf(c.docKey),
        })),
        // 법령 조문은 조항 목록에 넣지 않는다 (서류 속 계약·약관·내규 조항만)
        (c) => !!c.gist && !STATUTE.test(c.ref),
      ),
    ],
    issues: [
      ...data.issues,
      ...f.issues
        .filter((i) => !data.issues.some((x) => x.title.trim() === i.title.trim()))
        .map((i) => ({
          id: newId(),
          title: cleanLine(i.title),
          detail: cleanLine(i.detail),
          points: [],
          unknowns: i.unknowns.map(cleanLine).filter(Boolean),
          byAi: true,
        }))
        .filter((i) => i.title),
    ],
    notes: [
      ...data.notes,
      {
        id: newId(),
        title: "요약본",
        body: f.brief.map(cleanLine).filter(Boolean).join("\n"),
        kind: "summary" as const,
        refs: [],
        sources: [],
        byAi: true,
        at: now,
      },
      ...f.notes.map((n) => ({
        id: newId(),
        title: cleanLine(n.title),
        body: n.body.split("\n").map(cleanLine).filter(Boolean).join("\n"),
        kind: "memo" as const,
        refs: [],
        sources: [],
        byAi: true,
        at: now,
      })),
    ].filter((n) => n.title && n.body),
  };
}

const norm = (s: string) => s.replace(/\s+/g, "");

describe.skipIf(!run)("가상 사건 프리셋 채우기 (유료, DEC-061)", () => {
  const files = readdirSync(`${DIR}/source`).filter((f) => f.endsWith(".json"));
  mkdirSync(`${DIR}/filled`, { recursive: true });
  const client = new Anthropic({ maxRetries: 0, timeout: 900_000 });

  test.concurrent.each(files)(
    "%s",
    async (file) => {
      const out = `${DIR}/filled/${file}`;
      if (existsSync(out)) return;
      const src = JSON.parse(readFileSync(`${DIR}/source/${file}`, "utf8"));
      const now = new Date().toISOString();
      let data = parseMatterData(src.data);

      // ① 빈 항목 채우기 — Opus 5.5 effort medium 1회 (2026-11-27: xhigh 사용 금지)
      const res = await client.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 32_000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `사건 이름: ${src.title}\n지금 사건 자료:\n${JSON.stringify({ ...data, issues: data.issues.map((i) => ({ title: i.title })) })}`,
          },
        ],
      } as never);
      const r = res as unknown as {
        content: { type: string; text?: string }[];
        usage: { input_tokens: number; output_tokens: number };
      };
      const fill = JSON.parse(r.content.find((c) => c.type === "text")?.text ?? "{}") as Fill;
      const fillCost = (r.usage.input_tokens * 4 + r.usage.output_tokens * 20) / 1e6;
      data = parseMatterData(mergeFill(data, fill, now));

      // ② 근거가 없는 쟁점에 법제처 근거 붙이기 — 쟁점 정리 경로(DeepSearch + 인용 검증) 1회
      const masked = maskForModel(composeIssueText(data), maskNamesOf(data)).text;
      const org = await organizeIssues(masked, { tier: "max" });
      const issues = data.issues.map((i) => ({ ...i }));
      for (const found of org.issues) {
        if (found.points.length === 0) continue;
        // 제목이 같은 쟁점이 있으면 거기에, 없으면 새 쟁점으로 (근거를 다른 질문에 억지로 붙이지 않는다)
        const same = issues.find((i) => norm(i.title) === norm(found.title));
        if (same) {
          if (same.points.length === 0) same.points = found.points.slice(0, 6);
        } else
          issues.push({
            id: newId(),
            title: found.title,
            detail: "",
            points: found.points.slice(0, 6),
            unknowns: org.unknowns.slice(0, 3),
            byAi: true,
          });
      }
      // 리서치 노트: 검증된 근거를 쟁점별로 모은다 (모델 없이, 출처는 법제처 주소)
      const research = issues
        .filter((i) => i.points.length > 0)
        .map((i) => ({
          id: newId(),
          title: `법령·판례 — ${i.title}`.slice(0, 110),
          body: i.points.map((p) => `• ${p.label}: ${p.text}`).join("\n"),
          kind: "search" as const,
          refs: [i.id],
          sources: i.points.map((p) => ({ title: p.label, url: p.url })),
          byAi: true,
          at: now,
        }));
      data = parseMatterData({
        ...data,
        issues,
        notes: [...data.notes, ...research],
        // 확인할 사실이 비어 있는 쟁점에 쟁점 정리의 확인할 사실을 나눠 붙인다
      });

      const counts = Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, (v as unknown[]).length]),
      );
      writeFileSync(
        out,
        `${JSON.stringify(
          {
            id: src.id,
            title: src.title,
            data,
            meta: {
              fillCostUsd: Math.round(fillCost * 1e4) / 1e4,
              issuesCostUsd: Math.round(org.costUsd * 1e4) / 1e4,
              dropped: { ...drop },
              counts,
            },
          },
          null,
          2,
        )}\n`,
      );
      console.info(file, JSON.stringify(counts), fillCost.toFixed(3), org.costUsd.toFixed(3));
      expect(data.docs.length).toBeGreaterThanOrEqual(3);
    },
    1_200_000,
  );
});
