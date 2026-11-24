"use client";
// 내 세션 본문 목록 (DEC-039·056, 데스크톱형 배치 ③ 2026-11-25): 종류 탭(전체·질문·사건) → 한 페이지 10개 → 페이지 번호(최대 5개 + ‹ ›).
// 데이터는 마이페이지가 한 번 불러와 사이드바와 함께 쓴다(components/me/useMySessions). 찾는 말은 사이드바 검색창에서 온다.
// 질문은 가린 문장(마스킹본)만 온다. 원문은 어디에도 저장되지 않는다 (DEC-006). 사건은 사건 이름만 보인다.
// 판정·평가 항목은 없다. Figma에 없는 배치라 브랜드 가이드 토큰으로 그렸다.
import { useState } from "react";
import {
  SESSION_KIND_LABEL,
  SESSION_PAGE_SIZE,
  filterSessions,
  pageWindow,
  paginate,
  type SessionItem,
  type SessionKindFilter,
} from "@/lib/client/sessions";
import { useOpenSession, type SessionsState } from "./me/useMySessions";

const STATUS: Record<string, string> = {
  analyzed: "답변 완료",
  failed: "분석 실패",
  draft: "분석 전",
  need_info: "분석 전",
};

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

const TABS: { key: SessionKindFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "question", label: SESSION_KIND_LABEL.question },
  { key: "matter", label: SESSION_KIND_LABEL.matter },
];

export function MySessions({
  state,
  query = "",
  onClearQuery,
}: {
  state: SessionsState;
  /** 사이드바 검색창의 찾는 말 */
  query?: string;
  onClearQuery?: () => void;
}) {
  const open = useOpenSession();
  const [kind, setKind] = useState<SessionKindFilter>("all");
  // 탭·찾는 말이 바뀌면 1쪽으로 돌아간다
  const filterKey = `${kind}|${query}`;
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const goTo = (p: number) => {
    setPaging({ key: filterKey, page: p });
    // 쪽을 바꾸면 목록 맨 위로 (아래쪽 번호를 눌렀을 때 새 쪽의 첫 줄부터 보이게)
    document
      .getElementById("my-sessions-top")
      ?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };

  if (state.kind === "loading") return <p className="text-muted mt-6 text-[15px]">불러오는 중…</p>;
  if (state.kind === "login") {
    return (
      <p className="text-muted mt-6 text-[15px] leading-relaxed">
        로그인하면 남겨 둔 질문과 사건을 다시 볼 수 있어요.
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-warn-text mt-6 text-[15px]">
        세션을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  const counts = {
    all: filterSessions(state.items, { query }).length,
    question: filterSessions(state.items, { kind: "question", query }).length,
    matter: filterSessions(state.items, { kind: "matter", query }).length,
  };
  const filtered = filterSessions(state.items, { kind, query });
  const view = paginate(filtered, page, SESSION_PAGE_SIZE);

  return (
    <>
      {state.mattersFailed && (
        <p role="alert" className="text-warn-text mt-4 text-[13px]">
          사건 목록은 불러오지 못했어요. 사건 진행 화면에서 다시 볼 수 있어요.
        </p>
      )}

      <div
        id="my-sessions-top"
        className="mt-5 flex scroll-mt-24 flex-wrap items-center justify-between gap-3"
      >
        <div role="tablist" aria-label="세션 종류" className="bg-soft flex rounded-full p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={kind === t.key}
              onClick={() => setKind(t.key)}
              className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold ${
                kind === t.key ? "text-ink bg-white shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {t.label} <span className="tabular-nums">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        {query && (
          <p className="text-muted flex items-center gap-1.5 text-[13px]">
            &lsquo;{query}&rsquo; 찾는 중
            {onClearQuery && (
              <button
                type="button"
                onClick={onClearQuery}
                className="text-link min-h-9 px-1 underline-offset-2 hover:underline"
              >
                지우기
              </button>
            )}
          </p>
        )}
      </div>

      {state.items.length === 0 ? (
        <p className="text-muted mt-6 text-[15px] leading-relaxed">
          아직 세션이 없어요. 질문창 아래 &lsquo;내 기록에 남기기&rsquo;를 켜고 물어보거나 사건
          진행에서 사건을 만들면 여기에 모여요.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted mt-6 text-[15px]">맞는 세션이 없어요.</p>
      ) : (
        <>
          <ul
            className="rounded-card border-line divide-line mt-4 divide-y overflow-hidden border bg-white"
            data-testid="my-sessions"
          >
            {view.items.map((item) => (
              <li key={item.kind === "question" ? `q:${item.question.id}` : `m:${item.matter.id}`}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="hover:bg-soft focus-visible:bg-soft flex w-full items-start gap-3 px-4 py-3.5 text-left outline-none"
                >
                  <KindIcon kind={item.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink line-clamp-1 block text-[15px] font-semibold">
                      {item.kind === "question" ? item.question.maskedText : item.matter.title}
                    </span>
                    <span className="text-muted mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                      <span>{SESSION_KIND_LABEL[item.kind]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{dateOf(item.at)}</span>
                      <span aria-hidden="true">·</span>
                      {item.kind === "question" ? (
                        <>
                          <span>{STATUS[item.question.status] ?? item.question.status}</span>
                          {item.question.followup && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>이어 묻기</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span>
                          자료 {item.matter.counts.docs} · 노트 {item.matter.counts.notes}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-link shrink-0 self-center text-[13px] font-semibold">
                    {item.kind === "question" ? "답변 보기" : "사건 열기"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager page={view.page} pages={view.pages} onPage={goTo} />
          <p className="text-muted mt-2 text-center text-[12px] tabular-nums">
            {filtered.length}개 중 {view.from}–{view.to}
          </p>
        </>
      )}
    </>
  );
}

/** 페이지 번호: ‹ 1 2 3 4 5 › (최대 다섯 개, 지금 페이지를 가운데쯤) */
export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const btn =
    "flex size-10 items-center justify-center rounded-full text-[14px] tabular-nums disabled:opacity-35";
  return (
    <nav aria-label="세션 페이지" className="mt-4 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
        className={`${btn} text-ink hover:bg-soft`}
      >
        ‹
      </button>
      {pageWindow(page, pages).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPage(p)}
          aria-current={p === page ? "page" : undefined}
          aria-label={`${p}쪽`}
          className={`${btn} ${p === page ? "bg-ink font-bold text-white" : "text-ink hover:bg-soft"}`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        aria-label="다음 페이지"
        className={`${btn} text-ink hover:bg-soft`}
      >
        ›
      </button>
    </nav>
  );
}

/** 질문 = 말풍선, 사건 = 서류철 (선 아이콘, 브랜드 가이드 3.5) */
export function KindIcon({ kind, size = 18 }: { kind: SessionItem["kind"]; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="bg-cream text-label mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px]"
    >
      {kind === "question" ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path
            d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path
            d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V7.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
