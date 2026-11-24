"use client";
// 분야별 비서 페이지 (F-018, DEC-057). 세 비서는 같은 대화 부품(AssistantChat)을 쓰고, 배치·도움 판·스킨이 다르다.
// - 내집마련: 왼쪽 계약 단계 세로 단계표 + 오른쪽 대화
// - 고소미: 가운데 대화 + 오른쪽 '먼저 남겨 둘 것' 접이식 판 (어두운 남색·금색 틀)
// - 중고천국: 위쪽 '지금 할 일 순서' 표(이 화면에서만 체크) + 아래 대화
// 위쪽 탭: 대화하기 | 아카이브(미리 만든 질답 세트, ArchiveTab). 아카이브의 '체험하기'는 대화 탭으로 돌아와 그 질문을 보낸다.
// 도움 판·사례는 모두 고정 문안이다 (모델 없음). 사례의 공개 판례는 /cases/{번호}에서 법제처 원문을 연다.
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useState } from "react";
import {
  ASSISTANTS,
  isAssistantId,
  type Assistant,
  type AssistantId,
} from "@/lib/assistants/agents";
import {
  FICTIONAL_LABEL,
  PRECEDENT_LABEL,
  casesOf,
  type AssistantCase,
} from "@/lib/assistants/cases";
import { ArchiveTab } from "./ArchiveTab";
import { AssistantChat } from "./AssistantChat";
import { AssistantEmblem } from "./AssistantIcon";
import "./assistants.css";

/** /assistants/[id] — 정해진 세 비서만, 그 밖은 404 */
export function AssistantRoute() {
  const { id } = useParams<{ id: string }>();
  if (!isAssistantId(id)) notFound();
  return <AssistantPage key={id} id={id} />;
}

export function AssistantPage({ id }: { id: AssistantId }) {
  const a = ASSISTANTS[id];
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"chat" | "archive">("chat");
  // 아카이브의 체험하기: 대화 탭으로 돌아와 그 질문을 보낸다 (key가 바뀔 때마다 한 번)
  const [autoSend, setAutoSend] = useState<{ text: string; key: number } | null>(null);
  const chat = (
    <AssistantChat assistant={id} draft={draft} onDraft={setDraft} autoSend={autoSend} />
  );
  const tryQuestion = (q: string) => {
    setTab("chat");
    setAutoSend({ text: q, key: Date.now() });
    // 탭이 바뀐 뒤 대화창으로 내려간다 (좁은 화면에서는 도움 판 아래에 있다)
    requestAnimationFrame(() =>
      document
        .getElementById(`hza-input-${id}-page`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };
  const put = (s: string) => {
    setDraft(s);
    document.getElementById(`hza-input-${id}-page`)?.focus();
  };

  return (
    <main data-hza={id} className="hza-root flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-16 lg:pt-10">
        <nav className="hza-muted mb-5 text-sm" aria-label="위치">
          <Link href="/assistants" className="hza-link">
            전문 에이전트
          </Link>{" "}
          · {a.name}
        </nav>
        <Hero a={a} />

        <div
          role="tablist"
          aria-label={`${a.name} 화면`}
          className="mt-6 flex gap-1 border-b border-[var(--hza-line)] pb-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chat"}
            onClick={() => setTab("chat")}
            className="hza-tab"
          >
            대화하기
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archive"}
            onClick={() => setTab("archive")}
            className="hza-tab"
          >
            아카이브 · 질답 세트
          </button>
        </div>

        <div hidden={tab !== "chat"}>
          {id === "home" && (
            <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
              <StagePanel a={a} onPick={put} />
              <section aria-label={`${a.name}와 대화`}>{chat}</section>
            </div>
          )}
          {id === "report" && (
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
              <section aria-label={`${a.name}와 대화`}>{chat}</section>
              <FoldPanel a={a} onPick={put} />
            </div>
          )}
          {id === "market" && (
            <div className="mt-8 space-y-6">
              <TodoStrip a={a} onPick={put} />
              <section aria-label={`${a.name}와 대화`}>{chat}</section>
            </div>
          )}

          <Cases id={id} />
        </div>
        {tab === "archive" && <ArchiveTab assistant={id} onTry={tryQuestion} />}
      </div>
    </main>
  );
}

function Hero({ a }: { a: Assistant }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <AssistantEmblem id={a.id} size={68} />
      <div className="min-w-0">
        <p className="hza-accent-text text-[12px] font-bold tracking-[0.14em]">
          햄찌법원 전문 에이전트 · AI
        </p>
        <h1 className="hza-title font-display mt-1 text-[34px] leading-tight font-black sm:text-[44px]">
          {a.name}
        </h1>
        <p className="mt-1 text-[17px] font-semibold">{a.tagline}</p>
        <p className="hza-muted mt-1 text-[15px]">{a.subtitle}</p>
        {a.disclaimer && <p className="hza-muted mt-2 text-[12px]">{a.disclaimer}</p>}
      </div>
    </header>
  );
}

/** 내집마련: 계약 단계 세로 단계표 */
function StagePanel({ a, onPick }: { a: Assistant; onPick: (s: string) => void }) {
  const [open, setOpen] = useState(a.panel.groups[0].key);
  return (
    <aside className="hza-card h-fit p-5" aria-label={a.panel.title}>
      <h2 className="text-[17px] font-bold">{a.panel.title}</h2>
      <ol className="mt-4 space-y-2">
        {a.panel.groups.map((g, i) => {
          const on = g.key === open;
          return (
            <li key={g.key} className="relative pl-9">
              <span
                aria-hidden="true"
                className={`absolute top-2.5 left-0 flex size-6 items-center justify-center rounded-full text-[12px] font-bold ${
                  on
                    ? "bg-[var(--hza-strong)] text-white"
                    : "border border-[var(--hza-line)] bg-white text-[var(--hza-muted)]"
                }`}
              >
                {i + 1}
              </span>
              {i < a.panel.groups.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-9 bottom-[-10px] left-3 w-px bg-[var(--hza-line)]"
                />
              )}
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(g.key)}
                className="min-h-11 w-full text-left text-[16px] font-semibold"
              >
                {g.label}
              </button>
              {on && (
                <div className="pb-2">
                  <ul className="hza-muted list-disc space-y-1.5 pl-4 text-[14px] leading-relaxed">
                    {g.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <button type="button" className="hza-chip mt-3" onClick={() => onPick(g.starter)}>
                    이 단계 질문 넣기
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** 고소미: 접이식 판 */
function FoldPanel({ a, onPick }: { a: Assistant; onPick: (s: string) => void }) {
  return (
    <aside className="space-y-3" aria-label={a.panel.title}>
      <h2 className="hza-accent-text text-[13px] font-bold tracking-[0.12em]">{a.panel.title}</h2>
      {a.panel.groups.map((g, i) => (
        <details key={g.key} open={i === 0} className="hza-card group px-5 py-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[16px] font-bold">
            {g.label}
            <span
              aria-hidden="true"
              className="hza-accent-text transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <ul className="hza-muted mt-2 space-y-2 text-[14px] leading-relaxed">
            {g.tips.map((t) => (
              <li key={t} className="border-l-2 border-[var(--hza-line)] pl-3">
                {t}
              </li>
            ))}
          </ul>
          <button type="button" className="hza-chip mt-3" onClick={() => onPick(g.starter)}>
            이 내용으로 물어보기
          </button>
        </details>
      ))}
    </aside>
  );
}

/** 중고천국: 할 일 순서 (체크는 이 화면에서만, 저장하지 않는다) */
function TodoStrip({ a, onPick }: { a: Assistant; onPick: (s: string) => void }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  return (
    <section aria-label={a.panel.title}>
      <h2 className="text-[18px] font-black">{a.panel.title}</h2>
      <ol className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {a.panel.groups.map((g, i) => (
          <li key={g.key} className="hza-card flex flex-col p-4">
            <label className="flex min-h-11 items-center gap-2.5 text-[16px] font-black">
              <input
                type="checkbox"
                checked={done[g.key] === true}
                onChange={(e) => setDone((d) => ({ ...d, [g.key]: e.target.checked }))}
                className="size-5 accent-[var(--hza-strong)]"
              />
              <span className={done[g.key] ? "line-through opacity-60" : ""}>
                <span aria-hidden="true" className="hza-accent-text mr-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {g.label}
              </span>
            </label>
            <ul className="hza-muted hza-ticket mt-2 flex-1 space-y-1.5 pt-2 text-[14px] leading-relaxed">
              {g.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <button
              type="button"
              className="hza-chip mt-3 self-start"
              onClick={() => onPick(g.starter)}
            >
              물어보기
            </button>
          </li>
        ))}
      </ol>
      <p className="hza-muted mt-2 text-[12px]">
        체크 표시는 이 화면에서만 보이고 저장하지 않아요.
      </p>
    </section>
  );
}

function Cases({ id }: { id: AssistantId }) {
  const list = casesOf(id);
  return (
    <section className="mt-12" aria-labelledby={`hza-cases-${id}`}>
      <h2 id={`hza-cases-${id}`} className="hza-title font-display text-[26px] font-bold">
        사례로 보기
      </h2>
      <p className="hza-muted mt-1 text-[14px]">
        공개 판례는 법제처 자료를 이름·개인정보 없이 다시 쓴 것이고, 가상 사례는 실제 사건이
        아니에요. 내 사건도 같은 결과가 나온다는 뜻은 아니에요.
      </p>
      <ul className="mt-5 grid gap-5 md:grid-cols-2">
        {list.map((c) => (
          <CaseCard key={c.id} c={c} />
        ))}
      </ul>
    </section>
  );
}

function CaseCard({ c }: { c: AssistantCase }) {
  return (
    <li className="hza-card flex flex-col p-5">
      <p>
        <span className="hza-case-kind" data-kind={c.kind}>
          {c.kind === "precedent" ? PRECEDENT_LABEL : FICTIONAL_LABEL}
        </span>
      </p>
      <h3 className="mt-3 text-[17px] font-bold">{c.title}</h3>
      {c.kind === "precedent" && (
        <p className="hza-muted mt-1 text-[13px]">
          {c.court} {c.decidedAt.replaceAll("-", ".")} 선고 {c.caseNo}
        </p>
      )}
      <div className="mt-3 space-y-1.5 text-[15px] leading-relaxed">
        {c.situation.map((s) => (
          <p key={s}>{s}</p>
        ))}
      </div>
      <p className="mt-3 text-[14px]">
        <span className="hza-accent-text font-bold">쟁점 · </span>
        {c.issue}
      </p>
      {c.kind === "precedent" ? (
        <p className="hza-muted mt-2 text-[14px] leading-relaxed">{c.holding}</p>
      ) : (
        <ol className="hza-muted mt-2 list-decimal space-y-1 pl-5 text-[14px] leading-relaxed">
          {c.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      <div className="hza-ticket mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-4 text-[13px]">
        {c.laws.map((l) => (
          <Link
            key={`${l.lawName}${l.articleNo}`}
            href={`/laws/${encodeURIComponent(l.lawName)}`}
            className="hza-link"
          >
            {l.lawName} {l.articleNo}
          </Link>
        ))}
        {c.kind === "precedent" && (
          <Link href={`/cases/${c.precId}`} className="hza-link font-semibold">
            판례 원문 보기 (법제처)
          </Link>
        )}
      </div>
    </li>
  );
}
