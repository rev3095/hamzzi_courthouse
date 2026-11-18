"use client";
// 마이페이지 (DEC-032): 프로필(로그인 자리) + 화면 설정 + 내 기록.
// 로그인은 아직 만들지 않았다 — 버튼 자리만 두고 비활성으로 둔다(DEC-016 데모 비로그인 운영은 그대로).
// 설정은 이 브라우저에만 저장한다(lib/client/prefs.ts). 개인정보 입력을 받지 않는다.
import Link from "next/link";
import { setGuideBotEnabled, useGuideBotEnabled } from "@/lib/client/prefs";
import { useQuota } from "../useQuota";

const card = "rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-7 lg:py-7";

export function MyPage() {
  const quota = useQuota();
  const botOn = useGuideBotEnabled();

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
              {quota?.admin ? "관리자 모드" : "로그인하지 않았어요"}
            </h2>
            <p className="text-muted text-sm" data-testid="me-quota">
              {quota?.admin
                ? "이 브라우저는 질문 횟수 제한 없이 쓸 수 있어요."
                : quota?.anonymous && quota.remaining !== null
                  ? `오늘 남은 질문 ${quota.remaining}/${quota.limit}`
                  : "로그인 없이 쓰고 있어요."}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled
          aria-describedby="me-login-note"
          className="rounded-button bg-ink mt-5 min-h-11 w-full px-5 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          로그인 (준비 중)
        </button>
        <p id="me-login-note" className="text-muted mt-2 text-[13px]">
          로그인 기능은 준비 중이에요. 지금은 로그인 없이 쓸 수 있어요.
        </p>
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
