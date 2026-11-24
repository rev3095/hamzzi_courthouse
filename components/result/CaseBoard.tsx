"use client";
// 사건 정리판 (DEC-062): DeepSearch 결과(100자를 넘는 질문은 자동)를 7개 탭으로 보인다 —
// 개요 · 자료 · 사실관계 · 구조도 · 쟁점 · 리서치 · 노트. 탭마다 그림이 하나 이상 있고, 개요는 한 장짜리 사건 구조도(PNG 저장).
// 사건 분석(F-016) 화면의 탭 이름·순서를 그대로 쓴다. 재료는 결과의 deep(사건 구조·정리판)과 검증을 통과한 답변 문단·근거뿐이며
// 그림을 위해 모델을 더 부르지 않는다. 승패·유불리·가능성은 그리지 않는다 (절대 규칙 2).
import Link from "next/link";
import { useState } from "react";
import {
  CASE_KINDS,
  CASE_SIDES,
  parseDeepMap,
  type CaseSide,
  type DeepMap,
} from "@/lib/ai/deep-policy";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { BoardDiagram, type BoardColumn } from "./diagram";
import { Mindmap, MindmapCompact, issueSources } from "./DeepMapView";
import { sourceRef } from "./labels";
import { MaterialsView } from "./MaterialsView";
import { VirtualDocument } from "./VirtualDocument";

export const BOARD_TABS = [
  { key: "overview", name: "개요" },
  { key: "docs", name: "자료" },
  { key: "facts", name: "사실관계" },
  { key: "map", name: "구조도" },
  { key: "issues", name: "쟁점" },
  { key: "research", name: "리서치" },
  { key: "notes", name: "노트" },
] as const;
type BoardTab = (typeof BOARD_TABS)[number]["key"];

/** 청구·고소하는 쪽은 왼쪽, 청구받는·고소당한 쪽과 기관은 오른쪽 */
const LEFT_SIDES: CaseSide[] = ["claimant", "complainant"];

/** 문단의 첫 문장 (검증을 통과한 문단에서만 뽑는다 — 새 문장을 만들지 않는다) */
export function leadSentence(text: string): string {
  const t = text.trim();
  const m = /^(.+?[.?!])(\s|$)/.exec(t);
  const s = m ? m[1] : t;
  // 자를 때는 말줄임표를 붙인다 — 유보 표현이 잘려 단정처럼 읽히지 않게
  return s.length > 120 ? `${s.slice(0, 119)}…` : s;
}

/** 사건 종류 이름 (정리판이 없으면 빈 목록) */
export function kindNames(map: DeepMap): string[] {
  return (map.plan?.kinds ?? []).map((k) => CASE_KINDS[k]);
}

/** 당사자마다 자리 이름: 정리판의 자리, 없으면 사연에서의 위치 */
function sideOf(map: DeepMap, label: string): CaseSide | null {
  return map.plan?.sides.find((s) => s.party === label)?.side ?? null;
}

const TITLE_FOOT = (notice: string) =>
  `${notice} · 사연과 인용 확인을 통과한 답변으로 그린 정리이며 사건의 결과를 판단한 그림이 아니에요`;

export function CaseBoard({
  result,
  inquiryId,
}: {
  result: DemoAnalysisResult;
  inquiryId?: string;
}) {
  const [tab, setTab] = useState<BoardTab>("overview");
  const map = parseDeepMap(result.deep);
  if (!map) return null;
  const sources = issueSources(map, result);
  const kinds = kindNames(map);
  const file = (name: string) => `hamzzi-${name}`;

  return (
    <section aria-labelledby="case-board-title" className="rounded-card border-line mt-6 border">
      <header className="border-line border-b px-4 py-3 sm:px-5">
        <h2 id="case-board-title" className="font-display text-ink text-[19px] font-bold">
          DeepSearch · 사건 정리
        </h2>
        <p className="text-muted mt-0.5 text-[13px] leading-relaxed">
          {result.aiNotice} · 적어 주신 사연에서 뽑은 구조와 인용 확인을 통과한 답변 문단으로
          그렸어요. 사건의 결과를 판단한 그림이 아니에요.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="사건 정리 탭"
        className="border-line flex flex-wrap gap-1 border-b px-3 py-2 sm:px-4"
      >
        {BOARD_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`board-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`board-panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`min-h-10 rounded-full px-3.5 text-[14px] ${
              tab === t.key ? "bg-ink font-semibold text-white" : "text-ink hover:bg-soft"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`board-panel-${tab}`}
        aria-labelledby={`board-tab-${tab}`}
        className="px-3 py-4 sm:px-5"
      >
        {tab === "overview" && (
          <OverviewTab result={result} map={map} sources={sources} kinds={kinds} file={file} />
        )}
        {tab === "docs" && <DocsTab result={result} map={map} file={file} />}
        {tab === "facts" && <FactsTab result={result} map={map} file={file} />}
        {tab === "map" && (
          <MapTab result={result} map={map} sources={sources} kinds={kinds} file={file} />
        )}
        {tab === "issues" && <IssuesTab result={result} map={map} sources={sources} file={file} />}
        {tab === "research" && <ResearchTab result={result} map={map} file={file} />}
        {tab === "notes" && (
          <NotesTab result={result} map={map} file={file} inquiryId={inquiryId} />
        )}
      </div>
    </section>
  );
}

type TabProps = {
  result: DemoAnalysisResult;
  map: DeepMap;
  file: (name: string) => string;
};

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-muted text-[13px] leading-relaxed">{children}</p>;
}

// ── 개요: 한 장짜리 사건 구조도 ─────────────────────────────

function OverviewTab({
  result,
  map,
  sources,
  kinds,
  file,
}: TabProps & { sources: string[][]; kinds: string[] }) {
  const evidence = new Set(sources.flat()).size;
  const columns: BoardColumn[] = [
    {
      title: "당사자",
      width: 190,
      nodes: map.parties.map((p, i) => {
        const side = sideOf(map, p.label);
        return {
          id: `p${i}`,
          text: p.label,
          sub: side ? CASE_SIDES[side] : p.role,
          tone: "white" as const,
        };
      }),
    },
    {
      title: "사건",
      width: 170,
      nodes: [
        {
          id: "c",
          text: kinds.length > 0 ? `${kinds.join(" · ")} 사건` : "이 사건",
          sub: `쟁점 ${map.issues.length} · 근거 ${evidence}`,
          tone: "ink",
        },
      ],
    },
    {
      title: "쟁점",
      width: 240,
      nodes: map.issues.map((s, i) => ({
        id: `i${i}`,
        text: `${i + 1}. ${s.title}`,
        sub: sources[i].length > 0 ? sources[i].slice(0, 2).join(" · ") : "근거를 더 찾아볼 쟁점",
        tone: "cream" as const,
      })),
    },
    {
      title: map.plan?.prep.length ? "준비할 자료" : "확인할 사실",
      width: 210,
      nodes: map.plan?.prep.length
        ? map.plan.prep
            .slice(0, 5)
            .map((p, i) => ({ id: `d${i}`, text: p.item, tone: "gold" as const }))
        : map.unknowns.slice(0, 4).map((u, i) => ({ id: `d${i}`, text: u, tone: "dash" as const })),
    },
  ];
  const links: [string, string][] = [
    ...map.parties.map((_, i) => [`p${i}`, "c"] as [string, string]),
    ...map.issues.map((_, i) => ["c", `i${i}`] as [string, string]),
  ];
  return (
    <>
      <Lead>이 사건을 한 장으로 정리했어요. 이미지로 저장해 두고 상담·서류 준비 때 보세요.</Lead>
      <BoardDiagram
        title="사건 한 장 정리"
        badges={kinds.length > 0 ? kinds : ["DeepSearch"]}
        columns={columns}
        links={links}
        footer={TITLE_FOOT(result.aiNotice)}
        label={`사건 한 장 정리: 당사자 ${map.parties.length}, 쟁점 ${map.issues.length}, 근거 ${evidence}`}
        fileName={file("overview")}
      />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {map.issues.map((s, i) => {
          const first = s.points[0];
          const p = first !== undefined ? result.answer.points[first] : undefined;
          return (
            <li key={i} className="rounded-card bg-soft px-4 py-3">
              <p className="text-ink text-[14px] font-semibold">
                {i + 1}. {s.title}
              </p>
              {p && (
                <p className="text-muted mt-1 text-[13px] leading-relaxed">
                  {leadSentence(p.text)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ── 자료: 준비할 자료 + 첨부 자료 + (가상 질답이면) 가상 문서 ─────────────

function DocsTab({ result, map, file }: TabProps) {
  const prep = map.plan?.prep ?? [];
  return (
    <>
      {prep.length > 0 ? (
        <>
          <Lead>모아 두면 좋은 자료와, 그 자료가 어디에 쓰이는지예요.</Lead>
          <BoardDiagram
            title="준비할 자료"
            columns={[
              {
                title: "자료",
                width: 230,
                nodes: prep.map((p, i) => ({
                  id: `a${i}`,
                  text: `${i + 1}. ${p.item}`,
                  tone: "gold",
                })),
              },
              {
                title: "쓰이는 곳",
                width: 330,
                nodes: prep.map((p, i) => ({
                  id: `b${i}`,
                  text: p.why || "사연의 사실을 뒷받침하는 자료",
                  tone: "white",
                })),
              },
            ]}
            links={prep.map((_, i) => [`a${i}`, `b${i}`] as [string, string])}
            footer={TITLE_FOOT(result.aiNotice)}
            label={`준비할 자료 ${prep.length}개`}
            fileName={file("docs")}
          />
          <ul className="mt-3 flex flex-col gap-1.5">
            {prep.map((p) => (
              <li key={p.item} className="text-ink flex gap-2 text-[15px] leading-relaxed">
                <span
                  aria-hidden="true"
                  className="border-line mt-1.5 size-3.5 shrink-0 rounded-[4px] border"
                />
                <span>
                  <b className="font-semibold">{p.item}</b>
                  {p.why && <span className="text-muted"> — {p.why}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <Lead>
            이 결과에는 준비 자료 정리가 없어요. 아래 확인할 사실을 뒷받침할 자료(계약서·문자·영수증
            등)를 먼저 모아 두세요.
          </Lead>
          <BoardDiagram
            title="모아 둘 자료 찾기"
            columns={[
              {
                title: "확인할 사실",
                width: 300,
                nodes: map.unknowns.map((u, i) => ({ id: `u${i}`, text: u, tone: "dash" })),
              },
              {
                title: "쟁점",
                width: 240,
                nodes: map.issues.map((s, i) => ({
                  id: `i${i}`,
                  text: `${i + 1}. ${s.title}`,
                  tone: "cream",
                })),
              },
            ]}
            footer={TITLE_FOOT(result.aiNotice)}
            label="확인할 사실과 쟁점"
            fileName={file("docs")}
          />
        </>
      )}
      {result.materials && <MaterialsView result={result} />}
      {result.document && <VirtualDocument doc={result.document} />}
    </>
  );
}

// ── 사실관계: 흐름도 ─────────────────────────────

function FactsTab({ result, map, file }: TabProps) {
  if (map.events.length === 0)
    return <Lead>사연에서 순서를 정할 사실을 찾지 못했어요. 쟁점·구조도 탭을 보세요.</Lead>;
  return (
    <>
      <Lead>사연에 적힌 순서대로 정리했어요.</Lead>
      <BoardDiagram
        title="사실관계 흐름"
        columns={[
          {
            title: "순서",
            width: 150,
            nodes: map.events.map((e, i) => ({
              id: `w${i}`,
              text: e.when || `${i + 1}번째`,
              sub: e.who || undefined,
              tone: "ink",
            })),
          },
          {
            title: "일어난 일",
            width: 420,
            nodes: map.events.map((e, i) => ({ id: `e${i}`, text: e.what, tone: "white" })),
          },
        ]}
        links={[
          ...map.events.map((_, i) => [`w${i}`, `e${i}`] as [string, string]),
          ...map.events.slice(1).map((_, i) => [`w${i}`, `w${i + 1}`] as [string, string]),
        ]}
        footer={TITLE_FOOT(result.aiNotice)}
        label={`사실관계 흐름 ${map.events.length}단계`}
        fileName={file("facts")}
      />
    </>
  );
}

// ── 구조도: 마인드맵 + 양쪽 대응 구도 ─────────────────────────────

function MapTab({
  result,
  map,
  sources,
  kinds,
  file,
}: TabProps & { sources: string[][]; kinds: string[] }) {
  const sides = map.plan?.sides ?? [];
  const left = sides.filter((s) => LEFT_SIDES.includes(s.side));
  const right = sides.filter((s) => !LEFT_SIDES.includes(s.side));
  return (
    <>
      <Lead>당사자·쟁점·확인할 사실이 어떻게 이어지는지예요.</Lead>
      <div className="mt-2">
        <MindmapCompact map={map} sources={sources} />
        <Mindmap map={map} sources={sources} />
      </div>
      {sides.length > 0 && (
        <>
          <h3 className="text-ink mt-5 text-[15px] font-bold">양쪽 당사자와 할 수 있는 대응</h3>
          <Lead>
            누가 어느 자리에 서는지와 각자 할 수 있는 일이에요. 누가 옳은지 판단한 것이 아니에요.
          </Lead>
          <BoardDiagram
            title="당사자별 대응"
            badges={kinds}
            columns={[
              {
                title: "할 수 있는 대응",
                width: 230,
                nodes: left.flatMap((s, i) =>
                  s.actions.map((a, j) => ({ id: `la${i}-${j}`, text: a, tone: "white" as const })),
                ),
              },
              {
                title: "청구·고소하는 쪽",
                width: 160,
                nodes: left.map((s, i) => ({
                  id: `l${i}`,
                  text: s.party,
                  sub: CASE_SIDES[s.side],
                  tone: "cream" as const,
                })),
              },
              {
                title: "절차",
                width: 130,
                nodes: [
                  { id: "k", text: kinds.length > 0 ? kinds.join(" · ") : "이 사건", tone: "ink" },
                ],
              },
              {
                title: "상대방",
                width: 160,
                nodes: right.map((s, i) => ({
                  id: `r${i}`,
                  text: s.party,
                  sub: CASE_SIDES[s.side],
                  tone: "cream" as const,
                })),
              },
              {
                title: "할 수 있는 대응",
                width: 230,
                nodes: right.flatMap((s, i) =>
                  s.actions.map((a, j) => ({ id: `ra${i}-${j}`, text: a, tone: "white" as const })),
                ),
              },
            ]}
            links={[
              ...left.flatMap((s, i) =>
                s.actions.map((_, j) => [`la${i}-${j}`, `l${i}`] as [string, string]),
              ),
              ...left.map((_, i) => [`l${i}`, "k"] as [string, string]),
              ...right.map((_, i) => ["k", `r${i}`] as [string, string]),
              ...right.flatMap((s, i) =>
                s.actions.map((_, j) => [`r${i}`, `ra${i}-${j}`] as [string, string]),
              ),
            ]}
            footer={TITLE_FOOT(result.aiNotice)}
            label={`당사자별 대응: 당사자 ${sides.length}`}
            fileName={file("sides")}
          />
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {sides.map((s) => (
              <li key={s.party} className="rounded-card bg-soft px-4 py-3">
                <p className="text-ink text-[14px] font-semibold">
                  {s.party} <span className="text-muted font-normal">· {CASE_SIDES[s.side]}</span>
                </p>
                <ul className="mt-1 list-disc pl-5 text-[13px] leading-relaxed">
                  {s.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// ── 쟁점: 쟁점 → 답변 요지 → 근거 ─────────────────────────────

function IssuesTab({ result, map, sources, file }: TabProps & { sources: string[][] }) {
  return (
    <>
      <Lead>쟁점마다 답변의 첫 문장과 그 문단이 쓴 근거를 이었어요.</Lead>
      <BoardDiagram
        title="쟁점별 근거"
        columns={[
          {
            title: "쟁점",
            width: 220,
            nodes: map.issues.map((s, i) => ({
              id: `i${i}`,
              text: `${i + 1}. ${s.title}`,
              tone: "cream",
            })),
          },
          {
            title: "답변 요지",
            width: 330,
            nodes: map.issues.map((s, i) => {
              const first = s.points[0];
              const p = first !== undefined ? result.answer.points[first] : undefined;
              return {
                id: `a${i}`,
                text: p ? leadSentence(p.text) : "이번에 찾은 자료로는 답하지 못했어요",
                tone: p ? ("white" as const) : ("dash" as const),
              };
            }),
          },
          {
            title: "근거",
            width: 220,
            nodes: map.issues.flatMap((_, i) =>
              sources[i]
                .slice(0, 3)
                .map((s, j) => ({ id: `s${i}-${j}`, text: s, tone: "gold" as const })),
            ),
          },
        ]}
        links={[
          ...map.issues.map((_, i) => [`i${i}`, `a${i}`] as [string, string]),
          ...map.issues.flatMap((_, i) =>
            sources[i].slice(0, 3).map((_, j) => [`a${i}`, `s${i}-${j}`] as [string, string]),
          ),
        ]}
        footer={TITLE_FOOT(result.aiNotice)}
        label={`쟁점별 근거: 쟁점 ${map.issues.length}`}
        fileName={file("issues")}
      />
    </>
  );
}

// ── 리서치: 법령 → 쟁점 → 판례 ─────────────────────────────

function ResearchTab({ result, map, file }: TabProps) {
  // 쟁점마다 남은 문단이 쓴 조문·판례 (모델이 쓴 문단은 근거 묶음에 넣지 않는다 — 출처가 법제처가 아니다)
  const laws = new Map<string, Set<number>>();
  const cases = new Map<string, Set<number>>();
  map.issues.forEach((s, i) => {
    for (const n of s.points) {
      const p = result.answer.points[n];
      if (!p || p.check === "model") continue;
      const label = sourceRef(p.source, result).label;
      const bucket = p.source.startsWith("case:") ? cases : laws;
      bucket.set(label, (bucket.get(label) ?? new Set()).add(i));
    }
  });
  const lawList = [...laws.entries()].slice(0, 8);
  const caseList = [...cases.entries()].slice(0, 6);
  const used = [
    ...result.articles
      .filter((a) => a.used)
      .map((a) => ({ key: a.id, label: `${a.lawName} ${a.articleNo}`, url: a.sourceUrl })),
    ...result.cases
      .filter((c) => c.used)
      .map((c) => ({ key: c.id, label: `${c.court} ${c.caseNo}`, url: c.sourceUrl })),
  ];
  return (
    <>
      <Lead>답변에 쓴 법령과 판례가 어느 쟁점에 닿는지예요. 원문은 법제처에서 열어 보세요.</Lead>
      {lawList.length + caseList.length > 0 ? (
        <BoardDiagram
          title="근거 지도"
          columns={[
            {
              title: "법령",
              width: 220,
              nodes: lawList.map(([l], i) => ({ id: `l${i}`, text: l, tone: "gold" })),
            },
            {
              title: "쟁점",
              width: 220,
              nodes: map.issues.map((s, i) => ({
                id: `i${i}`,
                text: `${i + 1}. ${s.title}`,
                tone: "cream",
              })),
            },
            {
              title: "판례",
              width: 220,
              nodes: caseList.map(([c], i) => ({ id: `c${i}`, text: c, tone: "white" })),
            },
          ]}
          links={[
            ...lawList.flatMap(([, set], i) =>
              [...set].map((n) => [`l${i}`, `i${n}`] as [string, string]),
            ),
            ...caseList.flatMap(([, set], i) =>
              [...set].map((n) => [`i${n}`, `c${i}`] as [string, string]),
            ),
          ]}
          footer={TITLE_FOOT(result.aiNotice)}
          label={`근거 지도: 법령 ${lawList.length}, 판례 ${caseList.length}`}
          fileName={file("research")}
        />
      ) : (
        <BoardDiagram
          title="근거 지도"
          columns={[
            {
              title: "쟁점",
              width: 260,
              nodes: map.issues.map((s, i) => ({
                id: `i${i}`,
                text: `${i + 1}. ${s.title}`,
                tone: "cream",
              })),
            },
            {
              title: "더 찾아볼 곳",
              width: 260,
              nodes: [
                { id: "r", text: "판례 리서치에서 쟁점 낱말로 검색", tone: "white" },
                { id: "s", text: "법제처 국가법령정보센터 원문", tone: "white" },
              ],
            },
          ]}
          links={[...map.issues.map((_, i) => [`i${i}`, "r"] as [string, string])]}
          footer={TITLE_FOOT(result.aiNotice)}
          label="근거 지도"
          fileName={file("research")}
        />
      )}
      {used.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {used.map((u) => (
            <li key={u.key}>
              {u.url ? (
                <a
                  href={u.url}
                  target="_blank"
                  rel="noreferrer"
                  className="border-gold-line text-link rounded-full border bg-white px-3 py-1 text-[13px] hover:underline"
                >
                  {u.label}
                </a>
              ) : (
                <span className="border-line text-ink rounded-full border px-3 py-1 text-[13px]">
                  {u.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3">
        <Link
          href="/research"
          className="text-link text-sm font-semibold underline-offset-2 hover:underline"
        >
          판례 리서치 열기 →
        </Link>
      </p>
    </>
  );
}

// ── 노트: 확인할 사실 + 내 메모(이 기기 탭에만) ─────────────────────────────

const NOTE_KEY = (id: string) => `hz:note:${id}`;

function NotesTab({ result, map, file, inquiryId }: TabProps & { inquiryId?: string }) {
  const [note, setNote] = useState(() => {
    if (!inquiryId) return "";
    try {
      return sessionStorage.getItem(NOTE_KEY(inquiryId)) ?? "";
    } catch {
      return "";
    }
  });
  const mine =
    (map.plan?.sides ?? []).find((s) => LEFT_SIDES.includes(s.side)) ?? map.plan?.sides[0];
  return (
    <>
      <Lead>
        답이 달라질 수 있는 사실과, 먼저 해 볼 일이에요. 메모는 이 브라우저 탭에만 남아요.
      </Lead>
      <BoardDiagram
        title="확인할 것과 할 일"
        columns={[
          {
            title: "확인할 사실",
            width: 300,
            nodes: map.unknowns.map((u, i) => ({ id: `u${i}`, text: u, tone: "dash" })),
          },
          {
            title: mine ? `${mine.party} 쪽이 해 볼 일` : "다음 할 일",
            width: 280,
            nodes: mine?.actions.length
              ? mine.actions.map((a, i) => ({ id: `t${i}`, text: a, tone: "gold" as const }))
              : [{ id: "t0", text: "아래 절차 안내의 첫 단계부터 보세요", tone: "gold" as const }],
          },
        ]}
        footer={TITLE_FOOT(result.aiNotice)}
        label={`확인할 사실 ${map.unknowns.length}`}
        fileName={file("notes")}
      />
      <label className="text-ink mt-4 block text-[14px] font-semibold" htmlFor="board-note">
        내 메모
      </label>
      <textarea
        id="board-note"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          if (inquiryId)
            try {
              sessionStorage.setItem(NOTE_KEY(inquiryId), e.target.value);
            } catch {
              // 저장소를 못 쓰면 이 화면에만 둔다
            }
        }}
        rows={4}
        maxLength={2000}
        placeholder="확인한 사실, 상담 때 물어볼 것 등을 적어 두세요."
        className="border-line text-ink mt-1.5 w-full rounded-[10px] border px-3 py-2 text-[15px]"
      />
    </>
  );
}
