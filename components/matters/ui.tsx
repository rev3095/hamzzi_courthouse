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

/**
 * 사건 목록 (2026-11-27 사용자 요청, DEC-073): 한 줄씩 — 제목·법 분야, 한 줄 요약, 담긴 자료 수·고친 날.
 * 같은 날 두 번째 요청으로 줄마다 떨어진 둥근 칸으로 띄우고 여백을 넓혔다 (리스트 꼴은 그대로).
 */
export function MatterList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <ul className="mt-4 flex flex-col gap-2.5" data-testid={testId}>
      {children}
    </ul>
  );
}

/** 목록 위 제목 줄: 제목 + 건수 */
export function ListHead({
  title,
  count,
  hint,
  right,
}: {
  title: string;
  count?: number;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-ink flex items-center gap-2 text-[18px] font-bold">
          {title}
          {count !== undefined && (
            <span className="bg-soft text-muted rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {hint && <p className="text-muted mt-1 text-[13px] leading-relaxed">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

/** 불러오는 동안 보이는 빈 줄 */
export function MatterListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="mt-4 flex flex-col gap-2.5" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={`${card} flex items-center gap-4 px-5 py-4`}>
          <span className="bg-soft size-11 shrink-0 animate-pulse rounded-[10px]" />
          <span className="flex-1">
            <span className="bg-soft block h-4 w-2/5 animate-pulse rounded" />
            <span className="bg-soft mt-2 block h-3 w-4/5 animate-pulse rounded" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
        n > 0 ? "bg-cream text-ink" : "bg-soft text-muted"
      }`}
    >
      {label} {n}
    </span>
  );
}

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export function MatterRow({
  title,
  counts,
  field,
  gist,
  byAi = false,
  updatedAt,
  tag,
  pending = false,
  onClick,
}: {
  title: string;
  counts: { docs: number; parties: number; issues: number; notes: number };
  /** 법 분야 이름 (MATTER_FIELD_LABEL) */
  field?: string | null;
  /** 한 줄 요약 — AI 자동 정리이거나 사용자가 적은 요약 */
  gist?: string;
  byAi?: boolean;
  updatedAt?: string;
  tag?: string;
  /** 자동 정리 중 */
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`${card} group/row flex w-full items-center gap-4 px-4 py-4 text-left transition duration-150 hover:-translate-y-px hover:border-[var(--ink)] hover:shadow-[0_6px_18px_rgba(26,34,51,0.08)] focus-visible:border-[var(--ink)] focus-visible:outline-none sm:px-5`}
      >
        <span className="bg-cream text-ink flex size-11 shrink-0 items-center justify-center rounded-[10px]">
          <FolderIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink text-[16px] leading-snug font-bold">{title}</span>
            {tag && (
              <span className="border-line text-muted rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold">
                {tag}
              </span>
            )}
            {field && (
              <span className="border-gold-line text-ink rounded-full border bg-white px-2 py-0.5 text-[11px] font-semibold">
                {field}
              </span>
            )}
          </span>
          {gist ? (
            <span className="text-muted mt-1.5 line-clamp-2 text-[13px] leading-relaxed">
              {byAi && <span className="text-label mr-1 text-[11px] font-semibold">AI 요약</span>}
              {gist}
            </span>
          ) : pending ? (
            <span className="mt-2 flex items-center gap-2" aria-live="polite">
              <span
                className="bg-soft hidden h-3 w-40 animate-pulse rounded sm:block"
                aria-hidden="true"
              />
              <span className="text-muted text-[12px]">AI가 사건을 정리하는 중…</span>
            </span>
          ) : null}
          <span className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:hidden">
            <Count label="자료" n={counts.docs} />
            <Count label="쟁점" n={counts.issues} />
            {updatedAt && <span className="text-muted text-[12px]">{dayOf(updatedAt)}</span>}
          </span>
        </span>
        <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <span className="flex gap-1.5">
            <Count label="자료" n={counts.docs} />
            <Count label="쟁점" n={counts.issues} />
          </span>
          {updatedAt && (
            <span className="text-muted text-[12px] tabular-nums">고친 날 {dayOf(updatedAt)}</span>
          )}
        </span>
        <span
          aria-hidden="true"
          className="text-muted group-hover/row:text-ink shrink-0 text-xl transition-transform group-hover/row:translate-x-0.5"
        >
          ›
        </span>
      </button>
    </li>
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
