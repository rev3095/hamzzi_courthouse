"use client";
// 질문창 (Figma 05 "질문창", S-01): 질문 입력란 · 물어보기 버튼. F-001 → POST /api/v1/inquiries.
// D+의 모드 전환 버튼(AI 질문 / 판례 검색)은 데모 범위 밖이라 뺐다.
import { useId } from "react";

export const MAX_QUESTION_CHARS = 2000; // lib/inquiries/policy MAX_INPUT_CHARS와 같다

export function QuestionBox({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder = "무슨 일이 있었는지 적어 주세요",
  label = "질문",
  size = "lg",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder?: string;
  label?: string;
  size?: "lg" | "md";
}) {
  const id = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      className="rounded-card w-full bg-white p-[5px] shadow-[0_0_0_1px_var(--line),0_8px_24px_rgba(26,34,51,0.08)]"
    >
      <div className="rounded-button flex items-stretch overflow-hidden">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy) onSubmit();
            }
          }}
          maxLength={MAX_QUESTION_CHARS}
          rows={size === "lg" ? 2 : 1}
          placeholder={placeholder}
          className={`text-ink placeholder:text-muted/70 min-h-16 flex-1 resize-none bg-white px-4 py-[18px] leading-snug outline-none ${
            size === "lg" ? "text-[17px] lg:text-lg" : "text-base"
          }`}
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-ink flex min-w-16 items-center justify-center gap-2 px-5 text-white disabled:opacity-60"
        >
          {busy ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="9.5" cy="9.5" r="6.5" stroke="white" strokeWidth="2" />
              <path d="M14.5 14.5L19 19" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <span className="sr-only lg:not-sr-only lg:text-[15px] lg:font-semibold">물어보기</span>
        </button>
      </div>
    </form>
  );
}
