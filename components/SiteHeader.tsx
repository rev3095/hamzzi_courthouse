"use client";
// 공통 헤더 (Figma 05 "헤더"를 DEC-067로 바꿈): 로고·서비스명·BETA | 주 메뉴 5개(md 이상, components/nav/MainNav) | 오늘 남은 질문 n/한도(DEC-024·031·033) 또는 관리자 · 무제한, 메뉴 아이콘, 프로필.
// 주 메뉴 = 상담 · 판례·법령 · 문서 작성 · 사건(진행·정리) · 광장. md 미만은 같은 목록을 화면 아래 탭바(BottomTabs)로 보인다.
// 예전 헤더 버튼(판례 아카이브·사건 진행·서류 분석·커뮤니티)은 이 메뉴로 옮겼다. 서류 분석은 상담(홈 질문창 자료 올리기)과 문서 작성 화면에서 연다.
// 로그인 버튼은 헤더에 따로 두지 않고 마이페이지에서 Google로만 로그인한다 (DEC-035).
// 메뉴 아이콘(DEC-051): 소개·기능 가이드·향후 계획·개발자·문의 (components/about/AboutMenu).
// 맨 왼쪽 내 세션 단추(DEC-070): 왼쪽 서랍으로 대화·사건 세션 목록을 연다 (components/sessions/SessionDrawer).
// 맨 오른쪽 프로필 아이콘 → 마이페이지(/me): Google 로그인·내 세션·설정 (DEC-032·033·056). 로그인하면 아이콘에 점 표시.
import Link from "next/link";
import { Suspense, useState } from "react";
import { isSignedIn } from "@/lib/client/api";
import { AboutMenu } from "./about/AboutMenu";
import { HamzziFace } from "./HamzziJudge";
import { ProfileIcon } from "./me/MyPage";
import { BottomTabs, TopNav } from "./nav/MainNav";
import { SessionDrawer } from "./sessions/SessionDrawer";
import { QuotaRouteSync, useQuota } from "./useQuota";

export function SiteHeader() {
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  const [sessions, setSessions] = useState(false);
  return (
    <>
      <header className="border-line bg-bg/95 sticky top-0 z-40 border-b backdrop-blur">
        <Suspense fallback={null}>
          <QuotaRouteSync />
        </Suspense>
        <div className="mx-auto flex h-[65px] max-w-[1120px] items-center justify-between gap-2 px-4 sm:gap-3 lg:h-[70px]">
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSessions(true)}
              aria-label="내 세션 열기"
              aria-expanded={sessions}
              title="내 세션"
              data-testid="sessions-button"
              className="text-ink hover:bg-cream flex size-11 shrink-0 items-center justify-center rounded-[8px]"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <rect
                  x="2.5"
                  y="3.5"
                  width="17"
                  height="15"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path d="M8 3.5v15" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="햄찌법원 홈">
              <span className="rounded-card border-honey-line bg-honey flex size-11 items-center justify-center border">
                <HamzziFace size={36} />
              </span>
              <span className="font-display text-ink text-[22px] font-black whitespace-nowrap">
                햄찌법원
              </span>
              <span className="bg-cream text-gold mt-1 rounded-[4px] px-1.5 py-0.5 text-[10px] max-[400px]:hidden md:max-lg:hidden">
                BETA
              </span>
            </Link>
          </div>
          <TopNav />
          <div className="flex items-center gap-1.5 sm:gap-2">
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
                <span className="max-[480px]:sr-only md:max-lg:sr-only">오늘 남은 질문 </span>
                {`${quota.remaining}/${quota.limit}`}
              </span>
            )}
            <AboutMenu />
            <Link
              href="/me"
              aria-label={
                signedIn ? "마이페이지 (Google 로그인됨·설정)" : "마이페이지 (로그인·설정)"
              }
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
          </div>
        </div>
      </header>
      <BottomTabs />
      {sessions && <SessionDrawer onClose={() => setSessions(false)} />}
    </>
  );
}
