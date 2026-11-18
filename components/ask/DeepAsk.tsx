"use client";
// DeepSearch 입력 창 (DEC-038): 길고 복잡한 사연을 정해 둔 칸(또는 큰 입력란 하나)으로 받는다.
// 보내기 전에 빠진 내용을 규칙으로 점검해 알려 주고(모델 없음, 비용 0), 많이 부족하면 한 번 더 묻는다.
// 적은 내용은 이 창 안에만 있고 브라우저에 저장하지 않는다. 보내면 일반 질문과 같은 길(가리기·동의·횟수)을 탄다.
import { useEffect, useId, useRef, useState } from "react";
import {
  DEEP_FIELDS,
  DEEP_FREE_GUIDE,
  EMPTY_DEEP,
  composeDeep,
  reviewDeep,
  type DeepReview,
  type DeepValues,
} from "@/lib/inquiries/deep";
import { MAX_INPUT_CHARS } from "@/lib/inquiries/policy";
import { PrimaryButton, SecondaryButton } from "../Modal";

type Mode = "form" | "free";

export function DeepAsk({
  initialText,
  busy,
  onSubmit,
  onClose,
}: {
  /** 질문창에 이미 적어 둔 글 — "있었던 일" 칸과 직접 입력란에 옮겨 둔다 */
  initialText: string;
  busy: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("form");
  const [values, setValues] = useState<DeepValues>({
    ...EMPTY_DEEP,
    facts: initialText.slice(0, DEEP_FIELDS[0].max),
  });
  const [free, setFree] = useState(initialText.slice(0, MAX_INPUT_CHARS));
  const [review, setReview] = useState<DeepReview | null>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const text = mode === "form" ? composeDeep(values) : free.trim();
  const empty = mode === "form" ? !values.facts.trim() : !free.trim();

  function start() {
    const r = reviewDeep(mode === "form" ? { values } : { text: free });
    // 빠진 내용이 있으면 먼저 알려 준다. 다 있으면 바로 보낸다
    if (r.missing.length > 0) setReview(r);
    else onSubmit(text);
  }

  return (
    <div className="bg-ink/50 fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="rounded-t-panel sm:rounded-panel border-line flex max-h-[92dvh] w-full max-w-[720px] flex-col border bg-white shadow-xl outline-none"
      >
        <header className="border-line border-b px-5 pt-5 pb-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`${id}-title`} className="font-display text-ink text-xl font-bold">
                DeepSearch · 심층 분석
              </h2>
              <p className="text-muted mt-1 text-[13px] leading-relaxed">
                복잡한 사연을 칸에 나눠 적으면 빠진 내용을 확인하기 쉬워요. 조문과 판례를 더 많이
                찾아 답변에 넘겨요.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-muted hover:text-ink -mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <div
            role="tablist"
            aria-label="입력 방식"
            className="bg-soft mt-3 inline-flex rounded-full p-1"
          >
            {(
              [
                ["form", "양식으로 작성"],
                ["free", "직접 입력"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setReview(null);
                }}
                className={`min-h-9 rounded-full px-4 text-[13px] font-semibold ${
                  mode === m ? "text-ink bg-white shadow-sm" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-7">
          {mode === "form" ? (
            <div className="flex flex-col gap-4">
              {DEEP_FIELDS.map((f) => {
                const fid = `${id}-${f.key}`;
                const v = values[f.key];
                return (
                  <div key={f.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor={fid} className="text-ink text-[15px] font-semibold">
                        {f.label}
                        {f.required ? (
                          <span className="text-warn-text ml-1 text-xs font-semibold">필수</span>
                        ) : (
                          <span className="text-muted ml-1 text-xs font-normal">선택</span>
                        )}
                      </label>
                      <span className="text-muted text-xs tabular-nums">
                        {v.length}/{f.max}
                      </span>
                    </div>
                    <p id={`${fid}-hint`} className="text-muted mt-0.5 text-[13px] leading-snug">
                      {f.hint}
                    </p>
                    <textarea
                      id={fid}
                      aria-describedby={`${fid}-hint`}
                      value={v}
                      onChange={(e) => {
                        setValues((old) => ({ ...old, [f.key]: e.target.value }));
                        setReview(null);
                      }}
                      maxLength={f.max}
                      rows={f.rows}
                      placeholder={f.placeholder}
                      className="rounded-card border-line text-ink placeholder:text-muted/60 focus:border-gold mt-1.5 w-full resize-y border bg-white px-3.5 py-2.5 text-[15px] leading-relaxed outline-none"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-ink text-[15px] font-semibold">이 내용이 들어가게 적어 주세요</p>
              <ul className="text-muted mt-1 list-disc pl-5 text-[13px] leading-relaxed">
                {DEEP_FREE_GUIDE.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <label htmlFor={`${id}-free`} className="sr-only">
                사연 직접 입력
              </label>
              <textarea
                id={`${id}-free`}
                value={free}
                onChange={(e) => {
                  setFree(e.target.value);
                  setReview(null);
                }}
                maxLength={MAX_INPUT_CHARS}
                rows={12}
                placeholder="무슨 일이 있었는지 일어난 순서대로 적어 주세요"
                className="rounded-card border-line text-ink placeholder:text-muted/60 focus:border-gold mt-3 w-full resize-y border bg-white px-3.5 py-3 text-[15px] leading-relaxed outline-none"
              />
              <p className="text-muted mt-1 text-right text-xs tabular-nums">
                {free.length}/{MAX_INPUT_CHARS}
              </p>
            </div>
          )}
          <p className="text-muted mt-3 text-[13px] leading-relaxed">
            이름·전화번호·주민등록번호·계좌번호는 적지 마세요. 적더라도 가린 문장만 저장하고
            분석해요.
          </p>
        </div>

        <footer className="border-line border-t px-5 py-4 sm:px-7">
          {review ? (
            <div role="alert">
              <p className="text-ink text-[15px] font-semibold">
                {review.thin
                  ? "내용이 많이 부족해 보여요. 그래도 진행하시겠습니까?"
                  : "아래 내용이 있으면 근거를 더 잘 찾을 수 있어요."}
              </p>
              <ul className="text-muted mt-1 list-disc pl-5 text-[13px] leading-relaxed">
                {review.missing.map((m) => (
                  <li key={m.key}>{m.message}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <SecondaryButton onClick={() => setReview(null)}>내용 보완하기</SecondaryButton>
                <PrimaryButton disabled={busy} onClick={() => onSubmit(text)}>
                  그래도 진행하기
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted text-[13px]">
                보내기 전에 빠진 내용이 있는지 먼저 확인해요. 질문 1회로 세요.
              </p>
              <PrimaryButton disabled={busy || empty} onClick={start}>
                심층 분석 시작
              </PrimaryButton>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
