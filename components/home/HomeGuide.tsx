"use client";
// 홈 가이드 (S-01, 2026-11-24 사용자 요청). 질문창 아래의 긴 두 목록(카테고리 버튼 DEC-028·034, 예시 답변 피드 DEC-012)을
// '가이드' 토글 하나로 접어 두고, 펼치면 한 상자 안에서 [분야별 질문 틀 | 예시 답변]을 바꿔 본다.
// 왼쪽(좁은 화면은 위쪽 가로 줄) 묶음 탭은 두 보기가 함께 쓴다 — 묶음을 고르면 그 묶음의 분야·예시만 보인다.
// 예시는 /examples/[id] 링크라 질문 생성·분석 API를 부르지 않고 질문 횟수에 세지 않는다 (DEC-027·028).
// 다른 화면의 "/#examples" 링크로 오면 예시 답변 보기로 펼쳐진다. 이모지·색 아이콘은 쓰지 않는다 (브랜드 가이드 3.5).
import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  CATEGORY_LIST,
  groupOf,
  type CategoryKey,
} from "@/lib/procedure/categories";

export type GuideExample = { id: string; question: string; area: string; href: string };
type Mode = "categories" | "examples";

const OTHER_GROUP = "other";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = () => window.location.hash;

/**
 * 묶음마다 [예시, 그 예시의 분야 이름]을 묶음 안 분야 순서대로. 어느 분야에도 없는 예시는 '그 밖' 묶음으로 모은다
 */
export function groupExamples(examples: GuideExample[]) {
  const byGroup = new Map<string, { example: GuideExample; label: string; order: number }[]>();
  for (const e of examples) {
    const cat = CATEGORY_LIST.find((c) => c.examples.includes(e.id));
    const key = cat ? groupOf(cat.key) : OTHER_GROUP;
    const keys = CATEGORY_GROUPS.find((g) => g.key === key)?.keys ?? [];
    const order = cat ? keys.indexOf(cat.key) : 0;
    const list = byGroup.get(key) ?? [];
    list.push({ example: e, label: cat?.label ?? e.area, order });
    byGroup.set(key, list);
  }
  // 같은 분야끼리 모이게 (Array.prototype.sort는 안정 정렬이라 분야 안 순서는 예시 순서 그대로)
  for (const list of byGroup.values()) list.sort((a, b) => a.order - b.order);
  return byGroup;
}

export function HomeGuide({
  examples,
  selected,
  onPick,
}: {
  examples: GuideExample[];
  selected: CategoryKey | null;
  onPick: (key: CategoryKey) => void;
}) {
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");
  const fromLink = hash === "#examples";
  // undefined = 아직 누르지 않음 (주소의 #examples를 따른다)
  const [openState, setOpen] = useState<boolean | undefined>(undefined);
  const [modeState, setMode] = useState<Mode | undefined>(undefined);
  const [groupState, setGroup] = useState<string | null>(null);
  const open = openState ?? fromLink;
  const mode = modeState ?? (fromLink ? "examples" : "categories");

  const byGroup = useMemo(() => groupExamples(examples), [examples]);
  const groups = useMemo(() => {
    const list = CATEGORY_GROUPS.map((g) => ({ key: g.key, label: g.label, keys: g.keys }));
    if (byGroup.has(OTHER_GROUP)) list.push({ key: OTHER_GROUP, label: "그 밖", keys: [] });
    return list;
  }, [byGroup]);
  // 질문 틀 보기에는 분야가 없는 '그 밖' 묶음을 빼고, 예시 보기에는 예시가 없는 묶음을 뺀다
  const visible = groups.filter((g) =>
    mode === "categories" ? g.keys.length > 0 : (byGroup.get(g.key)?.length ?? 0) > 0,
  );
  const fallback = selected ? groupOf(selected) : visible[0]?.key;
  const group =
    visible.find((g) => g.key === groupState) ??
    visible.find((g) => g.key === fallback) ??
    visible[0];
  const countOf = (key: string, keys: CategoryKey[]) =>
    mode === "categories" ? keys.length : (byGroup.get(key)?.length ?? 0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onRailKey = (e: React.KeyboardEvent) => {
    const i = visible.findIndex((g) => g.key === group.key);
    const last = visible.length - 1;
    const next =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % visible.length
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i - 1 + visible.length) % visible.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setGroup(visible[next].key);
    tabs.current[next]?.focus();
  };

  return (
    <section
      id="examples"
      aria-labelledby="home-guide-title"
      className="w-full max-w-[1120px] scroll-mt-24 text-left"
    >
      <h2 id="home-guide-title" className="sr-only">
        가이드
      </h2>
      <div className="flex justify-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="home-guide-panel"
          onClick={() => setOpen(!open)}
          className={`group flex min-h-11 items-center gap-2.5 rounded-full border px-4 text-sm transition-colors ${
            open
              ? "border-ink bg-ink text-white"
              : "border-line text-ink hover:border-gold bg-white"
          }`}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2.5 3.2c1.9-.6 3.8-.4 5.5.8v9c-1.7-1.2-3.6-1.4-5.5-.8v-9zM13.5 3.2c-1.9-.6-3.8-.4-5.5.8v9c1.7-1.2 3.6-1.4 5.5-.8v-9z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-bold">가이드</span>
          <span className={`hidden sm:inline ${open ? "text-white/75" : "text-muted"}`}>
            분야별 질문 틀 · 예시 답변
          </span>
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {open && group && (
        <div
          id="home-guide-panel"
          className="rounded-panel border-line mt-4 overflow-hidden border bg-white shadow-[0_6px_24px_rgba(43,35,25,0.06)]"
        >
          {/* 머리: 보기 바꾸기 · 설명 · 접기 */}
          <div className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 lg:px-5">
            <div
              role="group"
              aria-label="가이드 보기"
              className="bg-cream flex rounded-full p-1 text-[14px]"
            >
              {(
                [
                  ["categories", "분야별 질문 틀", CATEGORY_LIST.length],
                  ["examples", "예시 답변", examples.length],
                ] as const
              ).map(([key, label, n]) => {
                const on = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMode(key)}
                    className={`flex min-h-9 items-center gap-1.5 rounded-full px-3.5 font-bold transition-colors ${
                      on ? "text-ink bg-white shadow-[0_1px_3px_rgba(43,35,25,0.12)]" : "text-muted"
                    }`}
                  >
                    {label}
                    <span className={`text-[12px] font-semibold ${on ? "text-gold" : ""}`}>
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-muted order-last min-w-0 basis-full text-[13px] sm:order-none sm:flex-1 sm:basis-0">
              {mode === "categories"
                ? "분야를 고르면 질문창 위에 질문 틀과 문장 시작이 나와요."
                : "직접 작성한 가상 사연이에요 · 질문 횟수에 포함되지 않아요."}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted hover:text-ink ml-auto min-h-11 px-1 text-[13px] underline-offset-2 hover:underline"
            >
              접기
            </button>
          </div>

          <div className="lg:grid lg:grid-cols-[208px_1fr]">
            {/* 묶음 탭: 넓은 화면은 왼쪽 세로 목록, 좁은 화면은 가로로 밀어 보는 줄 */}
            <div
              role="tablist"
              aria-label="분야 묶음"
              onKeyDown={onRailKey}
              className="border-line flex [scrollbar-width:none] gap-2 overflow-x-auto border-b px-4 py-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-r lg:border-b-0 lg:px-3 lg:py-4"
            >
              {visible.map((g, i) => {
                const on = g.key === group.key;
                return (
                  <button
                    key={g.key}
                    ref={(el) => {
                      tabs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`guide-tab-${g.key}`}
                    aria-selected={on}
                    aria-controls="guide-tabpanel"
                    tabIndex={on ? 0 : -1}
                    onClick={() => setGroup(g.key)}
                    className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] whitespace-nowrap transition-colors lg:w-full lg:justify-between lg:rounded-[10px] lg:border-transparent lg:px-3 ${
                      on
                        ? "border-ink bg-ink lg:bg-cream lg:text-ink font-bold text-white"
                        : "border-line text-ink hover:border-gold lg:hover:bg-bg bg-white lg:hover:border-transparent"
                    }`}
                  >
                    <span>{g.label}</span>
                    <span
                      className={`text-[12px] ${on ? "lg:text-gold text-white/80" : "text-muted"}`}
                    >
                      {countOf(g.key, g.keys)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              id="guide-tabpanel"
              role="tabpanel"
              aria-labelledby={`guide-tab-${group.key}`}
              className="p-3 lg:p-4"
            >
              {mode === "categories" ? (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {group.keys.map((key) => {
                    const c = CATEGORIES[key];
                    const on = key === selected;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => onPick(key)}
                          className={`flex min-h-[60px] w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors ${
                            on
                              ? "border-ink bg-cream"
                              : "hover:border-line hover:bg-bg border-transparent"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="text-ink block text-[15px] font-bold">{c.label}</span>
                            <span className="text-muted mt-0.5 block truncate text-[13px]">
                              {c.description}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`shrink-0 text-[12px] font-semibold ${on ? "text-gold" : "text-link"}`}
                          >
                            {on ? "선택됨" : "질문 틀 →"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="grid gap-1.5 lg:grid-cols-2">
                  {(byGroup.get(group.key) ?? []).map(({ example: e, label }) => (
                    <li key={e.id}>
                      <Link
                        href={e.href}
                        aria-label={`예시 답변 보기: ${e.question}`}
                        className="hover:border-line hover:bg-bg flex min-h-[60px] items-center gap-3 rounded-[10px] border border-transparent px-3.5 py-3 transition-colors"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="text-label block text-[12px] font-semibold">
                            {label}
                          </span>
                          <span className="text-ink mt-0.5 line-clamp-2 text-[14px] leading-relaxed">
                            {e.question}
                          </span>
                        </span>
                        <span aria-hidden="true" className="text-link shrink-0 text-sm">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
