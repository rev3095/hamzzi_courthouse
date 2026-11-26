"use client";
// 사건 진행 (F-016, DEC-053) 화면 부품 — 흑백 업무용 톤. DEC-067(UI·UX 개정 PR 2)로 모서리·높이·글자 크기를 브랜드 토큰에 맞췄다
// (버튼 8px·카드 12px·터치 44px, components/ui/styles).
// 기본은 한 줄, 자세한 내용은 마우스를 올리거나(Hover) 눌러 펼친다(Fold).
import { useId, useState, type ReactNode } from "react";

export const field =
  "border-line text-ink placeholder:text-muted/70 rounded-button w-full border bg-white px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[var(--ink)]";
export const btn =
  "rounded-button bg-ink min-h-11 shrink-0 px-4 text-[14px] font-bold whitespace-nowrap text-white disabled:opacity-40";
export const btnLine =
  "rounded-button border-line text-ink hover:border-ink min-h-11 shrink-0 border bg-white px-4 text-[14px] font-semibold whitespace-nowrap disabled:opacity-40";
export const btnText =
  "text-muted hover:text-ink min-h-11 px-1.5 text-[14px] underline-offset-2 hover:underline disabled:opacity-40";
export const card = "border-line rounded-card border bg-white";
export const label = "text-muted text-[12px] font-semibold tracking-wide";

/** 마우스를 올리거나 키보드로 닿으면 뜨는 작은 창. 터치 화면에서는 눌러서 연다 */
export function Hover({
  children,
  panel,
  className = "",
  align = "left",
  plain = false,
}: {
  children: ReactNode;
  panel: ReactNode;
  className?: string;
  align?: "left" | "right";
  /** 밑줄 없이 (상자처럼 이미 눌러 볼 수 있어 보이는 것) */
  plain?: boolean;
}) {
  const id = useId();
  const [pinned, setPinned] = useState(false);
  return (
    <span
      className={`group/hover relative inline-flex ${className}`}
      onMouseLeave={() => setPinned(false)}
    >
      <span
        tabIndex={0}
        aria-describedby={id}
        onClick={() => setPinned((v) => !v)}
        className={
          plain
            ? "outline-none"
            : "cursor-help underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)]"
        }
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className={`border-ink text-ink rounded-card absolute top-full z-30 mt-1 w-72 max-w-[80vw] border bg-white p-3 text-left text-[13px] leading-relaxed font-normal shadow-[0_8px_24px_rgba(26,34,51,0.12)] ${
          align === "right" ? "right-0" : "left-0"
        } ${pinned ? "block" : "hidden group-focus-within/hover:block group-hover/hover:block"}`}
      >
        {panel}
      </span>
    </span>
  );
}

/** 눌러서 펼치는 자세한 내용 */
export function Fold({
  summary,
  children,
  open = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group/fold">
      <summary className="text-ink flex min-h-10 cursor-pointer list-none items-center gap-2 text-[13px] font-semibold select-none [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-muted inline-block transition-transform group-open/fold:rotate-90"
        >
          ▸
        </span>
        {summary}
      </summary>
      <div className="pb-2 pl-5">{children}</div>
    </details>
  );
}

/** AI가 만든 내용 표시. 문구는 서버가 준 값(AI_NOTICE)을 그대로 받는다 */
export function AiTag({ notice }: { notice: string }) {
  return (
    <span className="border-ink text-ink inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold">
      {notice}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border-line text-muted rounded-[8px] border border-dashed bg-white px-4 py-6 text-center text-[14px] leading-relaxed">
      {children}
    </p>
  );
}

export function SectionTitle({
  title,
  hint,
  more,
  right,
}: {
  title: string;
  /** 한 줄 안내. 길어지는 설명은 more로 넘긴다 */
  hint?: string;
  /** '자세히'에 마우스를 올리거나 누르면 뜨는 긴 설명 (확인 범위·쓰는 법) */
  more?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-ink text-[17px] font-bold">{title}</h2>
        {(hint || more) && (
          <p className="text-muted mt-0.5 text-[13px] leading-relaxed">
            {hint}
            {more && (
              <>
                {" "}
                <Hover panel={more}>
                  <span className="text-ink font-semibold">자세히</span>
                </Hover>
              </>
            )}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

/** 사건 목록의 한 칸 (내 사건·가상 사건 공통). 숫자는 담긴 항목 수다 */
export function MatterCard({
  title,
  counts,
  tag,
  onClick,
}: {
  title: string;
  counts: { docs: number; parties: number; issues: number; notes: number };
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${card} hover:border-ink h-full w-full px-4 py-3 text-left`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-ink line-clamp-2 text-[15px] leading-snug font-bold">{title}</span>
        {tag && (
          <span className="border-line text-muted shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold">
            {tag}
          </span>
        )}
      </span>
      <span className="text-muted mt-1.5 block text-[12px]">
        자료 {counts.docs} · 당사자 {counts.parties} · 쟁점 {counts.issues} · 노트 {counts.notes}
      </span>
    </button>
  );
}

/** 삭제처럼 되돌릴 수 없는 일은 한 번 더 누르게 한다 (브라우저 확인창을 쓰지 않는다) */
export function ConfirmButton({
  onConfirm,
  children,
  className = btnText,
}: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={armed ? `${className} text-ink font-semibold underline` : className}
      onClick={() => {
        if (armed) onConfirm();
        setArmed(!armed);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "한 번 더 누르면 지워요" : children}
    </button>
  );
}
