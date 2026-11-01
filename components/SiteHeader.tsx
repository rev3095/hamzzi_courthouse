"use client";
// 공통 헤더 (Figma 05 "헤더"): 로고·서비스명·BETA, 남은 질문 n/3, 로그인.
// 범위 밖 메뉴(변호사 찾기·혼자 소송하기)와 다크 모드는 데모에서 숨긴다 (docs/07 결정 2).
import Link from "next/link";
import { useState } from "react";
import { HamzziFace } from "./HamzziJudge";
import { LoginNotice } from "./LoginNotice";
import { useQuota } from "./useQuota";

export function SiteHeader() {
  const quota = useQuota();
  const [login, setLogin] = useState(false);
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
          <span className="bg-cream text-gold mt-1 rounded-[4px] px-1.5 py-0.5 text-[10px] max-[400px]:hidden">
            BETA
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {quota?.anonymous && quota.remaining !== null && (
            <span className="text-muted text-[13px] whitespace-nowrap" data-testid="quota">
              {`남은 질문 ${quota.remaining}/${quota.limit}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => setLogin(true)}
            className="rounded-button border-line text-ink min-h-11 border bg-white px-3.5 text-sm font-semibold whitespace-nowrap"
          >
            로그인
          </button>
        </div>
      </div>
      {login && <LoginNotice reason="header" onClose={() => setLogin(false)} />}
    </header>
  );
}
