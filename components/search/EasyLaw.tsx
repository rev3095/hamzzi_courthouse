"use client";
// 법령 쉬운 설명 (DEC-074): /laws/[name]의 기본 탭. 법령을 처음 읽는 사람이 원문 벽을 먼저 만나지 않게,
// 쉬운 설명을 위에 두고 원문은 필요한 사람만 펼쳐 본다.
// 쉬운 문장은 서버가 조문 원문으로 거른 것만 온다. 실제 판례는 법제처 검색 결과뿐이고, AI가 만든 사례는
// '가상 사례'로 모양·꼬리표를 달리해 보인다. 유불리·가능성 판단은 없다 (절대 규칙 2).
import Link from "next/link";
import { useId, useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { statuteIdOf } from "@/lib/search/browse";
import {
  EASY_FALLBACK_NOTE,
  EASY_FOREIGN_NOTE,
  EASY_FOREIGN_TITLE,
  EASY_REAL_CASES_ENOUGH,
  EASY_VIRTUAL_TAG,
  type EasyArticle,
  type EasyLawView,
} from "@/lib/search/easy/types";
import { dotDate } from "../result/labels";

const compact = (s: string) => s.replace(/\s+/g, "");
const CARD = "rounded-card border-line border bg-white p-5 lg:p-6";
const CARD_TITLE = "font-display text-ink text-[20px] leading-snug font-bold";
const BODY_TEXT = "text-ink text-[17px] leading-relaxed";
const SMALL_BUTTON =
  "border-line text-ink hover:border-gold inline-flex min-h-11 items-center rounded-full border bg-white px-4 text-[15px]";

/** 불러오는 동안: 뼈대 + 한 줄 안내 */
export function EasySkeleton() {
  return (
    <div className="mt-6" aria-live="polite" aria-busy="true">
      <p className="text-ink text-[17px] font-semibold">법령을 쉬운 말로 풀고 있어요…</p>
      <p className="text-muted mt-1 text-[15px]">조문이 많은 법령은 조금 더 걸릴 수 있어요.</p>
      <div className="mt-5 grid gap-4" aria-hidden="true">
        {[72, 56, 120].map((h, i) => (
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

/**
 * 조문 목록 — 조문마다 번호·제목만 보이고 누르면 본문이 펼쳐진다. 원문 벽을 만들지 않으려고 모두 접힌 채로 시작한다.
 * active는 옆 판례 패널이 따라가는 조문(원문·판례 탭), onOpen은 조문을 펼쳤을 때 알린다.
 */
export function ArticleFolds({
  lawName,
  articles,
  active = null,
  onOpen,
  listRef,
}: {
  lawName: string;
  articles: EasyArticle[];
  active?: string | null;
  onOpen?: (articleNo: string) => void;
  listRef?: React.Ref<HTMLDivElement>;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const base = useId();
  const toggle = (no: string) => {
    const next = new Set(open);
    if (next.has(no)) next.delete(no);
    else {
      next.add(no);
      onOpen?.(no);
    }
    setOpen(next);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted mr-auto text-[15px]">
          조문 {articles.length}개 · 조문을 누르면 원문이 펼쳐져요.
        </p>
        <button
          type="button"
          className={SMALL_BUTTON}
          onClick={() => setOpen(new Set(articles.map((a) => a.articleNo)))}
        >
          모두 펼치기
        </button>
        <button type="button" className={SMALL_BUTTON} onClick={() => setOpen(new Set())}>
          모두 접기
        </button>
      </div>
      <div ref={listRef} className="mt-3 grid gap-2">
        {articles.map((a, i) => {
          const isOpen = open.has(a.articleNo);
          const panel = `${base}-a${i}`;
          return (
            <section
              key={a.articleNo}
              data-article={a.articleNo}
              className={`scroll-mt-24 rounded-[10px] border bg-white ${
                a.articleNo === active ? "border-gold" : "border-line"
              }`}
            >
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => toggle(a.articleNo)}
                  className="text-ink flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-[16px]"
                >
                  <span aria-hidden="true" className="text-muted w-4 shrink-0">
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="shrink-0 font-bold">{a.articleNo}</span>
                  {a.title && <span>{a.title}</span>}
                </button>
              </h3>
              {isOpen && (
                <div id={panel} className="px-4 pb-4">
                  <p className="text-ink text-[16px] leading-[1.9] whitespace-pre-line">{a.text}</p>
                  <Link
                    href={`/statutes/${encodeURIComponent(statuteIdOf(lawName, a.articleNo))}`}
                    className="text-link mt-2 inline-flex min-h-11 items-center text-[15px] underline-offset-2 hover:underline"
                  >
                    이 조문 자세히 보기 →
                  </Link>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** "근거: 제○조 원문 보기" — 누르면 그 조문 원문이 그 자리에서 펼쳐진다 (이미 받아 둔 조문에서 찾는다) */
function SourceToggle({
  articleNo,
  articles,
}: {
  articleNo: string | null;
  articles: EasyArticle[];
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const article = articleNo
    ? articles.find((a) => compact(a.articleNo) === compact(articleNo))
    : undefined;
  if (!article) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
        className={SMALL_BUTTON}
      >
        근거: {article.articleNo} {open ? "원문 접기" : "원문 보기"}
      </button>
      {open && (
        <div id={panel} className="bg-soft mt-2 rounded-[10px] p-4">
          <p className="text-muted text-[14px] font-semibold">
            법령 원문 · {article.articleNo}
            {article.title && ` (${article.title})`}
          </p>
          <p className="text-ink mt-1 text-[16px] leading-[1.9] whitespace-pre-line">
            {article.text}
          </p>
        </div>
      )}
    </div>
  );
}

export function EasyLawBody({
  d,
  onShowOriginalTab,
}: {
  d: EasyLawView;
  /** '원문·판례' 탭으로 옮긴다 */
  onShowOriginalTab?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const allPanel = useId();
  const { easy, articles, realCases } = d;
  // 가상 사례는 실제 판례가 모자랄 때만 보인다
  const virtual =
    !d.realCasesFailed && realCases.length < EASY_REAL_CASES_ENOUGH ? easy.virtualCases : [];
  const foreign = d.foreignRecords ?? [];
  if (articles.length === 0)
    return <p className="text-muted mt-4 text-[16px]">법제처에서 조문을 찾지 못했어요.</p>;
  return (
    <div className="mt-4 grid gap-5">
      {!d.ai.used && <p className="text-muted text-[15px] leading-relaxed">{EASY_FALLBACK_NOTE}</p>}
      {d.sourceNote && <p className="text-muted text-[15px] leading-relaxed">{d.sourceNote}</p>}

      {easy.summary.length > 0 && (
        <section
          className="rounded-card border-honey-line bg-honey border p-5 lg:p-6"
          aria-labelledby="easy-summary"
        >
          <h2 id="easy-summary" className={CARD_TITLE}>
            한눈에 보기
          </h2>
          <div className="mt-3 grid gap-2">
            {easy.summary.map((s, i) => (
              <p key={i} className={BODY_TEXT}>
                {s}
              </p>
            ))}
          </div>
        </section>
      )}

      {easy.who.length > 0 && (
        <section className={CARD} aria-labelledby="easy-who">
          <h2 id="easy-who" className={CARD_TITLE}>
            누구에게 해당하나요
          </h2>
          <ul className="mt-3 grid list-disc gap-2 pl-5">
            {easy.who.map((s, i) => (
              <li key={i} className={BODY_TEXT}>
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {easy.keyPoints.length > 0 && (
        <section aria-labelledby="easy-points">
          <h2 id="easy-points" className={CARD_TITLE}>
            핵심 내용
          </h2>
          <ol className="mt-3 grid gap-3">
            {easy.keyPoints.map((k, i) => (
              <li key={i} className={CARD}>
                <p className="text-ink flex items-start gap-3 text-[18px] leading-snug font-bold">
                  <span
                    aria-hidden="true"
                    className="bg-cream text-label flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px]"
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{k.title}</span>
                </p>
                <p className={`${BODY_TEXT} mt-2`}>{k.body}</p>
                <SourceToggle articleNo={k.articleNo} articles={articles} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {easy.issues.length > 0 && (
        <section className={CARD} aria-labelledby="easy-issues">
          <h2 id="easy-issues" className={CARD_TITLE}>
            자주 문제 되는 쟁점
          </h2>
          <ul className="mt-3 grid gap-4">
            {easy.issues.map((q, i) => (
              <li key={i}>
                <p className={BODY_TEXT}>
                  <span aria-hidden="true" className="text-gold mr-2 font-bold">
                    Q
                  </span>
                  {q.question}
                </p>
                <SourceToggle articleNo={q.articleNo} articles={articles} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={CARD} aria-labelledby="easy-cases">
        <h2 id="easy-cases" className={CARD_TITLE}>
          실제 판례
        </h2>
        <p className="text-muted mt-2 text-[15px] font-semibold">법제처에서 찾은 판례</p>
        {d.realCasesFailed ? (
          <p role="status" className="text-muted mt-2 text-[16px] leading-relaxed">
            지금 판례를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.
          </p>
        ) : realCases.length === 0 ? (
          <p className="text-muted mt-2 text-[16px] leading-relaxed">
            법제처에서 이 법령 이름으로 찾은 판례가 없어요.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {realCases.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cases/${c.id}`}
                  className="border-line hover:border-gold flex min-h-11 flex-col justify-center rounded-[10px] border bg-white px-4 py-3"
                >
                  <span className="text-ink text-[16px] font-semibold">
                    {c.caseName || c.caseNo}
                  </span>
                  <span className="text-muted text-[14px]">
                    {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {realCases.length > 0 && (
          <p className="text-muted mt-2 text-[14px] leading-relaxed">
            법령 이름이 판결에 나오는 판례를 찾은 것이라 관련이 적은 판례가 섞일 수 있어요.
          </p>
        )}
      </section>

      {foreign.length > 0 && (
        <section className={CARD} aria-labelledby="easy-foreign" data-testid="easy-foreign">
          <h2 id="easy-foreign" className={CARD_TITLE}>
            {EASY_FOREIGN_TITLE}
          </h2>
          <p className="text-muted mt-2 text-[15px] leading-relaxed">{EASY_FOREIGN_NOTE}</p>
          <ul className="mt-3 grid gap-2">
            {foreign.map((r) => (
              <li key={r.id} className="border-line rounded-[10px] border bg-white px-4 py-3">
                <p lang="en" className="text-ink text-[16px] leading-snug font-semibold">
                  {r.title}
                </p>
                <p lang="en" className="text-ink mt-1 text-[15px] leading-relaxed">
                  {r.summary}
                </p>
                <p className="text-muted mt-1 text-[13px]">
                  {[r.kind, dotDate(r.date ?? null), r.source].filter(Boolean).join(" · ")}
                </p>
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link inline-flex min-h-11 items-center text-[15px] font-semibold underline-offset-2 hover:underline"
                >
                  공식 기록 보기 ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {virtual.length > 0 && (
        <section
          className="border-gold-line bg-soft rounded-card border-2 border-dashed p-5 lg:p-6"
          aria-labelledby="easy-virtual"
          data-testid="easy-virtual"
        >
          <h2 id="easy-virtual" className={CARD_TITLE}>
            이해를 돕는 가상 사례 (AI가 만듦)
          </h2>
          {d.virtualNotice && (
            <p className="text-ink mt-2 text-[15px] leading-relaxed font-semibold">
              {d.virtualNotice}
            </p>
          )}
          <ul className="mt-3 grid gap-3">
            {virtual.map((v, i) => (
              <li
                key={i}
                className="border-gold-line rounded-[10px] border border-dashed bg-white p-4"
              >
                <p className="bg-cream text-label w-fit rounded-[6px] px-2 py-0.5 text-[13px] font-semibold">
                  {EASY_VIRTUAL_TAG}
                </p>
                <h3 className="text-ink mt-2 text-[17px] font-bold">{v.title}</h3>
                <p className="text-muted mt-2 text-[14px] font-semibold">이런 상황이라면</p>
                <p className={BODY_TEXT}>{v.situation}</p>
                <p className="text-muted mt-2 text-[14px] font-semibold">
                  이 법은 이렇게 정하고 있어요
                </p>
                <p className={BODY_TEXT}>{v.lawSays}</p>
                <SourceToggle articleNo={v.articleNo} articles={articles} />
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 text-[13px]">{AI_NOTICE}</p>
        </section>
      )}

      <section className={CARD} aria-labelledby="easy-original">
        <h2 id="easy-original" className={CARD_TITLE}>
          원문 전체 보기
        </h2>
        <p className="text-muted mt-2 text-[15px] leading-relaxed">
          법령 원문이 필요할 때만 펼쳐 보세요. 조문은 번호와 제목만 먼저 보여요.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls={allPanel}
            onClick={() => setShowAll(!showAll)}
            className={`${SMALL_BUTTON} font-semibold`}
          >
            {showAll ? "원문 접기" : "원문 펼치기"}
          </button>
          {onShowOriginalTab && (
            <button type="button" onClick={onShowOriginalTab} className={SMALL_BUTTON}>
              조문별 판례와 함께 보기
            </button>
          )}
        </div>
        {showAll && (
          <div id={allPanel} className="mt-4">
            <ArticleFolds lawName={d.lawName} articles={articles} />
          </div>
        )}
      </section>
    </div>
  );
}
