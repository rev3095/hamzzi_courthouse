"use client";
// 결과 패널 (S-04 답변·법령·판례·검증 탭, F-003~F-006). 고정 순서(02 layout-spec):
// AI 고지 → 질문 → 판사 → 의도 요약 → 탭 → 더 찾아본 과정 → 법제처 출처 → 이어 묻기.
// D+의 예상 기간·비용·절차 타임라인·다음 단계(변호사/혼자 진행)는 데모 응답에 없어 넣지 않는다 (절대 규칙 3·5).
import Link from "next/link";
import { useState } from "react";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { HamzziBadge } from "../HamzziJudge";
import { AiNotice, QuestionQuote, SourceCredit } from "./parts";
import {
  TRACE_TOOL,
  dotDate,
  statutePath,
  firstTab,
  resultTitle,
  sourceRef,
  type ResultTab,
} from "./labels";

export function ResultPanel({
  result,
  question,
  followUp,
}: {
  result: DemoAnalysisResult;
  question: string | null;
  followUp: React.ReactNode;
}) {
  const [tab, setTab] = useState<ResultTab>(firstTab(result));
  const searchOnly = result.mode === "search_only";
  const usedArticles = result.articles.filter((a) => a.used).length;
  const usedCases = result.cases.filter((c) => c.used).length;
  const tabs: { key: ResultTab; label: string }[] = [
    { key: "answer", label: "답변" },
    { key: "articles", label: `법령 ${result.articles.length}` },
    { key: "cases", label: `판례 ${result.cases.length}` },
    { key: "verify", label: "검증" },
  ];

  return (
    <article className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
      <AiNotice notice={result.aiNotice} />
      <QuestionQuote text={question} />

      <div className="mt-4 flex items-center gap-3">
        <HamzziBadge size={52} />
        <div>
          <p className="text-ink text-[15px] font-bold">햄찌 판사의 정리</p>
          <p className="text-muted text-[13px]">
            AI 캐릭터 ·{" "}
            {searchOnly
              ? "AI 답변 없이 검색 결과만"
              : `근거 법령 ${usedArticles}건 · 판례 ${usedCases}건 인용`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-[26px] leading-snug font-bold">
          {resultTitle(result)}
        </h1>
        <Link
          href="/"
          className="rounded-button border-line text-ink flex min-h-11 items-center border bg-white px-3.5 text-sm"
        >
          새 질문
        </Link>
      </div>

      {!searchOnly && (
        <dl className="mt-4 grid gap-2 lg:grid-cols-3">
          <IntentCell term="분야" desc={result.intent.area} />
          <IntentCell term="알고 싶은 것" desc={result.intent.goal} />
          <IntentCell term="관련 법률" desc={result.intent.laws.join(" · ")} />
        </dl>
      )}

      <div role="tablist" aria-label="결과" className="border-line mt-7 flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`-mb-px min-h-11 border-b-2 px-3 text-[15px] ${
              tab === t.key ? "border-ink text-ink font-semibold" : "text-muted border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-5">
        {tab === "answer" && <AnswerTab result={result} />}
        {tab === "articles" && <ArticlesTab result={result} />}
        {tab === "cases" && <CasesTab result={result} />}
        {tab === "verify" && <VerifyTab result={result} />}
      </div>

      <Trace result={result} />
      <SourceCredit note={result.searchScopeNote} />
      {followUp}
    </article>
  );
}

function IntentCell({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="rounded-card bg-soft px-4 py-3">
      <dt className="text-muted text-[13px]">{term}</dt>
      <dd className="text-ink mt-0.5 text-[15px] leading-relaxed">{desc || "—"}</dd>
    </div>
  );
}

function OriginalLink({ url, label = "원문 보기 →" }: { url: string | null; label?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

function AnswerTab({ result }: { result: DemoAnalysisResult }) {
  if (result.answer.points.length === 0) {
    return (
      <div className="rounded-card border-note-line bg-note border px-5 py-4">
        <p className="text-ink text-[15px] font-semibold">AI 답변 없이 검색 결과만 보여 드려요</p>
        <p className="text-muted mt-1 text-sm leading-relaxed">
          무료 모드에서는 질문 문장으로 법제처를 검색한 결과만 보여 드려요. 법령·판례 탭에서 항목을
          열어 원문을 확인해 주세요. 미리 분석해 둔 답변은{" "}
          <Link href="/#examples" className="text-link underline">
            예시 질문
          </Link>
          에서 볼 수 있어요.
        </p>
      </div>
    );
  }
  return (
    <ol className="flex flex-col gap-4">
      {result.answer.points.map((p, i) => {
        const ref = sourceRef(p.source, result);
        const ok = p.check === "verified";
        return (
          <li key={i} className="rounded-card border-line border p-5">
            <p className="text-ink text-base leading-[1.75]">{p.text}</p>
            <div className="border-gold-line mt-3 border-l-2 pl-3">
              <p className="text-muted text-[13px]">출처 · {ref.label}</p>
              {p.quote && <p className="text-ink mt-1 text-sm leading-relaxed">“{p.quote}”</p>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-[6px] px-2 py-0.5 text-xs font-semibold ${
                  ok ? "text-success-text bg-success-bg" : "bg-cream text-warn-text"
                }`}
              >
                {ok ? "검증됨" : "확인 필요"}
              </span>
              <OriginalLink url={ref.url} />
            </div>
            {!ok && (
              <p className="text-warn-text mt-1 text-[13px]">
                인용 구절이 조회한 원문과 글자 그대로 같지 않아요. 원문에서 확인해 주세요.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function UsedLabel({ used }: { used: boolean }) {
  return (
    <span
      className={`w-fit rounded-[6px] px-2 py-0.5 text-xs font-semibold ${
        used ? "bg-cream text-label" : "bg-soft text-muted"
      }`}
    >
      {used ? "답변에 사용" : "관련될 수 있음"}
    </span>
  );
}

function ArticlesTab({ result }: { result: DemoAnalysisResult }) {
  if (result.articles.length === 0) return <Empty text="이번 검색에서 찾은 법령 조문이 없어요." />;
  const sorted = [...result.articles].sort((a, b) => Number(b.used) - Number(a.used));
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {sorted.map((a) => (
        <li key={a.id} className="rounded-card border-line flex flex-col gap-1.5 border p-5">
          <UsedLabel used={a.used} />
          <p className="font-display text-ink text-base leading-snug font-bold">
            {a.lawName} {a.articleNo}
            {a.title && ` (${a.title})`}
          </p>
          {a.effectiveFrom && (
            <p className="text-muted text-[13px]">시행 {dotDate(a.effectiveFrom)}</p>
          )}
          <div className="flex flex-wrap gap-4">
            <Link
              href={statutePath(a)}
              className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
            >
              조문 전체 보기 →
            </Link>
            <OriginalLink url={a.sourceUrl} label="법제처 원문 보기 →" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CasesTab({ result }: { result: DemoAnalysisResult }) {
  if (result.cases.length === 0) return <Empty text="이번 검색에서 찾은 판례가 없어요." />;
  const sorted = [...result.cases].sort((a, b) => Number(b.used) - Number(a.used));
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {sorted.map((c) => (
        <li key={c.id} className="rounded-card border-line flex flex-col gap-1.5 border p-5">
          <div className="flex flex-wrap gap-1.5">
            <UsedLabel used={c.used} />
            {c.fromBody && (
              <span className="bg-soft text-muted rounded-[6px] px-2 py-0.5 text-xs">
                판시사항·요지가 없어 본문 일부를 근거로 씀
              </span>
            )}
          </div>
          <p className="font-display text-ink text-base leading-snug font-bold">
            {c.caseName || c.caseNo}
          </p>
          <p className="text-muted text-[13px]">
            {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href={`/cases/${c.id}`}
              className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
            >
              판시사항·요지 보기 →
            </Link>
            <OriginalLink url={c.sourceUrl} label="법제처 원문 보기 →" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function VerifyTab({ result }: { result: DemoAnalysisResult }) {
  const { recheck } = result;
  if (result.answer.points.length === 0) {
    return (
      <p className="text-muted text-[15px] leading-relaxed">
        AI 답변 문단이 없어 검증할 인용이 없어요. 법령·판례 탭의 목록은 법제처 검색 결과 그대로예요.
      </p>
    );
  }
  const mismatched = result.answer.points
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => p.check === "quote_mismatch");
  return (
    <div>
      <p className="text-ink text-[15px] font-semibold">
        {result.mode === "replay"
          ? `예시를 만들 때 인용 ${recheck.items.length}건을 법제처에서 다시 조회했어요`
          : `인용 ${recheck.items.length}건을 법제처에서 다시 조회했어요`}
      </p>
      <p className="text-muted mt-1 text-sm leading-relaxed">
        두 단계로 확인해요. ① 인용 구절이 그때 가져온 원문과 글자 그대로 같은지 ② 조문·사건번호가
        법제처에 실제로 있는지(재조회).
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {recheck.items.map((it) => (
          <li
            key={it.citation}
            className="rounded-card border-line flex flex-wrap items-center justify-between gap-2 border px-4 py-3"
          >
            <span className="text-ink text-[15px]">{it.citation}</span>
            <span className="text-muted flex items-center gap-2 text-[13px]">
              법제처 재조회: {it.exists ? "있음" : "확인 안 됨"}
              <span
                className={`rounded-[6px] px-2 py-0.5 text-xs font-semibold ${
                  it.exists ? "text-success-text bg-success-bg" : "bg-cream text-warn-text"
                }`}
              >
                {it.exists ? "확인됨" : "확인 필요"}
              </span>
            </span>
          </li>
        ))}
        {mismatched.map(({ n }) => (
          <li
            key={`q${n}`}
            className="rounded-card border-line flex flex-wrap items-center justify-between gap-2 border px-4 py-3"
          >
            <span className="text-ink text-[15px]">답변 {n}번째 문단의 인용 구절</span>
            <span className="text-warn-text text-[13px]">
              원문과 글자가 달라요 — 원문에서 확인해 주세요
            </span>
          </li>
        ))}
      </ul>
      {recheck.removed > 0 && (
        <p className="text-muted mt-3 text-sm">
          실제로 있는지 확인되지 않은 인용이 들어간 문단 {recheck.removed}개는 답변에서 뺐어요.
        </p>
      )}
    </div>
  );
}

function Trace({ result }: { result: DemoAnalysisResult }) {
  if (result.trace.length === 0 && result.searches.length === 0) return null;
  return (
    <details className="rounded-card bg-soft mt-8 px-5 py-4">
      <summary className="text-ink min-h-11 cursor-pointer content-center text-[15px] font-semibold">
        {result.trace.length > 0 ? "AI가 더 찾아본 과정" : "검색한 과정"}
      </summary>
      {result.trace.length > 0 && (
        <ol className="text-ink mt-2 flex flex-col gap-2 text-sm leading-relaxed">
          {result.trace.map((t, i) => (
            <li key={i}>
              {t.round}라운드 · {TRACE_TOOL[t.tool] ?? t.tool} “{t.query}” →{" "}
              {t.added.length > 0
                ? `${t.added.map((k) => sourceRef(k, result).label).join(", ")} 추가`
                : "추가 없음"}
            </li>
          ))}
        </ol>
      )}
      {result.searches.length > 0 && (
        <p className="text-muted mt-3 text-[13px] leading-relaxed">
          검색한 키워드: {result.searches.map((s) => `${s.keyword} ${s.total}건`).join(" · ")}
        </p>
      )}
    </details>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted text-[15px]">{text}</p>;
}
