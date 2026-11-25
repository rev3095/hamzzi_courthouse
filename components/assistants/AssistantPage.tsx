"use client";
// 분야별 비서 페이지 (F-018, DEC-057). 세 비서는 같은 배치·같은 대화 부품(AssistantChat)을 쓰고 색조만 다르다.
// 화면 구성 (2026-11-26 사용자 요청 — 처음 본 사람이 바로 쓰게, 한눈에 들어오는 양만):
//   머리(이름·한 줄 소개) → 탭(대화하기 | 미리 만든 질답) → 대화(첫 화면의 주된 행동) → 접어 둔 도움말 → 접어 둔 사례
// 도움말·사례는 처음에는 제목만 보이고 눌러서 펼친다. 모두 고정 문안이다 (모델 없음). 사례의 공개 판례는 /cases/{번호}에서 법제처 원문을 연다.
// 아카이브의 '체험하기'는 대화 탭으로 돌아와 그 질문을 보낸다.
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
  const toInput = () =>
    requestAnimationFrame(() =>
      document
        .getElementById(`hza-input-${id}-page`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  const tryQuestion = (q: string) => {
    setTab("chat");
    setAutoSend({ text: q, key: Date.now() });
    toInput();
  };
  const put = (s: string) => {
    setDraft(s);
    document.getElementById(`hza-input-${id}-page`)?.focus({ preventScroll: true });
    toInput();
  };

  return (
    <main data-hza={id} className="hza-root flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[820px] px-4 pt-8 pb-20 lg:pt-12">
        <nav className="hza-muted mb-6 text-[14px]" aria-label="위치">
          <Link href="/assistants" className="hza-link">
            전문 에이전트
          </Link>{" "}
          · {a.name}
        </nav>

        <header className="flex items-center gap-4">
          <AssistantEmblem id={a.id} size={60} />
          <div className="min-w-0">
            <p className="hza-eyebrow">전문 에이전트 · AI</p>
            <h1 className="hza-title font-display mt-1 text-[30px] leading-tight font-bold sm:text-[36px]">
              {a.name}
            </h1>
            <p className="hza-muted mt-1.5 text-[16px] leading-relaxed">{a.subtitle}</p>
            {/* 서비스 이름을 예로 든 비서는 두 탭 모두에서 '관계없음' 안내가 보이게 머리에 둔다 */}
            {a.disclaimer && (
              <p className="hza-muted mt-1.5 text-[13px] leading-relaxed">{a.disclaimer}</p>
            )}
          </div>
        </header>

        <div role="tablist" aria-label={`${a.name} 화면`} className="mt-8 flex gap-2">
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
            미리 만든 질답
          </button>
        </div>

        <div hidden={tab !== "chat"}>
          <section aria-label={`${a.name}와 대화`} className="mt-5">
            <AssistantChat assistant={id} draft={draft} onDraft={setDraft} autoSend={autoSend} />
          </section>
          <Guide a={a} onPick={put} />
          <Cases id={id} />
        </div>
        {tab === "archive" && <ArchiveTab assistant={id} onTry={tryQuestion} />}
      </div>
    </main>
  );
}

/** 도움말: 단계·묶음마다 확인할 것. 처음에는 제목만 보인다 */
function Guide({ a, onPick }: { a: Assistant; onPick: (s: string) => void }) {
  return (
    <section className="mt-14" aria-labelledby={`hza-guide-${a.id}`}>
      <h2 id={`hza-guide-${a.id}`} className="hza-title text-[20px] font-bold">
        {a.panel.title}
      </h2>
      <div className="hza-card mt-4 px-5 py-2 sm:px-6">
        {a.panel.groups.map((g, i) => (
          <details key={g.key} className="hza-fold">
            <summary>
              <span>
                <span aria-hidden="true" className="hza-muted mr-2.5 text-[14px] font-normal">
                  {i + 1}
                </span>
                {g.label}
              </span>
            </summary>
            <div className="pt-1 pb-5">
              <ul className="hza-muted list-disc space-y-2.5 pl-5 text-[15px] leading-[1.75]">
                {g.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <button type="button" className="hza-chip mt-4" onClick={() => onPick(g.starter)}>
                이 내용으로 물어보기
              </button>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function Cases({ id }: { id: AssistantId }) {
  const list = casesOf(id);
  return (
    <section className="mt-14" aria-labelledby={`hza-cases-${id}`}>
      <h2 id={`hza-cases-${id}`} className="hza-title text-[20px] font-bold">
        사례로 보기
      </h2>
      <p className="hza-muted mt-2 text-[14px] leading-[1.75]">
        공개 판례는 법제처 자료를 이름·개인정보 없이 다시 쓴 것이고, 가상 사례는 실제 사건이
        아니에요. 내 사건도 같은 결과가 나온다는 뜻은 아니에요.
      </p>
      <div className="hza-card mt-4 px-5 py-2 sm:px-6">
        {list.map((c) => (
          <CaseFold key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}

function CaseFold({ c }: { c: AssistantCase }) {
  return (
    <details className="hza-fold">
      <summary>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 py-1.5">
          <span className="hza-case-kind shrink-0" data-kind={c.kind}>
            {c.kind === "precedent" ? PRECEDENT_LABEL : FICTIONAL_LABEL}
          </span>
          <span className="leading-snug">{c.title}</span>
        </span>
      </summary>
      <div className="space-y-4 pt-1 pb-6 text-[15px] leading-[1.75]">
        {c.kind === "precedent" && (
          <p className="hza-muted text-[13px]">
            {c.court} {c.decidedAt.replaceAll("-", ".")} 선고 {c.caseNo}
          </p>
        )}
        <div className="space-y-2">
          {c.situation.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
        <div>
          <p className="hza-eyebrow">쟁점</p>
          <p className="mt-1">{c.issue}</p>
        </div>
        {c.kind === "precedent" ? (
          <p className="hza-muted">{c.holding}</p>
        ) : (
          <ol className="hza-muted list-decimal space-y-1.5 pl-5">
            {c.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
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
      </div>
    </details>
  );
}
