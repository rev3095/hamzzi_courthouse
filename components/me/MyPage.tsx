"use client";
// 마이페이지 (DEC-032·035·056): 프로필(Google 로그인) + 화면 설정 + 내 세션 + 내 기록.
// 로그인하면 데스크톱 앱처럼 왼쪽 사이드바 + 오른쪽 본문으로 보인다(components/me/MyWorkspace, DEC-056 ③ 2026-11-25).
// 로그인하지 않았으면 지금처럼 카드 세 장(프로필·설정·내 기록)을 세로로 쌓는다.
// 로그인 상태와 관리자 모드(DEC-024)는 따로 보여 준다 — 둘 다 켜져 있으면 둘 다 표시.
// 로그인은 Google 계정으로만 한다(DEC-035). NEXT_PUBLIC_GOOGLE_LOGIN이 꺼져 있으면 버튼은 "준비 중" 비활성.
// 로그인 여부는 서버가 판단한 /me/quota 값만 본다. 이메일은 이 화면에 싣지 않는다.
// 로그인하면 Google 계정 이름·프로필 사진(GET /me/profile, DEC-056)을 본인에게만 보여 준다 — 이 화면 메모리에만 두고 저장하지 않는다.
// 설정은 이 브라우저에만 저장한다(lib/client/prefs.ts). 개인정보 입력을 받지 않는다.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { greeting } from "@/lib/auth/profile";
import { getMyProfile, isSignedIn, type Quota } from "@/lib/client/api";
import { GOOGLE_LOGIN_ENABLED, signOut } from "@/lib/client/login";
import { setGuideBotEnabled, useGuideBotEnabled } from "@/lib/client/prefs";
import { GoogleLoginButton, LOGIN_MORE_TEXT } from "../LimitNotice";
import { useQuota } from "../useQuota";
import { MyWorkspace } from "./MyWorkspace";
import { PAGE_TITLE } from "@/components/ui/styles";

const noSubscribe = () => () => {};
/** /auth/callback이 실패하면 /me?login=failed로 돌려보낸다 */
const loginFailed = () => new URLSearchParams(window.location.search).get("login") === "failed";

const card = "rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-7 lg:py-7";

type Profile = { name: string | null; avatarUrl: string | null };

export function MyPage() {
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  const failed = useSyncExternalStore(noSubscribe, loginFailed, () => false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void getMyProfile().then((r) => {
      if (live && r.ok) setProfile(r.data);
    });
    return () => {
      live = false;
    };
  }, [signedIn]);
  const avatar = signedIn && !avatarFailed ? (profile?.avatarUrl ?? null) : null;

  if (signedIn) {
    return (
      <MyWorkspace
        profile={
          <ProfileChip
            name={profile?.name ?? null}
            avatar={avatar}
            onAvatarError={() => setAvatarFailed(true)}
            quota={quota}
          />
        }
        settings={<SettingsCard />}
        records={<RecordsCard />}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-5 px-4 py-10">
      <h1 className={PAGE_TITLE}>마이페이지</h1>

      <section aria-labelledby="me-profile" className={card}>
        <div className="flex items-center gap-4">
          <span className="bg-cream text-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <ProfileIcon size={28} />
          </span>
          <div className="min-w-0">
            <h2 id="me-profile" className="text-ink text-lg font-bold">
              로그인하지 않았어요
            </h2>
            <AdminBadge quota={quota} />
            <QuotaLine quota={quota} />
          </div>
        </div>
        {failed && (
          <p role="alert" className="text-warn-text mt-4 text-[13px]">
            Google 로그인을 마치지 못했어요. 다시 시도해 주세요.
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <GoogleLoginButton next="/me" />
          <p id="me-login-note" className="text-muted text-[13px] leading-relaxed">
            {GOOGLE_LOGIN_ENABLED
              ? `로그인은 Google 계정으로만 할 수 있어요. ${LOGIN_MORE_TEXT}`
              : "로그인 기능은 준비 중이에요. 지금은 로그인 없이 쓸 수 있어요."}
          </p>
        </div>
      </section>

      <SettingsCard />
      <RecordsCard />
    </div>
  );
}

function AdminBadge({ quota }: { quota: Quota | null }) {
  if (!quota?.admin) return null;
  return (
    <span
      data-testid="me-admin"
      className="bg-honey text-ink mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
    >
      관리자 모드
    </span>
  );
}

function QuotaLine({
  quota,
  className = "text-muted text-sm",
}: {
  quota: Quota | null;
  className?: string;
}) {
  return (
    <p className={className} data-testid="me-quota">
      {quota?.admin
        ? "관리자 모드라 이 브라우저는 질문 횟수 제한 없이 쓸 수 있어요."
        : quota && quota.remaining !== null
          ? `오늘 남은 질문 ${quota.remaining}/${quota.limit}`
          : "로그인 없이 쓰고 있어요."}
    </p>
  );
}

/** 사이드바 아래 프로필: 사진·인사·관리자 모드·남은 질문·로그아웃 (데스크톱 앱의 계정 자리) */
function ProfileChip({
  name,
  avatar,
  onAvatarError,
  quota,
}: {
  name: string | null;
  avatar: string | null;
  onAvatarError: () => void;
  quota: Quota | null;
}) {
  const [signOutFailed, setSignOutFailed] = useState(false);
  return (
    <section aria-labelledby="me-profile">
      <div className="flex items-center gap-3">
        <span className="bg-cream text-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
          {avatar ? (
            // Google 프로필 사진 주소(googleusercontent.com)를 그대로 보여 준다 — 사진을 우리 서버로 옮기지 않는다
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              width={40}
              height={40}
              referrerPolicy="no-referrer"
              className="size-10 object-cover"
              data-testid="me-avatar"
              onError={onAvatarError}
            />
          ) : (
            <ProfileIcon size={22} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="me-profile" className="text-ink truncate text-[14px] font-bold">
            {greeting(name)}
          </h2>
          <AdminBadge quota={quota} />
          <QuotaLine quota={quota} className="text-muted text-[12px] leading-snug" />
        </div>
      </div>
      <button
        type="button"
        onClick={async () => setSignOutFailed(!(await signOut()))}
        className="rounded-button border-line text-ink mt-2.5 min-h-10 w-full border bg-white px-4 text-[13px] font-semibold"
      >
        로그아웃
      </button>
      {signOutFailed && (
        <p role="alert" className="text-warn-text mt-1.5 text-[12px]">
          로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </section>
  );
}

function SettingsCard() {
  const botOn = useGuideBotEnabled();
  return (
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
  );
}

function RecordsCard() {
  const link = "text-link inline-flex min-h-11 items-center underline underline-offset-2";
  return (
    <section aria-labelledby="me-records" className={card}>
      <h2 id="me-records" className="text-ink text-lg font-bold">
        내 기록
      </h2>
      <ul className="mt-3 space-y-1 text-[15px]">
        <li>
          <Link href="/privacy#delete" className={link}>
            내 질문·결과 지우기 →
          </Link>
        </li>
        <li>
          <Link href="/privacy" className={link}>
            개인정보처리방침 →
          </Link>
        </li>
        <li>
          <Link href="/terms" className={link}>
            이용약관 →
          </Link>
        </li>
      </ul>
    </section>
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
