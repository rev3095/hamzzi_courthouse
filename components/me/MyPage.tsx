"use client";
// 마이페이지 (DEC-032·033): 프로필(Google 로그인) + 화면 설정 + 내 기록.
// 로그인은 Google 계정으로만 한다(DEC-035). NEXT_PUBLIC_GOOGLE_LOGIN이 꺼져 있으면 버튼은 "준비 중" 비활성.
// 로그인 여부는 서버가 판단한 /me/quota 값만 본다. 이메일·이름은 이 화면에 싣지 않는다.
// 설정은 이 브라우저에만 저장한다(lib/client/prefs.ts). 개인정보 입력을 받지 않는다.
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { isSignedIn } from "@/lib/client/api";
import { GOOGLE_LOGIN_ENABLED, signOut } from "@/lib/client/login";
import { setGuideBotEnabled, useGuideBotEnabled } from "@/lib/client/prefs";
import { GoogleLoginButton, LOGIN_MORE_TEXT } from "../LimitNotice";
import { MyInquiries } from "../MyInquiries";
import { useQuota } from "../useQuota";

const noSubscribe = () => () => {};
/** /auth/callback이 실패하면 /me?login=failed로 돌려보낸다 */
const loginFailed = () => new URLSearchParams(window.location.search).get("login") === "failed";

const card = "rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-7 lg:py-7";

export function MyPage() {
  const quota = useQuota();
  const botOn = useGuideBotEnabled();
  const signedIn = isSignedIn(quota);
  const failed = useSyncExternalStore(noSubscribe, loginFailed, () => false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-5 px-4 py-10">
      <h1 className="font-display text-ink text-[28px] font-bold">마이페이지</h1>

      <section aria-labelledby="me-profile" className={card}>
        <div className="flex items-center gap-4">
          <span className="bg-cream text-muted flex size-14 shrink-0 items-center justify-center rounded-full">
            <ProfileIcon size={28} />
          </span>
          <div className="min-w-0">
            <h2 id="me-profile" className="text-ink text-lg font-bold">
              {quota?.admin
                ? "관리자 모드"
                : signedIn
                  ? "Google 계정으로 로그인했어요"
                  : "로그인하지 않았어요"}
            </h2>
            <p className="text-muted text-sm" data-testid="me-quota">
              {quota?.admin
                ? "이 브라우저는 질문 횟수 제한 없이 쓸 수 있어요."
                : quota && quota.remaining !== null
                  ? `오늘 남은 질문 ${quota.remaining}/${quota.limit}`
                  : "로그인 없이 쓰고 있어요."}
            </p>
          </div>
        </div>
        {failed && !signedIn && (
          <p role="alert" className="text-warn-text mt-4 text-[13px]">
            Google 로그인을 마치지 못했어요. 다시 시도해 주세요.
          </p>
        )}
        {signedIn ? (
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={async () => setSignOutFailed(!(await signOut()))}
              className="rounded-button border-line text-ink min-h-11 w-full border bg-white px-5 text-[15px] font-semibold"
            >
              로그아웃
            </button>
            {signOutFailed && (
              <p role="alert" className="text-warn-text text-[13px]">
                로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            <GoogleLoginButton next="/me" />
            <p id="me-login-note" className="text-muted text-[13px] leading-relaxed">
              {GOOGLE_LOGIN_ENABLED
                ? `로그인은 Google 계정으로만 할 수 있어요. ${LOGIN_MORE_TEXT}`
                : "로그인 기능은 준비 중이에요. 지금은 로그인 없이 쓸 수 있어요."}
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="me-settings" className={card}>
        <h2 id="me-settings" className="text-ink text-lg font-bold">
          설정
        </h2>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p id="me-bot-label" className="text-ink text-[15px] font-semibold">
              햄찌 안내 챗봇
            </p>
            <p id="me-bot-desc" className="text-muted text-[13px] leading-relaxed">
              화면 오른쪽 아래 햄찌 버튼을 보여 줘요. 이 설정은 이 브라우저에만 저장돼요.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={botOn}
            aria-labelledby="me-bot-label"
            aria-describedby="me-bot-desc"
            onClick={() => setGuideBotEnabled(!botOn)}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${
              botOn ? "border-ink bg-ink" : "border-line bg-soft"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block size-6 rounded-full bg-white shadow transition-transform ${
                botOn ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="text-muted mt-2 text-[13px]" aria-live="polite">
          {botOn ? "켜져 있어요" : "꺼져 있어요"}
        </p>
      </section>

      {signedIn && (
        <section aria-labelledby="me-history" className={card}>
          <h2 id="me-history" className="text-ink text-lg font-bold">
            내 질문 기록
          </h2>
          <p className="text-muted mt-2 text-[13px] leading-relaxed">
            &lsquo;내 기록에 남기기&rsquo;를 켜고 보낸 질문만 모여요. 가린 문장과 답변만 보관하고,
            보관 기간이 지나면 지워져요. 예시 질문은 기록에 남지 않아요.
          </p>
          <MyInquiries />
        </section>
      )}

      <section aria-labelledby="me-records" className={card}>
        <h2 id="me-records" className="text-ink text-lg font-bold">
          내 기록
        </h2>
        <ul className="mt-3 space-y-1 text-[15px]">
          <li>
            <Link
              href="/privacy#delete"
              className="text-link inline-flex min-h-11 items-center underline underline-offset-2"
            >
              내 질문·결과 지우기 →
            </Link>
          </li>
          <li>
            <Link
              href="/privacy"
              className="text-link inline-flex min-h-11 items-center underline underline-offset-2"
            >
              개인정보처리방침 →
            </Link>
          </li>
          <li>
            <Link
              href="/terms"
              className="text-link inline-flex min-h-11 items-center underline underline-offset-2"
            >
              이용약관 →
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

/** 사람 모양 선 아이콘 (브랜드 가이드 3.5: 선 아이콘, 두께 2) */
export function ProfileIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4.5 20c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
