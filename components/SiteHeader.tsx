"use client";
// 공통 헤더 (Figma 05 "헤더"): 로고·서비스명·BETA, 판례 아카이브(F-003, DEC-054 — 누르면 검색·리서치 선택, Figma에 없는 메뉴), 오늘 남은 질문 n/한도(DEC-024·031·033) 또는 관리자 · 무제한.
// 커뮤니티(DEC-047, Figma에 없는 메뉴): 게시판으로 가는 말풍선 버튼. 좁은 화면에서는 버튼 대신 메뉴 아이콘 안에 둔다(DEC-051, 가로 넘침 방지).
// 사건 진행(F-016·DEC-053, Figma에 없는 메뉴): 판례 검색 바로 옆, 흑백 버튼 — 로그인 전용 사건 정리 도구로 간다.
// 서류 분석(F-015·DEC-052, Figma에 없는 메뉴): 서류 사진을 올려 분석하는 화면으로 가는 버튼.
// 로그인 버튼은 헤더에 따로 두지 않고 마이페이지에서 Google로만 로그인한다 (DEC-035).
// 메뉴 아이콘(DEC-051, Figma에 없는 메뉴): 소개·기능 가이드·향후 계획·개발자·문의 (components/about/AboutMenu).
// 맨 오른쪽 프로필 아이콘 → 마이페이지(/me): Google 로그인·화면 설정 (DEC-032·033). 로그인하면 아이콘에 점 표시.
// 범위 밖 메뉴(변호사 찾기·혼자 소송하기)와 다크 모드는 데모에서 숨긴다 (docs/07 결정 2).
import Link from "next/link";
import { Suspense } from "react";
import { isSignedIn } from "@/lib/client/api";
import { AboutMenu } from "./about/AboutMenu";
import { ArchiveMenu } from "./search/ArchiveMenu";
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
          <ArchiveMenu />
          <Link
            href="/matters"
            className="bg-ink hover:bg-ink/90 flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-white"
          >
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <rect
                x="3"
                y="6.5"
                width="16"
                height="11.5"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M8 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 14 5v1.5M3 11.5h16"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <span className="max-md:sr-only">사건 진행</span>
          </Link>
          <Link
            href="/casefile"
            className="text-ink border-line hover:border-gold flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border bg-white px-3 text-sm font-bold max-[480px]:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path
                d="M6 2.5h7l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M8.5 11h5M8.5 14.5h5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="max-md:sr-only">서류 분석</span>
          </Link>
          <Link
            href="/community"
            className="text-ink border-line hover:border-gold flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border bg-white px-3 text-sm font-bold max-sm:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path
                d="M4 5.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-6.5L7 19v-3.5H4A1.5 1.5 0 0 1 2.5 14V7A1.5 1.5 0 0 1 4 5.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-sm:sr-only">커뮤니티</span>
          </Link>
          <AboutMenu />
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
              <span className="max-[480px]:sr-only">오늘 남은 질문 </span>
              {`${quota.remaining}/${quota.limit}`}
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
