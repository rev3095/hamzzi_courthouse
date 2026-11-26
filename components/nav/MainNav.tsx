"use client";
// 주 메뉴 5개 (DEC-067, lib/nav/sections): md 이상은 헤더 가운데 글자 메뉴, md 미만은 화면 아래 탭바.
// 현재 위치는 usePathname으로 표시한다 — cacheComponents라 훅은 <Suspense> 안에서만 쓰고, 대기 중에는 표시 없이 그린다.
// Figma 05 '헤더'에는 없는 구성이다(docs/07 'UI·UX 개정' 절에서 승인).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { activeSection, MAIN_NAV, type NavKey } from "@/lib/nav/sections";

const ICONS: Record<NavKey, ReactNode> = {
  consult: (
    <path
      d="M4 5.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-6.5L7 19v-3.5H4A1.5 1.5 0 0 1 2.5 14V7A1.5 1.5 0 0 1 4 5.5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  archive: (
    <>
      <circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M14.5 14.5L19 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  documents: (
    <>
      <path
        d="M6 2.5h7l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8.5 11h5M8.5 14.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  matters: (
    <>
      <rect x="3" y="6.5" width="16" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 14 5v1.5M3 11.5h16"
        stroke="currentColor"
        strokeWidth="2"
      />
    </>
  ),
  community: (
    <>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="15.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M2.5 18.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M14 13.6c2.6-.3 4.8.9 5.5 3.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
};

function NavIcon({ k }: { k: NavKey }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      {ICONS[k]}
    </svg>
  );
}

function TopLinks({ active }: { active: NavKey | null }) {
  return (
    <ul className="flex items-center gap-1">
      {MAIN_NAV.map((s) => {
        const on = s.key === active;
        return (
          <li key={s.key}>
            <Link
              href={s.href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full px-3 text-[15px] font-bold whitespace-nowrap ${
                on ? "bg-ink text-white" : "text-ink hover:bg-cream"
              }`}
            >
              {s.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TopLinksActive() {
  return <TopLinks active={activeSection(usePathname())} />;
}

/** 헤더 가운데 글자 메뉴 (md 이상) */
export function TopNav() {
  return (
    <nav aria-label="주요 메뉴" className="max-md:hidden">
      <Suspense fallback={<TopLinks active={null} />}>
        <TopLinksActive />
      </Suspense>
    </nav>
  );
}

function Tabs({ active }: { active: NavKey | null }) {
  return (
    <ul className="grid grid-cols-5">
      {MAIN_NAV.map((s) => {
        const on = s.key === active;
        return (
          <li key={s.key}>
            <Link
              href={s.href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-bold ${
                on ? "text-ink" : "text-muted"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full ${on ? "bg-cream" : ""}`}
              >
                <NavIcon k={s.key} />
              </span>
              {s.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TabsActive() {
  return <Tabs active={activeSection(usePathname())} />;
}

/** 휴대폰 아래 탭바 (md 미만). 본문이 가려지지 않게 body에 같은 높이의 아래 여백을 둔다(app/globals.css). */
export function BottomTabs() {
  return (
    <nav
      aria-label="주요 메뉴"
      data-testid="bottom-tabs"
      className="border-line bg-bg/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <Suspense fallback={<Tabs active={null} />}>
        <TabsActive />
      </Suspense>
    </nav>
  );
}
