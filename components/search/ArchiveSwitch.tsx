"use client";
// 판례 아카이브 전환 (DEC-054): 검색(/search) ↔ 리서치(/research)를 한 번에 오간다.
// 마지막으로 서버가 받아 준 검색어만 넘긴다 — 검색어는 이미 이 기기(sessionStorage hz:sq)에 있고 주소에는 자료 종류만 싣는다 (F-007).
// 보관함(localStorage hz:pins)은 두 화면이 같은 것을 쓴다.
import Link from "next/link";
import { usePins } from "./recent";
import type { Kind } from "./rows";

type Mode = "search" | "research";

const MODES: { mode: Mode; href: string; label: string; hint: string }[] = [
  { mode: "search", href: "/search", label: "검색", hint: "종류별로 빠르게 찾기" },
  { mode: "research", href: "/research", label: "리서치", hint: "목록 옆 미리보기·보관함" },
];

/** 다른 화면으로 갈 주소. 이번에 찾은 검색어가 있으면 그 화면이 이어서 찾도록 표시만 붙인다 */
export function archiveHref(to: Mode, from: Mode, searched: boolean, kind: Kind) {
  const base = to === "search" ? "/search" : "/research";
  return searched ? `${base}?from=${from}&kind=${kind}` : base;
}

export function ArchiveSwitch({
  current,
  searched,
  kind,
  dark = false,
}: {
  current: Mode;
  /** 이번 화면에서 검색을 마쳤는지 (마친 검색어는 이미 이 기기에 있다) */
  searched: boolean;
  kind: Kind;
  dark?: boolean;
}) {
  const pins = usePins();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <nav
        aria-label="판례 아카이브"
        className={`inline-flex rounded-full border p-1 ${
          dark ? "border-white/25 bg-white/10" : "border-line bg-white"
        }`}
      >
        {MODES.map((m) => {
          const on = m.mode === current;
          return (
            <Link
              key={m.mode}
              href={on ? m.href : archiveHref(m.mode, current, searched, kind)}
              aria-current={on ? "page" : undefined}
              title={m.hint}
              className={`flex min-h-9 items-center rounded-full px-4 text-sm font-semibold ${
                on
                  ? dark
                    ? "text-ink bg-white"
                    : "bg-ink text-white"
                  : dark
                    ? "text-white/85 hover:text-white"
                    : "text-ink hover:bg-cream"
              }`}
            >
              {m.label}
              {!on && searched && <span className="sr-only"> (이 검색어로)</span>}
            </Link>
          );
        })}
      </nav>
      {current === "search" && pins.length > 0 && (
        <Link
          href="/research"
          className="text-link text-sm font-semibold underline-offset-2 hover:underline"
        >
          보관함 {pins.length}건 · 리서치에서 보기 →
        </Link>
      )}
    </div>
  );
}
