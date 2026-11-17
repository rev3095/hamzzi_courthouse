"use client";
// 관리자 모드 켜기·끄기 (DEC-024). 비밀번호는 서버로만 보내고 브라우저에 저장하지 않는다.
import { useId, useState } from "react";
import { notifyQuotaChanged } from "@/lib/client/api";
import { useQuota } from "./useQuota";

export function AdminLogin() {
  const id = useId();
  const quota = useQuota();
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/v1/admin/session", {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify({ passcode }) : undefined,
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    setPasscode("");
    if (res?.ok) {
      notifyQuotaChanged();
      return;
    }
    const code = body?.error?.code;
    setMessage(
      code === "UNAUTHENTICATED"
        ? "비밀번호가 맞지 않아요."
        : code === "RATE_LIMITED"
          ? "시도가 너무 많아요. 나중에 다시 시도해 주세요."
          : code === "NOT_FOUND"
            ? "관리자 모드가 설정되지 않았어요."
            : "잠시 후 다시 시도해 주세요.",
    );
  }

  if (quota?.admin) {
    return (
      <div className="mt-6">
        <p
          role="status"
          className="rounded-card bg-cream text-ink px-4 py-3 text-[15px] font-semibold"
        >
          관리자 모드가 켜져 있어요 · 질문 무제한
        </p>
        <button
          type="button"
          onClick={() => void send("DELETE")}
          disabled={busy}
          className="rounded-button border-line text-ink mt-4 min-h-11 border bg-white px-5 text-[15px] disabled:opacity-60"
        >
          관리자 모드 끄기
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-6 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send("POST");
      }}
    >
      <label htmlFor={id} className="text-ink text-sm font-semibold">
        비밀번호
      </label>
      <input
        id={id}
        type="password"
        autoComplete="current-password"
        value={passcode}
        maxLength={200}
        required
        onChange={(e) => setPasscode(e.target.value)}
        className="rounded-button border-line text-ink focus:border-ink w-full border bg-white px-3 py-2.5 text-[15px] outline-none"
      />
      <button
        type="submit"
        disabled={busy || !passcode}
        className="rounded-button bg-ink min-h-11 self-start px-5 text-[15px] font-semibold text-white disabled:opacity-60"
      >
        관리자 모드 켜기
      </button>
      {message && (
        <p role="alert" className="text-warn-text text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
