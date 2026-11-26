"use client";
// 질문창 (Figma 05 "질문창", S-01): 질문 입력란 · 물어보기 버튼. F-001 → POST /api/v1/inquiries.
// D+의 모드 전환 버튼(AI 질문 / 판례 검색)은 데모 범위 밖이라 뺐다.
// AI 질문창(askTools)에는 입력란 아래에 답변 모드 선택(TierSlider, DEC-036)과 DeepSearch 버튼(DEC-038)을 둔다 — Figma에 없는 추가 요소.
// 판례 검색창(/search)은 모델을 쓰지 않으므로 보이지 않는다.
// attach를 넘기면 서류 사진 붙이기(F-015, DEC-052)가 켜진다: 왼쪽 버튼 · 끌어다 놓기 · 붙여넣기 → 입력란 아래 사진 줄. Figma에 없는 추가 요소.
import { useId, useState, type Ref } from "react";
import { AttachButton, AttachTray } from "./AttachTray";
import { imageFilesOf, type Attachments } from "./useAttachments";
import { SaveToggle } from "./SaveToggle";
import { TierSlider } from "./TierSlider";

export const MAX_QUESTION_CHARS = 50_000; // lib/inquiries/policy MAX_INPUT_CHARS와 같다 (브라우저 묶음에 서버 모듈을 끌어오지 않으려고 값만 옮김)

export function QuestionBox({
  value,
  onChange,
  onSubmit,
  busy,
  placeholder = "무슨 일이 있었는지 적어 주세요",
  label = "질문",
  submitLabel = "물어보기",
  size = "lg",
  inputRef,
  askTools = false,
  onDeep,
  attach,
  attachNoun,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  placeholder?: string;
  label?: string;
  /** 보내기 버튼 글자 (홈은 "정리 시작", DEC-065) */
  submitLabel?: string;
  size?: "lg" | "md";
  /** 바깥에서 입력란에 포커스를 줄 때 (결과 화면 "심층 질문하기") */
  inputRef?: Ref<HTMLTextAreaElement>;
  /** AI 질문창이면 답변 모드 선택을 보인다 */
  askTools?: boolean;
  /** DeepSearch 창 열기. 있으면 답변 모드 옆에 버튼을 보인다 */
  onDeep?: () => void;
  /** 사진 붙이기 (F-015 서류 분석·F-017 자료 첨부). 있으면 붙이기 버튼과 사진 줄을 보인다 */
  attach?: Attachments;
  /** 붙이기 버튼·사진 이름에 붙는 말 (기본 "서류") */
  attachNoun?: string;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      {...(attach && {
        onDragOver: (e: React.DragEvent) => {
          if (![...e.dataTransfer.types].includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: React.DragEvent) => {
          setDragging(false);
          const files = imageFilesOf(e.dataTransfer);
          if (files.length === 0) return;
          e.preventDefault();
          void attach.add(files);
        },
      })}
      className={`rounded-card w-full bg-white p-[5px] shadow-[0_0_0_1px_var(--line),0_8px_24px_rgba(26,34,51,0.08)] ${
        dragging ? "outline-gold outline-2 outline-dashed" : ""
      }`}
    >
      <div className="rounded-button flex items-stretch overflow-hidden">
        {attach && <AttachButton attach={attach} disabled={busy} noun={attachNoun} />}
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          ref={inputRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy) onSubmit();
            }
          }}
          onPaste={(e) => {
            if (!attach) return;
            const files = imageFilesOf(e.clipboardData);
            if (files.length === 0) return;
            e.preventDefault();
            void attach.add(files);
          }}
          maxLength={MAX_QUESTION_CHARS}
          rows={size === "lg" ? 2 : 1}
          placeholder={placeholder}
          className={`text-ink placeholder:text-muted/70 min-h-16 flex-1 resize-none bg-white ${attach ? "pr-4 pl-1" : "px-4"} py-[18px] leading-snug outline-none ${
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
          <span className="sr-only lg:not-sr-only lg:text-[15px] lg:font-semibold">
            {submitLabel}
          </span>
        </button>
      </div>
      {attach && <AttachTray attach={attach} noun={attachNoun} />}
      {askTools && <SaveToggle />}
      {askTools && (
        <div className="border-line mx-1 mt-1 flex flex-wrap items-center justify-between gap-x-3 border-t">
          <div className="min-w-0 flex-1">
            <TierSlider />
          </div>
          {onDeep && (
            <button
              type="button"
              onClick={onDeep}
              disabled={busy}
              className="border-gold-line bg-cream text-ink hover:border-gold mr-2 mb-1.5 flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M10.5 10.5L14 14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M7 5v4M5 7h4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              DeepSearch
            </button>
          )}
        </div>
      )}
    </form>
  );
}
