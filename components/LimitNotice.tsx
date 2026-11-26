"use client";
// 하루 질문 한도 안내 (S-06 자리). 비로그인 하루 한도(ANON_QUESTION_LIMIT, DEC-055 10회)를 다 쓰면 서버가 LOGIN_REQUIRED로 막는다 (DEC-005, DEC-010).
// Google 로그인(DEC-035)이 켜져 있으면 비로그인에게 Google 로그인 버튼을 보여 준다. 로그인 사용자는 하루 USER_QUESTION_LIMIT회.
import { useState } from "react";
import { isSignedIn } from "@/lib/client/api";
import { GOOGLE_LOGIN_ENABLED, signInWithGoogle } from "@/lib/client/login";
import { ANON_QUESTION_LIMIT, USER_QUESTION_LIMIT } from "@/lib/inquiries/policy";
import { HamzziJudge } from "./HamzziJudge";
import { Modal, SecondaryButton } from "./Modal";
import { useQuota } from "./useQuota";

const N = ANON_QUESTION_LIMIT;
const U = USER_QUESTION_LIMIT;
export const DEMO_LIMIT_TITLE = `오늘 질문 ${N}번을 모두 썼어요`;
export const DEMO_LIMIT_TEXT = `데모에서는 하루에 질문을 ${N}번까지 할 수 있어요(이어 묻기 포함). 내일 0시(한국 시간)에 다시 ${N}번이 생겨요. 예시 질문은 횟수와 상관없이 언제든 볼 수 있어요. 지금까지 받은 결과는 이 창에서 뒤로 가기로 다시 볼 수 있어요.`;
/** 질문창 아래 한 줄 안내 (DEC-067: 홈·서류 분석·결과 화면이 같은 문장을 쓴다) */
export const dailyLimitLine = (signedIn: boolean) =>
  signedIn
    ? `오늘은 하루 ${U}번까지 물어볼 수 있어요.`
    : `로그인 없이 하루 ${N}번까지 물어볼 수 있어요.`;

/** 비로그인에게 Google 로그인으로 늘어나는 횟수를 알린다 (DEC-035) */
export const LOGIN_MORE_TEXT = `Google로 로그인하면 하루에 ${U}번까지 질문할 수 있어요.`;
export const USER_LIMIT_TITLE = `오늘 질문 ${U}번을 모두 썼어요`;
export const USER_LIMIT_TEXT = `로그인한 계정은 하루에 질문을 ${U}번까지 할 수 있어요(이어 묻기 포함). 내일 0시(한국 시간)에 다시 ${U}번이 생겨요. 예시 질문은 횟수와 상관없이 언제든 볼 수 있어요.`;

/** 한도 안내 문구 — 로그인 여부에 따라 */
export function limitCopy(signedIn: boolean) {
  return signedIn
    ? { title: USER_LIMIT_TITLE, body: USER_LIMIT_TEXT }
    : { title: DEMO_LIMIT_TITLE, body: DEMO_LIMIT_TEXT };
}

export function LimitNotice({ onClose }: { onClose: () => void }) {
  const signedIn = isSignedIn(useQuota());
  const copy = limitCopy(signedIn);
  const showLogin = !signedIn && GOOGLE_LOGIN_ENABLED;
  return (
    <Modal title={copy.title} onClose={onClose}>
      <div className="flex justify-center">
        <HamzziJudge size={88} interactive={false} mood="sorry" />
      </div>
      <p className="text-muted mt-3 text-[15px] leading-relaxed">{copy.body}</p>
      {showLogin && <p className="text-ink mt-2 text-[15px] font-semibold">{LOGIN_MORE_TEXT}</p>}
      <div className="mt-5 flex flex-col gap-2">
        {showLogin && <GoogleLoginButton />}
        <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
      </div>
    </Modal>
  );
}

/** Google 로그인 버튼 (DEC-035). 로그인 방법은 이것 하나뿐이다. 꺼져 있으면(NEXT_PUBLIC_GOOGLE_LOGIN) "준비 중" 비활성 */
export function GoogleLoginButton({ next }: { next?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  if (!GOOGLE_LOGIN_ENABLED) {
    return (
      <button
        type="button"
        disabled
        className="rounded-button bg-ink min-h-11 w-full px-5 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        Google 로그인 (준비 중)
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          // 성공하면 Google 화면으로 이동하므로 이 화면은 그대로 사라진다
          if (!(await signInWithGoogle(next))) setState("failed");
        }}
        className="rounded-button border-line text-ink flex min-h-11 w-full items-center justify-center gap-2 border bg-white px-5 text-[15px] font-semibold disabled:opacity-60"
      >
        <GoogleMark />
        {state === "busy" ? "Google로 이동하는 중…" : "Google로 로그인"}
      </button>
      {state === "failed" && (
        <p role="alert" className="text-warn-text text-[13px]">
          Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
    </>
  );
}

/** Google 표시 (Google 로그인 버튼 안내에 따른 네 색 G) */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
