"use client";
// 검색 '물어보기' AI 답 (DEC-076, 2026-11-27 사용자 요청). '물어보기'를 누르면 검색 결과 목록(AI 없음)과 함께 이 답이 붙는다.
// 두 화면은 쓰임이 달라 같은 재료를 다르게 보인다:
//  · 검색(/search) = 처음 찾는 사람용 '한눈에 답': 이렇게 이해했어요 → 찾은 건수 → 요약 → 구조도 → 어디서 쓰이나요 → 성립 조건 → 실제 사례 → 관련 법령 → 더 찾아보기
//  · 리서치(/research) = 업무용 '리서치 브리프': 건수·법원별 묶음 → 검토할 쟁점(체크) → 성립 요건 표(근거 확인) → 법령 체계 → 구조도 → 판례 → 더 찾을 검색어
// AI 문장(요약·쓰이는 곳·조건·쟁점·가상 사례)과 검색 결과(법령·판례·건수)를 섞지 않고 출처를 밝힌다. 관련도·유불리·확률 표시는 없다(절대 규칙 2).
import Link from "next/link";
import { useEffect, useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { getSearchAnswer, type ClientError } from "@/lib/client/api";
import {
  ANSWER_REASON_TEXT,
  ANSWER_REUSED_NOTE,
  ANSWER_SOURCE_NOTE,
  ANSWER_VIRTUAL_TAG,
  courtCounts,
  lawTree,
  type AnswerFocus,
  type AnswerLaw,
  type AnswerMode,
  type SearchAnswer as Answer,
  type SearchAnswerView,
} from "@/lib/search/answer/policy";
import { RANK_NOTE } from "@/lib/search/rank";
import { dotDate } from "../result/labels";
import { BoardDiagram } from "../result/diagram";
import { answerBoard } from "./answer-board";
import { CountryLabel } from "./Flag";

type Load =
  { s: "loading" } | { s: "done"; v: SearchAnswerView } | { s: "error"; error: ClientError };

const H = "font-display text-ink text-[19px] font-bold";
const BODY = "text-ink text-[16px] leading-relaxed";
const CHIP =
  "border-line text-ink hover:border-gold inline-flex min-h-11 items-center rounded-full border bg-white px-4 text-[15px]";

/** 검색어가 바뀔 때마다 새로 부르도록 부르는 쪽이 key={q}를 준다 */
export function SearchAnswer({
  q,
  mode,
  focus,
  onPick,
}: {
  q: string;
  mode: AnswerMode;
  focus: AnswerFocus;
  /** 더 찾아볼 검색어를 누르면 그 말로 다시 찾는다 */
  onPick?: (q: string) => void;
}) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  useEffect(() => {
    let live = true;
    void getSearchAnswer(q, mode, focus).then((r) => {
      if (!live) return;
      setLoad(r.ok ? { s: "done", v: r.data } : { s: "error", error: r.error });
    });
    return () => {
      live = false;
    };
  }, [q, mode, focus]);

  const title = mode === "research" ? "AI 리서치 브리프" : "AI 한눈에 답";
  return (
    <section
      aria-label={title}
      aria-busy={load.s === "loading"}
      data-testid="search-answer"
      className="rounded-panel border-honey-line mt-6 border bg-white"
    >
      <div className="bg-honey border-honey-line flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-[inherit] border-b px-5 py-3 lg:px-6">
        <h2 className="font-display text-ink text-[20px] font-bold">{title}</h2>
        <span className="text-label rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold">
          AI Light · Haiku 5.5
        </span>
        {load.s === "done" && load.v.reused && (
          <span className="text-muted text-[13px]">{ANSWER_REUSED_NOTE}</span>
        )}
      </div>
      <div className="px-5 py-5 lg:px-6">
        {load.s === "loading" && <AnswerSkeleton mode={mode} />}
        {load.s === "error" && (
          <p role="status" className="text-muted text-[15px]">
            AI 답을 불러오지 못했어요. 아래 검색 결과는 그대로 볼 수 있어요.
          </p>
        )}
        {load.s === "done" && !load.v.answer && (
          <p role="status" className="text-muted text-[15px]">
            {load.v.ai.used
              ? ANSWER_REASON_TEXT.model_failed
              : ANSWER_REASON_TEXT[load.v.ai.reason]}
          </p>
        )}
        {load.s === "done" && load.v.answer && (
          <>
            {mode === "research" ? (
              <ResearchBrief a={load.v.answer} onPick={onPick} />
            ) : (
              <QuickAnswer a={load.v.answer} onPick={onPick} />
            )}
            <p className="text-muted mt-5 text-[13px] leading-relaxed">
              {ANSWER_SOURCE_NOTE} · {load.v.notice}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function AnswerSkeleton({ mode }: { mode: AnswerMode }) {
  return (
    <div aria-live="polite">
      <p className="text-ink text-[16px] font-semibold">
        AI가 검색어의 맥락을 읽고 관련 법령·판례를 더 찾고 있어요…
      </p>
      <ol className="text-muted mt-2 grid gap-1 text-[14px]">
        <li>· 검색어 해석</li>
        <li>· 국내·해외 공식 사이트에서 더 찾기</li>
        <li>· {mode === "research" ? "쟁점·요건 정리" : "쉬운 말로 정리"}</li>
      </ol>
      <div aria-hidden="true" className="mt-4 grid gap-3">
        {[56, 140, 88].map((h, i) => (
          <div
            key={i}
            className="rounded-card bg-soft animate-pulse motion-reduce:animate-none"
            style={{ height: h }}
          />
        ))}
      </div>
    </div>
  );
}

/** 찾은 건수 — 코드가 센 값 */
function Counts({ a }: { a: Answer }) {
  const items = [
    { label: "국내 법령", n: a.laws.domestic.length, unit: "개" },
    { label: "해외 법령", n: a.laws.foreign.length, unit: "개" },
    {
      label: a.casesTotal !== null ? "판례 (법제처 전체)" : "판례",
      n: a.casesTotal ?? a.cases.length,
      unit: "건",
    },
  ];
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="찾은 건수">
      {items.map((it) => (
        <li key={it.label} className="bg-soft rounded-[10px] px-3 py-3 text-center">
          <p className="text-ink font-display text-[24px] leading-none font-bold">
            {it.n.toLocaleString("ko-KR")}
            <span className="text-muted ml-0.5 text-[14px] font-normal">{it.unit}</span>
          </p>
          <p className="text-muted mt-1.5 text-[13px]">{it.label}</p>
        </li>
      ))}
    </ul>
  );
}

function Intent({ a }: { a: Answer }) {
  if (!a.intent && !a.field) return null;
  return (
    <p className="text-ink text-[16px] leading-relaxed">
      <span className="text-label mr-2 text-[13px] font-semibold">이렇게 이해했어요</span>
      {a.intent || `${a.field} 분야의 법령을 찾고 계신 것 같아요.`}
    </p>
  );
}

function Searched({ a }: { a: Answer }) {
  const words = [...a.searched.ko, ...a.searched.en, ...a.searched.ja];
  if (words.length <= 1) return null;
  return (
    <p className="text-muted text-[13px] leading-relaxed">이렇게 찾았어요 · {words.join(" · ")}</p>
  );
}

function Diagram({ a }: { a: Answer }) {
  const { columns, links } = answerBoard(a);
  if (columns.filter((c) => c.nodes.length > 0).length < 2) return null;
  return (
    <section aria-labelledby="ans-map">
      <h3 id="ans-map" className={H}>
        법령 구조도
      </h3>
      <p className="text-muted mt-1 text-[14px]">
        찾는 법령이 어느 분야·어느 단계에 있고, 어디서 쓰이며 어떤 조건에서 문제 되는지 한 장으로
        보여 드려요. 끌어서 옮기고 확대할 수 있어요.
      </p>
      <div className="mt-3">
        <BoardDiagram
          title={`'${a.query}' 법령 구조`}
          badges={[a.field || "법령", "AI Light"]}
          columns={columns}
          links={links}
          footer={`법령·판례는 공식 사이트 검색 결과, 쓰이는 곳·조건은 AI 설명 · ${AI_NOTICE}`}
          label={`${a.query} 법령 구조도`}
          fileName={`법령구조-${a.query}`}
        />
      </div>
    </section>
  );
}

function Conditions({ a, table = false }: { a: Answer; table?: boolean }) {
  if (a.conditions.length === 0) return null;
  return (
    <section aria-labelledby="ans-cond">
      <h3 id="ans-cond" className={H}>
        {table ? "성립 요건" : "어떤 조건에서 성립하나요"}
      </h3>
      {table ? (
        <table className="border-line mt-3 w-full border-collapse border text-left text-[15px]">
          <thead className="bg-soft text-muted text-[13px]">
            <tr>
              <th className="border-line w-10 border px-3 py-2 font-semibold">번호</th>
              <th className="border-line border px-3 py-2 font-semibold">요건</th>
              <th className="border-line w-[34%] border px-3 py-2 font-semibold">근거 조문</th>
            </tr>
          </thead>
          <tbody>
            {a.conditions.map((c, i) => (
              <tr key={i}>
                <td className="border-line text-muted border px-3 py-2 text-center">{i + 1}</td>
                <td className="border-line text-ink border px-3 py-2 leading-relaxed">{c.text}</td>
                <td className="border-line border px-3 py-2">
                  {c.confirmed ? (
                    <Link
                      href={c.confirmed.href}
                      className="text-link underline-offset-2 hover:underline"
                    >
                      {c.confirmed.label}
                      <span className="text-muted ml-1 text-[12px]">법제처 확인</span>
                    </Link>
                  ) : (
                    <span className="text-muted text-[13px]">확인한 근거 없음</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ol className="mt-3 grid gap-2">
          {a.conditions.map((c, i) => (
            <li key={i} className="border-line flex gap-3 rounded-[10px] border bg-white px-4 py-3">
              <span
                aria-hidden="true"
                className="bg-cream text-label flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
              >
                {i + 1}
              </span>
              <div>
                <p className={BODY}>{c.text}</p>
                {c.confirmed && (
                  <Link
                    href={c.confirmed.href}
                    className="text-link mt-1 inline-flex min-h-9 items-center text-[14px] underline-offset-2 hover:underline"
                  >
                    근거 · {c.confirmed.label}
                    <span className="text-muted ml-1.5 text-[12px]">법제처 확인</span>
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Cases({ a }: { a: Answer }) {
  return (
    <section aria-labelledby="ans-cases">
      <h3 id="ans-cases" className={H}>
        실제 사례·판례
      </h3>
      {a.cases.length > 0 ? (
        <>
          <p className="text-muted mt-1 text-[14px]">
            법제처 판례 본문 검색에서 찾은 앞쪽 판례예요
            {a.casesTotal !== null && ` (전체 ${a.casesTotal.toLocaleString("ko-KR")}건)`}. 관련이
            적은 판례가 섞일 수 있어요.
          </p>
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {a.cases.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cases/${c.id}?from=search`}
                  className="border-line hover:border-gold flex min-h-11 flex-col justify-center rounded-[10px] border bg-white px-4 py-3"
                >
                  <span className="text-ink text-[16px] font-semibold">
                    {c.caseName || c.caseNo}
                  </span>
                  <span className="text-muted text-[13px]">
                    {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : a.virtualCases.length > 0 ? (
        <div
          className="border-gold-line bg-soft mt-3 rounded-[12px] border-2 border-dashed p-4"
          data-testid="answer-virtual"
        >
          <p className="text-ink text-[14px] font-semibold">
            법제처에서 찾은 판례가 없어, 이해를 돕는 가상 사례를 보여 드려요.
          </p>
          <ul className="mt-3 grid gap-3">
            {a.virtualCases.map((v, i) => (
              <li
                key={i}
                className="border-gold-line rounded-[10px] border border-dashed bg-white p-4"
              >
                <p className="bg-cream text-label w-fit rounded-[6px] px-2 py-0.5 text-[12px] font-semibold">
                  {ANSWER_VIRTUAL_TAG}
                </p>
                <p className="text-ink mt-2 text-[16px] font-bold">{v.title}</p>
                <p className="text-muted mt-2 text-[13px] font-semibold">이런 상황이라면</p>
                <p className={BODY}>{v.situation}</p>
                <p className="text-muted mt-2 text-[13px] font-semibold">법이 보는 부분</p>
                <p className={BODY}>{v.point}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted mt-2 text-[15px]">법제처에서 찾은 판례가 없어요.</p>
      )}
    </section>
  );
}

function LawRow({ l }: { l: AnswerLaw }) {
  const name = l.titleKo ?? l.name;
  return (
    <li className="border-line flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[10px] border bg-white px-4 py-2.5">
      <CountryLabel country={l.country} className="text-muted text-[13px]" />
      {l.href ? (
        <Link
          href={l.href}
          className="text-ink min-h-9 content-center text-[16px] font-semibold underline-offset-2 hover:underline"
        >
          {name}
        </Link>
      ) : (
        <a
          href={l.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink min-h-9 content-center text-[16px] font-semibold underline-offset-2 hover:underline"
        >
          {name} ↗
        </a>
      )}
      {l.kind && <span className="text-muted text-[13px]">{l.kind}</span>}
      {l.core && (
        <span className="border-gold text-ink rounded-full border px-2 py-0.5 text-[12px] font-semibold">
          {l.country === "kr" ? "자주 쓰는 법령" : "핵심 법령"}
        </span>
      )}
    </li>
  );
}

function Laws({ a }: { a: Answer }) {
  const { domestic, foreign } = a.laws;
  if (domestic.length + foreign.length === 0) return null;
  return (
    <section aria-labelledby="ans-laws">
      <h3 id="ans-laws" className={H}>
        관련 법령
      </h3>
      <p className="text-muted mt-1 text-[13px]">
        검색어와 AI가 고른 법령 이름으로 법제처·각 나라 공식 사이트에서 찾은 법령이에요. {RANK_NOTE}
      </p>
      {domestic.length > 0 && (
        <>
          <p className="text-ink mt-3 text-[14px] font-semibold">국내</p>
          <ul className="mt-1.5 grid gap-2">
            {domestic.map((l) => (
              <LawRow key={`${l.country}:${l.name}`} l={l} />
            ))}
          </ul>
        </>
      )}
      {foreign.length > 0 && (
        <>
          <p className="text-ink mt-4 text-[14px] font-semibold">해외</p>
          <ul className="mt-1.5 grid gap-2">
            {foreign.map((l) => (
              <LawRow key={`${l.country}:${l.name}`} l={l} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function NextQueries({
  a,
  onPick,
  title,
}: {
  a: Answer;
  onPick?: (q: string) => void;
  title: string;
}) {
  if (a.nextQueries.length === 0 || !onPick) return null;
  return (
    <section aria-labelledby="ans-next">
      <h3 id="ans-next" className="text-ink text-[15px] font-bold">
        {title}
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {a.nextQueries.map((q) => (
          <li key={q}>
            <button type="button" className={CHIP} onClick={() => onPick(q)}>
              {q}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuickAnswer({ a, onPick }: { a: Answer; onPick?: (q: string) => void }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Intent a={a} />
        <Counts a={a} />
        <Searched a={a} />
      </div>
      <section aria-labelledby="ans-summary" className="bg-honey rounded-[12px] p-4 lg:p-5">
        <h3 id="ans-summary" className={H}>
          요약
        </h3>
        <div className="mt-2 grid gap-1.5">
          {a.summary.map((s, i) => (
            <p key={i} className={BODY}>
              {s}
            </p>
          ))}
        </div>
      </section>
      <Diagram a={a} />
      {a.usage.length > 0 && (
        <section aria-labelledby="ans-usage">
          <h3 id="ans-usage" className={H}>
            어디서 쓰이나요
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {a.usage.map((u, i) => (
              <li
                key={i}
                className="bg-soft text-ink rounded-[10px] px-4 py-3 text-[15px] leading-relaxed"
              >
                {u}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Conditions a={a} />
      <Cases a={a} />
      <Laws a={a} />
      <NextQueries a={a} onPick={onPick} title="이 말로도 찾아보세요" />
    </div>
  );
}

function ResearchBrief({ a, onPick }: { a: Answer; onPick?: (q: string) => void }) {
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set());
  const courts = courtCounts(a.cases);
  const tree = lawTree(a.laws.domestic);
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Intent a={a} />
        <Counts a={a} />
        {courts.length > 0 && (
          <p className="text-muted text-[13px]">
            불러온 판례 {a.cases.length}건의 법원 ·{" "}
            {courts.map((c) => `${c.court} ${c.count}건`).join(" · ")}
          </p>
        )}
        <Searched a={a} />
      </div>
      <section aria-labelledby="ans-summary">
        <h3 id="ans-summary" className={H}>
          요약
        </h3>
        <ul className="mt-2 grid list-disc gap-1.5 pl-5">
          {a.summary.map((s, i) => (
            <li key={i} className={BODY}>
              {s}
            </li>
          ))}
        </ul>
      </section>
      {a.issues.length > 0 && (
        <section aria-labelledby="ans-issues">
          <h3 id="ans-issues" className={H}>
            검토할 쟁점
          </h3>
          <p className="text-muted mt-1 text-[13px]">
            검토한 쟁점을 표시해 두세요. 표시는 이 화면에만 남아요.
          </p>
          <ul className="mt-2 grid gap-1.5">
            {a.issues.map((q, i) => (
              <li key={i}>
                <label className="text-ink bg-soft flex min-h-11 items-start gap-3 rounded-[10px] px-4 py-2.5 text-[15px] leading-relaxed">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={checked.has(i)}
                    onChange={() => {
                      const next = new Set(checked);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      setChecked(next);
                    }}
                  />
                  <span className={checked.has(i) ? "text-muted line-through" : ""}>{q}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Conditions a={a} table />
      {tree.length > 0 && (
        <section aria-labelledby="ans-tree">
          <h3 id="ans-tree" className={H}>
            법령 체계
          </h3>
          <p className="text-muted mt-1 text-[13px]">{RANK_NOTE}</p>
          <ul className="mt-2 grid gap-2">
            {tree.map((g) => (
              <li
                key={g.law.name}
                className="border-line rounded-[10px] border bg-white px-4 py-2.5"
              >
                <Link
                  href={g.law.href ?? "#"}
                  className="text-ink text-[16px] font-semibold underline-offset-2 hover:underline"
                >
                  {g.law.name}
                </Link>
                <span className="text-muted ml-2 text-[13px]">{g.law.kind}</span>
                {g.lower.length > 0 && (
                  <ul className="border-line mt-1.5 grid gap-1 border-l-2 pl-3">
                    {g.lower.map((l) => (
                      <li key={l.name} className="text-[14px]">
                        <Link
                          href={l.href ?? "#"}
                          className="text-link underline-offset-2 hover:underline"
                        >
                          {l.name}
                        </Link>
                        <span className="text-muted ml-1.5 text-[12px]">{l.kind}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {a.laws.foreign.length > 0 && (
            <>
              <p className="text-ink mt-3 text-[14px] font-semibold">해외 대응 법령</p>
              <ul className="mt-1.5 grid gap-2">
                {a.laws.foreign.map((l) => (
                  <LawRow key={`${l.country}:${l.name}`} l={l} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      <Diagram a={a} />
      <Cases a={a} />
      <NextQueries a={a} onPick={onPick} title="더 찾을 검색어" />
    </div>
  );
}
