"use client";
// 공통 헤더 (Figma 05 "헤더"): 로고·서비스명·BETA, 판례 검색(F-003, Figma에 없는 메뉴), 남은 질문 n/3.
// 데모는 소셜 로그인을 열지 않아 로그인 버튼을 숨긴다 (무료 모드 유지 결정, 2026-11-01).
// 범위 밖 메뉴(변호사 찾기·혼자 소송하기)와 다크 모드는 데모에서 숨긴다 (docs/07 결정 2).
import Link from "next/link";
import { Suspense } from "react";
import { HamzziFace } from "./HamzziJudge";
import { QuotaRouteSync, useQuota } from "./useQuota";

export function SiteHeader() {
  const quota = useQuota();
  return (
    <header className="border-line bg-bg/95 sticky top-0 z-40 border-b backdrop-blur">
      <Suspense fallback={null}>
        <QuotaRouteSync />
      </Suspense>
      <div className="mx-auto flex h-[65px] max-w-[1120px] items-center justify-between gap-3 px-4 lg:h-[70px]">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="햄찌법원 홈">
          <span className="rounded-card border-honey-line bg-honey flex size-11 items-center justify-center border">
            <HamzziFace size={36} />
          </span>
          <span className="font-display text-ink text-[22px] font-black whitespace-nowrap">
            햄찌법원
          </span>
          <span className="bg-cream text-gold mt-1 rounded-[4px] px-1.5 py-0.5 text-[10px] max-[400px]:hidden">
            BETA
          </span>
        </Link>
        <nav aria-label="주요 메뉴" className="flex items-center gap-2">
          <Link
            href="/search"
            className="text-ink rounded-button flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-sm font-semibold"
          >
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path
                d="M14.5 14.5L19 19"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="max-sm:sr-only">판례 검색</span>
          </Link>
          {quota?.anonymous && quota.remaining !== null && (
            <span className="text-muted text-[13px] whitespace-nowrap" data-testid="quota">
              {`남은 질문 ${quota.remaining}/${quota.limit}`}
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
