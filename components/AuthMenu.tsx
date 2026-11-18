"use client";
// 헤더의 로그인·계정 메뉴 (DEC-035). NEXT_PUBLIC_GOOGLE_LOGIN=on일 때만 보인다.
// 로그인하면 사용자 아이콘이 Google 프로필 사진으로 바뀌고, 메뉴에서 내 질문 기록·로그아웃으로 간다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LOGIN_ENABLED, signInWithGoogle, signOut, useAuthUser } from "@/lib/client/auth";

export function AuthMenu() {
  const user = useAuthUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!LOGIN_ENABLED) return null;

  if (!user) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signInWithGoogle().catch(() => setBusy(false));
        }}
        className="border-line text-ink hover:border-gold flex min-h-11 items-center gap-2 rounded-full border bg-white px-3.5 text-sm font-semibold disabled:opacity-60"
      >
        <GoogleMark />
        <span className="max-sm:sr-only">Google로 로그인</span>
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name} 계정 메뉴`}
        onClick={() => setOpen((v) => !v)}
        className="border-line hover:border-gold flex size-11 items-center justify-center overflow-hidden rounded-full border bg-white"
      >
        {user.avatarUrl ? (
          // Google 프로필 사진: 외부 주소라 next/image 대신 img. 리퍼러를 보내지 않는다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            width={44}
            height={44}
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <span className="text-ink text-base font-bold" aria-hidden="true">
            {user.name.slice(0, 1)}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="rounded-card border-line absolute top-[52px] right-0 z-50 w-52 border bg-white p-1.5 shadow-xl"
        >
          <p className="text-muted truncate px-3 py-2 text-[13px]">{user.name}</p>
          <Link
            href="/me"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="text-ink hover:bg-soft flex min-h-11 items-center rounded-[8px] px-3 text-[15px]"
          >
            내 질문 기록
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="text-ink hover:bg-soft flex min-h-11 w-full items-center rounded-[8px] px-3 text-left text-[15px]"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
