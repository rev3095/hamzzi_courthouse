"use client";
// 공통 헤더 (Figma 05 "헤더"): 로고·서비스명·BETA, 남은 질문 n/3.
// 데모는 소셜 로그인을 열지 않아 로그인 버튼을 숨긴다 (무료 모드 유지 결정, 2026-11-01).
// 범위 밖 메뉴(변호사 찾기·혼자 소송하기)와 다크 모드는 데모에서 숨긴다 (docs/07 결정 2).
import Link from "next/link";
import { HamzziFace } from "./HamzziJudge";
import { useQuota } from "./useQuota";

export function SiteHeader() {
  const quota = useQuota();
  return (
    <header className="border-line bg-bg/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-[65px] max-w-[1120px] items-center justify-between gap-3 px-4 lg:h-[70px]">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="햄찌법원 홈">
          <span className="rounded-card border-honey-line bg-honey flex size-11 items-center justify-center border">
            <HamzziFace size={36} />
          </span>
          <span className="font-display text-ink text-[22px] font-black whitespace-nowrap">
            햄찌법원
          </span>
          <span className="bg-cream text-gold mt-1 rounded-[4px] px-1.5 py-0.5 text-[10px]">
            BETA
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {quota?.anonymous && quota.remaining !== null && (
            <span className="text-muted text-[13px] whitespace-nowrap" data-testid="quota">
              {`남은 질문 ${quota.remaining}/${quota.limit}`}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
