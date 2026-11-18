"use client";
// 공통 헤더 (Figma 05 "헤더"): 로고·서비스명·BETA, 판례 검색(F-003, Figma에 없는 메뉴), 오늘 남은 질문 n/한도(DEC-024·031·033) 또는 관리자 · 무제한.
// 로그인 버튼은 헤더에 따로 두지 않고 마이페이지에서 Google로만 로그인한다 (DEC-033).
// 맨 오른쪽 프로필 아이콘 → 마이페이지(/me): Google 로그인·화면 설정 (DEC-032·033). 로그인하면 아이콘에 점 표시.
// 범위 밖 메뉴(변호사 찾기·혼자 소송하기)와 다크 모드는 데모에서 숨긴다 (docs/07 결정 2).
import Link from "next/link";
import { Suspense } from "react";
import { isSignedIn } from "@/lib/client/api";
import { HamzziFace } from "./HamzziJudge";
import { ProfileIcon } from "./me/MyPage";
import { QuotaRouteSync, useQuota } from "./useQuota";

export function SiteHeader() {
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  return (
    <header className="border-line bg-bg/95 sticky top-0 z-40 border-b backdrop-blur">
      <Suspense fallback={null}>
        <QuotaRouteSync />
      </Suspense>
      <div className="mx-auto flex h-[65px] max-w-[1120px] items-center justify-between gap-2 px-4 sm:gap-3 lg:h-[70px]">
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
        <nav aria-label="주요 메뉴" className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/search"
            className="text-ink border-honey-line bg-honey hover:border-gold flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-bold shadow-[0_1px_0_rgba(26,34,51,0.04)]"
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
          {quota?.admin && (
            <span
              className="text-ink text-[13px] font-semibold whitespace-nowrap"
              data-testid="quota"
            >
              관리자 · 무제한
            </span>
          )}
          {quota && !quota.admin && quota.remaining !== null && (
            <span
              className="text-muted text-[12px] whitespace-nowrap sm:text-[13px]"
              data-testid="quota"
            >
              {`오늘 남은 질문 ${quota.remaining}/${quota.limit}`}
            </span>
          )}
          <Link
            href="/me"
            aria-label={signedIn ? "마이페이지 (Google 로그인됨·설정)" : "마이페이지 (로그인·설정)"}
            title="마이페이지"
            className={`text-ink hover:border-gold relative flex size-11 shrink-0 items-center justify-center rounded-full border bg-white ${
              signedIn ? "border-gold" : "border-line"
            }`}
          >
            <ProfileIcon size={20} />
            {signedIn && (
              <span
                aria-hidden="true"
                data-testid="signed-in-dot"
                className="bg-honey absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-white"
              />
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
