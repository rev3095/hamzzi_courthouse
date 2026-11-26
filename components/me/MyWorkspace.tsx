"use client";
// 로그인한 마이페이지 — 데스크톱 앱처럼 왼쪽 사이드바 + 오른쪽 본문 (DEC-056 ③, 2026-11-25 사용자 요청·선택).
// 사이드바: 새 질문 · 세션 찾기 · 메뉴(내 세션·씨앗·설정·내 기록) · 날짜별 최근 세션(더보기) · 아래 프로필.
// 본문: 고른 메뉴의 내용. 내 세션은 종류 탭 + 한 페이지 10개 + 페이지 번호(components/MySessions).
// 좁은 화면(lg 미만)에서는 사이드바가 서랍으로 접히고 위쪽 '메뉴' 단추로 연다.
// 찾는 말은 이 화면 메모리에만 있고 서버·주소·브라우저 저장소로 보내지 않는다. Figma에 없는 배치라 브랜드 가이드 토큰으로 그렸다.
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  SESSION_KIND_LABEL,
  SIDEBAR_STEP,
  filterSessions,
  groupByDay,
  sessionText,
  type SessionItem,
} from "@/lib/client/sessions";
import { MySessions } from "../MySessions";
import { MySeeds } from "./MySeeds";
import { useMySessions, useOpenSession } from "./useMySessions";
import { PAGE_TITLE } from "@/components/ui/styles";

export type Pane = "sessions" | "seeds" | "settings" | "records";

const PANES: { key: Pane; label: string }[] = [
  { key: "sessions", label: "내 세션" },
  { key: "seeds", label: "씨앗" },
  { key: "settings", label: "설정" },
  { key: "records", label: "내 기록" },
];

export function MyWorkspace({
  profile,
  settings,
  records,
}: {
  /** 사이드바 아래 프로필 (인사·사진·남은 질문·로그아웃) */
  profile: ReactNode;
  settings: ReactNode;
  records: ReactNode;
}) {
  const sessions = useMySessions();
  const [pane, setPane] = useState<Pane>("sessions");
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const searchId = useId();

  // 서랍이 열려 있으면 Esc로 닫는다
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const choose = (p: Pane) => {
    setPane(p);
    setDrawer(false);
  };
  const current = PANES.find((p) => p.key === pane)!;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1" data-testid="my-workspace">
      {drawer && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setDrawer(false)}
          className="bg-ink/40 fixed inset-0 z-40 lg:hidden"
        />
      )}
      <aside
        aria-label="마이페이지 메뉴"
        className={`border-line bg-soft flex-col border-r ${
          drawer ? "fixed inset-y-0 left-0 z-50 flex w-[86%] max-w-[320px] shadow-xl" : "hidden"
        } lg:sticky lg:top-[70px] lg:z-auto lg:flex lg:h-[calc(100dvh-70px)] lg:w-[288px] lg:max-w-none lg:shrink-0 lg:shadow-none`}
      >
        <div className="flex flex-col gap-2 px-3 pt-4">
          <Link
            href="/"
            className="rounded-button bg-ink flex min-h-11 items-center gap-2 px-3.5 text-[15px] font-semibold text-white"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
            새 질문
          </Link>
          <label htmlFor={searchId} className="sr-only">
            세션 찾기
          </label>
          <div className="rounded-button border-line flex min-h-11 items-center gap-2 border bg-white px-3">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPane("sessions");
              }}
              placeholder="세션 찾기"
              autoComplete="off"
              maxLength={60}
              className="text-ink placeholder:text-muted/70 min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            />
          </div>
        </div>

        <nav aria-label="마이페이지" className="mt-3 px-2">
          <ul className="flex flex-col">
            {PANES.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => choose(p.key)}
                  aria-current={pane === p.key ? "page" : undefined}
                  className={`flex min-h-10 w-full items-center rounded-[8px] px-3 text-left text-[14px] ${
                    pane === p.key
                      ? "text-ink bg-white font-semibold shadow-sm"
                      : "text-muted hover:text-ink hover:bg-white/70"
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <SidebarSessions state={sessions} query={query} onOpened={() => setDrawer(false)} />

        <div className="border-line mt-auto border-t px-3 py-3">{profile}</div>
      </aside>

      <div className="min-w-0 flex-1 px-4 py-6 lg:px-10 lg:py-8">
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-expanded={drawer}
            className="rounded-button border-line text-ink flex min-h-11 items-center gap-2 border bg-white px-3.5 text-[14px] font-semibold"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M3 5h12M3 9h12M3 13h12"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            메뉴 · 최근 세션
          </button>
          <span className="text-muted text-[13px]">{current.label}</span>
        </div>

        {pane === "sessions" && (
          <section aria-labelledby="me-history" className="max-w-[820px]">
            <h1 id="me-history" className={PAGE_TITLE}>
              내 세션
            </h1>
            <p className="text-muted mt-1.5 text-[13px] leading-relaxed">
              &lsquo;내 기록에 남기기&rsquo;를 켜고 보낸 질문과 사건 진행의 사건이 최근 것부터
              모여요. 질문은 가린 문장과 답변만 보관하고, 보관 기간이 지나면 지워져요. 예시 질문은
              남지 않아요.
            </p>
            <MySessions state={sessions} query={query} onClearQuery={() => setQuery("")} />
          </section>
        )}
        {pane === "seeds" && (
          <div className="max-w-[640px]">
            <MySeeds />
          </div>
        )}
        {pane === "settings" && <div className="max-w-[640px]">{settings}</div>}
        {pane === "records" && <div className="max-w-[640px]">{records}</div>}
      </div>
    </div>
  );
}

/** 사이드바의 최근 세션: 날짜별로 묶고 처음 SIDEBAR_STEP개, '더보기'로 SIDEBAR_STEP개씩 더 */
function SidebarSessions({
  state,
  query,
  onOpened,
}: {
  state: ReturnType<typeof useMySessions>;
  query: string;
  onOpened: () => void;
}) {
  const open = useOpenSession();
  const [shown, setShown] = useState(SIDEBAR_STEP);
  if (state.kind !== "ready") return <div className="flex-1" />;
  const list = filterSessions(state.items, { query });
  const visible = list.slice(0, shown);
  const groups = groupByDay(visible);
  const rest = list.length - visible.length;

  return (
    <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3" data-testid="sidebar-sessions">
      {list.length === 0 ? (
        <p className="text-muted px-3 py-2 text-[13px]">
          {state.items.length === 0 ? "아직 세션이 없어요." : "맞는 세션이 없어요."}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="mt-2 first:mt-0">
            <p className="text-muted px-3 pt-1 pb-1 text-[12px] font-semibold">{g.label}</p>
            <ul>
              {g.items.map((item: SessionItem) => (
                <li
                  key={item.kind === "question" ? `q:${item.question.id}` : `m:${item.matter.id}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onOpened();
                      open(item);
                    }}
                    title={sessionText(item)}
                    className="text-ink flex min-h-9 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[14px] hover:bg-white/80"
                  >
                    <span className="text-label shrink-0 text-[11px] font-semibold">
                      {SESSION_KIND_LABEL[item.kind]}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{sessionText(item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {rest > 0 ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + SIDEBAR_STEP)}
          className="text-link mt-1 min-h-9 w-full rounded-[8px] px-3 text-left text-[13px] font-semibold hover:bg-white/80"
        >
          더보기 ({rest}개 더)
        </button>
      ) : (
        shown > SIDEBAR_STEP && (
          <button
            type="button"
            onClick={() => setShown(SIDEBAR_STEP)}
            className="text-muted mt-1 min-h-9 w-full rounded-[8px] px-3 text-left text-[13px] hover:bg-white/80"
          >
            접기
          </button>
        )
      )}
    </div>
  );
}
