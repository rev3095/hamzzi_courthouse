"use client";
// 결과 패널 (S-04, F-003~F-006, F-014 데모 축소판 DEC-021). 답변 요약형 순서:
// AI 고지 → 질문 → 판사 → 제목 → 답변 먼저(한눈에 보기 + 검증된 답변 문단, 2026-11-24) → 사실 요약(근거 개수·추천 첫 단계 난이도)
// → 절차 타임라인(또는 유형 안내) → "먼저 ○○를 추천드립니다" → 세부 내용(접힘: 의도 요약·법령·판례·검증 탭·더 찾아본 과정)
// → 이어 묻기(심층 질문) → 다음 단계 카드(○○ 바로 가기·심층 질문하기) → 의견 → 법제처 출처.
// 승소·처벌 가능성, 확률 숫자, 예상 기간·비용 숫자는 넣지 않는다 (절대 규칙 2·3, DEC-002).
// 문서 작성은 legal_documents 게이트 뒤라 '바로 가기'는 안내 화면으로 간다 (절대 규칙 5, DEC-022).
import { rememberSearch } from "../search/parts";
import Link from "next/link";
import { useState } from "react";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { CATEGORY_LIST, type CategoryKey } from "@/lib/procedure/categories";
import {
  difficultyLabel,
  evidenceSummary,
  hasTimeline,
  procedurePlan,
  shortcutOf,
  recommendText,
  type ProcedurePlan,
} from "@/lib/procedure/policy";
import { AI_PROCEDURE_NOTE } from "@/lib/procedure/labels";
import { PROCEDURE_NOTICE } from "@/lib/procedure/steps";
import { ANON_QUESTION_LIMIT } from "@/lib/inquiries/policy";
import { HamzziBadge } from "../HamzziJudge";
import { DeepMapView } from "./DeepMapView";
import { AiNotice, QuestionQuote, SourceCredit } from "./parts";
import { ProcedureTimeline } from "./ProcedureTimeline";
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
  footer,
  onAskStep,
  onDeepAsk,
  inquiryId,
  category,
  askHref,
  parties,
}: {
  result: DemoAnalysisResult;
  question: string | null;
  /** 심층 질문(이어 묻기) 입력란 */
  followUp: React.ReactNode;
  /** 의견 보내기 등 */
  footer?: React.ReactNode;
  /** 타임라인 단계의 "이 단계 질문하기" — 이어 묻기 입력란에 문장을 넣는다 */
  onAskStep?: (question: string) => void;
  /** "심층 질문하기" — 이어 묻기 입력란으로 이동 */
  onDeepAsk?: () => void;
  /** 이 결과의 질문 번호 — 문서 작성 안내에 ?from=으로 넘겨 초안 도우미(DEC-023)가 쓴다 */
  inquiryId?: string;
  /** 홈에서 고른 카테고리 (DEC-028). 규칙이 타임라인을 정하지 못할 때만 분류를 돕는다 */
  category?: CategoryKey | null;
  /** 예시 답변 화면(/examples/[id]): 심층 질문 대신 "내 상황으로 질문하기"로 홈에 보낸다 (질문 횟수 차감 없음, DEC-028) */
  askHref?: string;
  /** 서류 분석(F-015)으로 만든 질문의 당사자 카드 */
  parties?: React.ReactNode;
}) {
  const searchOnly = result.mode === "search_only";
  const usedArticles = result.articles.filter((a) => a.used).length;
  const usedCases = result.cases.filter((c) => c.used).length;
  const plan = procedurePlan(result, question, category);

  return (
    <article className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
      <AiNotice notice={result.aiNotice} />
      <QuestionQuote text={question} />

      <div className="mt-4 flex items-center gap-3">
        <HamzziBadge size={52} mood="done" />
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

      <AnswerFirst result={result} />

      <SummaryStrip result={result} plan={plan} />

      {parties}

      {result.deep && <DeepMapView result={result} />}

      {hasTimeline(plan) ? (
        <>
          <ProcedureTimeline
            section={plan.section}
            title={plan.title}
            steps={plan.steps}
            recommendedKey={plan.recommended.key}
            onAskStep={onAskStep}
            inquiryId={inquiryId}
          />
          {plan.note && <p className="text-muted mt-4 text-[13px] leading-relaxed">{plan.note}</p>}
          <div className="rounded-card border-honey-line bg-honey mt-6 px-5 py-4">
            <p className="font-display text-ink text-[17px] leading-snug font-bold">
              {recommendText(plan.recommended)}
            </p>
            <p className="text-muted mt-1 text-sm leading-relaxed">{plan.reason}</p>
            <p className="text-muted mt-1 text-[13px]">
              {plan.byAi
                ? `${result.aiNotice} · ${AI_PROCEDURE_NOTE}`
                : `${PROCEDURE_NOTICE} · 규칙에 따라 고른 안내이며 사건 결과를 판단한 것이 아니에요.`}
            </p>
          </div>
        </>
      ) : (
        <>
          <TypeNotice plan={plan} />
          {(result as { section?: unknown }).section === "none" && <CommunityHint />}
        </>
      )}

      <RelatedSections result={result} />

      <Details result={result} />

      <div id="deep-question">{followUp}</div>
      <NextSteps plan={plan} onDeepAsk={onDeepAsk} inquiryId={inquiryId} askHref={askHref} />
      {footer}
      <SourceCredit note={result.searchScopeNote} />
    </article>
  );
}

/** 문단의 첫 문장 (검증을 통과한 문단에서만 뽑는다 — 새 문장을 만들지 않는다) */
function firstSentence(text: string): string {
  const t = text.trim();
  const m = t.match(/^.+?[.?!](?=\s|$)/);
  return (m ? m[0] : t).trim();
}

/**
 * 답변 먼저 (2026-11-24 사용자 요청): 검증을 통과한 AI 답변을 결과 맨 위에 펼쳐 보인다.
 * 한 문단 요약은 남은 문단들의 첫 문장을 이어 붙인 것이라 모델이 새로 쓴 문장이 아니다 (절대 규칙 1·2·3 그대로).
 * 절차 타임라인·법령·판례는 그 아래·세부 내용에 둔다.
 */
function AnswerFirst({ result }: { result: DemoAnalysisResult }) {
  const points = result.answer.points;
  if (points.length === 0) {
    return (
      <section aria-label="답변" className="mt-5">
        <AnswerTab result={result} />
      </section>
    );
  }
  const summary = points
    .slice(0, 3)
    .map((p) => firstSentence(p.text))
    .join(" ");
  return (
    <section aria-label="답변" className="mt-5">
      <div className="rounded-card border-honey-line bg-honey border px-5 py-4">
        <p className="text-label text-[13px] font-semibold">한눈에 보기</p>
        <p className="text-ink mt-1 text-[17px] leading-[1.75]">{summary}</p>
        <p className="text-muted mt-2 text-[12px]">
          {result.aiNotice} · 아래 답변 문단의 첫 문장을 모은 요약이에요
        </p>
      </div>
      <h2 className="font-display text-ink mt-6 mb-3 text-[19px] font-bold">답변</h2>
      <AnswerTab result={result} />
    </section>
  );
}

/** 결과 머리 사실 요약: 근거 개수 + 추천 첫 단계의 난이도. 확률·가능성은 쓰지 않는다 */
function SummaryStrip({ result, plan }: { result: DemoAnalysisResult; plan: ProcedurePlan }) {
  return (
    <ul aria-label="요약" className="mt-4 flex flex-wrap gap-2">
      <li className="rounded-button bg-soft text-ink px-3 py-1.5 text-sm">
        {evidenceSummary(result)}
      </li>
      {hasTimeline(plan) && (
        <li className="rounded-button bg-cream text-label px-3 py-1.5 text-sm font-semibold">
          추천 첫 단계 · {plan.recommended.label} · {difficultyLabel(plan.recommended)}
        </li>
      )}
    </ul>
  );
}

/** 절차 안내가 맞지 않는 이야기(법 제도 의견·가정해 보는 질문·잡담)는 커뮤니티로 안내한다 (DEC-047) */
function CommunityHint() {
  return (
    <p
      data-testid="community-hint"
      className="rounded-card border-line bg-cream text-ink mt-3 border px-4 py-3 text-[14px] leading-relaxed"
    >
      법과 제도에 대한 의견, 가정해 보는 질문, 가벼운 이야기는 다른 사람들과 나눠 보세요.{" "}
      <Link
        href="/community"
        className="text-link font-semibold underline-offset-2 hover:underline"
      >
        커뮤니티로 가기
      </Link>
    </p>
  );
}

function TypeNotice({ plan }: { plan: Extract<ProcedurePlan, { kind: "notice" }> }) {
  return (
    <section className="rounded-card border-note-line bg-note mt-7 border px-5 py-4">
      <h2 className="text-ink text-[15px] font-semibold">{plan.title}</h2>
      <p className="text-muted mt-1 text-sm leading-relaxed">{plan.body}</p>
      <div className="mt-2 flex flex-wrap gap-x-4">
        {plan.links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
          >
            {l.label} →
          </a>
        ))}
      </div>
    </section>
  );
}

/** 세부 내용 (접힘). 기존 의도 요약·탭·검색 과정을 그대로 쓴다. 검색 전용은 답변이 없어 펼쳐 둔다 */
function Details({ result }: { result: DemoAnalysisResult }) {
  // 답변은 결과 맨 위(AnswerFirst)에 펼쳐 두므로 세부 내용에는 법령·판례·검증만 둔다
  const answerAbove = result.answer.points.length > 0;
  const [tab, setTab] = useState<ResultTab>(answerAbove ? "articles" : firstTab(result));
  const searchOnly = result.mode === "search_only";
  const tabs: { key: ResultTab; label: string }[] = [
    ...(answerAbove ? [] : [{ key: "answer" as const, label: "답변" }]),
    { key: "articles", label: `법령 ${result.articles.length}` },
    { key: "cases", label: `판례 ${result.cases.length}` },
    { key: "verify", label: "검증" },
  ];
  return (
    <details open={searchOnly || undefined} className="group border-line mt-8 border-t pt-2">
      <summary className="text-ink flex min-h-11 cursor-pointer items-center justify-between text-[17px] font-bold">
        <span className="font-display">세부 내용</span>
        <span className="text-muted text-sm font-normal">
          <span className="group-open:hidden">펼치기 ▾</span>
          <span className="hidden group-open:inline">접기 ▴</span>
        </span>
      </summary>

      {!searchOnly && (
        <dl className="mt-3 grid gap-2 lg:grid-cols-3">
          <IntentCell term="분야" desc={result.intent.area} />
          <IntentCell term="알고 싶은 것" desc={result.intent.goal} />
          <IntentCell term="관련 법률" desc={result.intent.laws.join(" · ")} />
        </dl>
      )}

      <div role="tablist" aria-label="결과" className="border-line mt-5 flex gap-1 border-b">
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
    </details>
  );
}

/** 다음 단계 (Figma D+ "다음 단계" 카드). 문서 작성은 게이트 안내 화면, 그 밖에는 그 단계의 공식 창구로 간다 */
function NextSteps({
  plan,
  onDeepAsk,
  inquiryId,
  askHref,
}: {
  plan: ProcedurePlan;
  onDeepAsk?: () => void;
  inquiryId?: string;
  askHref?: string;
}) {
  const go = hasTimeline(plan) ? shortcutOf(plan.recommended) : null;
  const from = inquiryId ? `?from=${encodeURIComponent(inquiryId)}` : "";
  // 먼저 추천한 단계가 소장이 아니어도, 그 타임라인에 소송 단계가 있으면 소장 작성 안내를 함께 보인다
  const complaint =
    hasTimeline(plan) && plan.recommended.document !== "complaint"
      ? plan.steps.find((s) => s.document === "complaint")
      : undefined;
  const cardClass =
    "rounded-card bg-ink flex min-h-[72px] items-center justify-between gap-3 px-5 py-4 text-white";
  const title = hasTimeline(plan) ? `${plan.recommended.label} 바로 가기` : "";
  return (
    <section aria-label="다음 단계" className="mt-4 grid gap-3 lg:grid-cols-2">
      {go?.kind === "document" && (
        <Link href={`${go.href}${from}`} className={cardClass}>
          <span>
            <span className="block text-base font-bold">{title}</span>
            <span className="mt-0.5 block text-[13px] text-white/75">
              작성 요령 · 공식 서식 안내 (서식 작성·내보내기는 법률 검토 후 열려요)
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </Link>
      )}
      {go?.kind === "official" && (
        <a href={go.href} target="_blank" rel="noopener noreferrer" className={cardClass}>
          <span>
            <span className="block text-base font-bold">{title}</span>
            <span className="mt-0.5 block text-[13px] text-white/75">
              {go.label} 공식 사이트로 이동 (새 창)
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">
            ↗
          </span>
        </a>
      )}
      {complaint && (
        <Link
          href={`/documents/complaint${from}`}
          className="rounded-card border-line text-ink flex min-h-[72px] items-center justify-between gap-3 border bg-white px-5 py-4"
        >
          <span>
            <span className="block text-base font-bold">소장 작성 안내</span>
            <span className="text-muted mt-0.5 block text-[13px]">
              작성 요령 · 공식 양식 (초안 도우미는 법률 검토 후 열려요)
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </Link>
      )}
      {/* 예시 화면의 "내 상황으로 질문하기"는 전체 페이지로 연다 — 홈이 주소의 ?category=를 첫 렌더에서 읽게 */}
      {askHref ? (
        <a
          href={askHref}
          className="rounded-card border-line text-ink flex min-h-[72px] items-center justify-between gap-3 border bg-white px-5 py-4"
        >
          <span>
            <span className="block text-base font-bold">내 상황으로 질문하기</span>
            <span className="text-muted mt-0.5 block text-[13px]">
              홈에서 이 분야로 질문을 적어요 · 보낸 질문은 하루 {ANON_QUESTION_LIMIT}번에 세요
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </a>
      ) : (
        <button
          type="button"
          onClick={onDeepAsk}
          className="rounded-card border-line text-ink flex min-h-[72px] items-center justify-between gap-3 border bg-white px-5 py-4 text-left"
        >
          <span>
            <span className="block text-base font-bold">심층 질문하기</span>
            <span className="text-muted mt-0.5 block text-[13px]">
              위 입력란에 이 사건을 더 물어보세요 · 질문 1번으로 세요
            </span>
          </span>
          <span aria-hidden="true" className="text-xl">
            →
          </span>
        </button>
      )}
    </section>
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
          {result.mode === "search_only"
            ? "무료 모드에서는 질문 문장으로 법제처를 검색한 결과만 보여 드려요."
            : "이번 질문은 비용 한도 안에서 근거를 확인한 AI 답변을 만들지 못해 검색 결과만 보여 드려요."}{" "}
          법령·판례 탭에서 항목을 열어 원문을 확인해 주세요. 미리 분석해 둔 답변은{" "}
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
            <Link
              href={`/laws/${encodeURIComponent(a.lawName)}?tab=three-tier`}
              className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
            >
              시행령·연혁 보기 →
            </Link>
            <OriginalLink url={a.sourceUrl} label="법제처 원문 보기 →" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * 이번 분석이 쓴 판례 검색어. 무료는 조문 제목·분야 고정 낱말이고, 라이트는 여기에 질문 해석 호출이 뽑은 법률 용어(DEC-033,
 * 개인정보·조문·사건번호·숫자·단정 표현 검사를 거친 것)가 더해지며, 전체 파이프라인(pro-full)은 모델이 마스킹본에서 뽑은 낱말이다.
 * 질문 문장 자체는 넣지 않고, 리서치 화면에서 검색할 때 서버가 개인정보 검사를 한 번 더 한다 (F-007)
 */
export function researchKeywords(result: DemoAnalysisResult): string[] {
  const words = result.searches
    .map((s) => s.keyword.trim())
    .filter((k) => k && k.length <= 30 && !k.includes("("));
  return [...new Set(words)].slice(0, 4);
}

/** 판례 리서치(/research)로 이어가기. 검색어는 주소에 두지 않고 이 기기에만 건넨다 */
function ResearchLinks({ result }: { result: DemoAnalysisResult }) {
  const keywords = researchKeywords(result);
  return (
    <div className="border-honey-line bg-honey rounded-card mb-4 border px-5 py-4">
      <p className="text-ink text-[15px] font-bold">판례 더 찾아보기</p>
      <p className="text-muted mt-0.5 text-[13px] leading-relaxed">
        판례 리서치 화면에서 요지를 나란히 읽고, 해석례·헌재 결정례까지 넓혀 볼 수 있어요. 검색은
        질문 횟수와 따로 세요.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {keywords.map((k) => (
          <Link
            key={k}
            href="/research?from=result"
            onClick={() => rememberSearch(k)}
            className="border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm"
          >
            {k}
          </Link>
        ))}
        <Link
          href="/research"
          className="text-link flex min-h-11 items-center px-1 text-sm font-semibold underline-offset-2 hover:underline"
        >
          판례 리서치 열기 →
        </Link>
      </div>
    </div>
  );
}

function CasesTab({ result }: { result: DemoAnalysisResult }) {
  if (result.cases.length === 0)
    return (
      <>
        <ResearchLinks result={result} />
        <Empty text="이번 검색에서 찾은 판례가 없어요." />
      </>
    );
  const sorted = [...result.cases].sort((a, b) => Number(b.used) - Number(a.used));
  return (
    <>
      <ResearchLinks result={result} />
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
    </>
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

/**
 * 함께 살펴볼 절차 (DEC-042): 질문 해석이 이 사연에 함께 걸려 있다고 본 다른 절차 섹션.
 * 누르면 그 분야를 고른 채 홈 질문창으로 간다 — 따로 물어야 그 절차의 근거와 타임라인을 받는다.
 * 어느 절차가 유리한지는 말하지 않는다 (절대 규칙 2).
 */
function RelatedSections({ result }: { result: DemoAnalysisResult }) {
  const related = (result.relatedSections ?? [])
    .map((label) => CATEGORY_LIST.find((c) => c.track === label))
    .filter((c) => c !== undefined);
  if (related.length === 0) return null;
  return (
    <section
      aria-labelledby="related-sections-title"
      className="rounded-card border-line mt-6 border px-5 py-4"
    >
      <h2 id="related-sections-title" className="text-ink text-[15px] font-bold">
        함께 살펴볼 절차
      </h2>
      <p className="text-muted mt-1 text-[13px] leading-relaxed">
        {result.aiNotice} · 적어 주신 사연에 다른 절차도 함께 걸려 있을 수 있어요. 위 안내는 가장
        먼저 물으신 문제 기준이에요.
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {related.map((c) => (
          <li key={c.key}>
            <Link
              href={`/?category=${c.key}#ask`}
              className="border-gold-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm font-semibold"
            >
              {c.label} 따로 물어보기
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
