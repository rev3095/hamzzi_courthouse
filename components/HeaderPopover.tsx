"use client";
// 헤더의 펼침 메뉴 공통 (DEC-051 소개 메뉴, DEC-052 판례 아카이브). Figma에 없는 메뉴라 브랜드 토큰(ink·line·cream)으로 그린다.
// 라우트 훅을 쓰지 않는다(cacheComponents) — 링크를 누르면 닫는다. 바깥을 누르거나 Esc를 누르면 닫힌다.
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** className: 항목을 화면 폭에 따라 숨길 때 (예: 좁은 화면 전용 "sm:hidden") */
export type PopoverItem = { href: string; label: string; hint?: string; className?: string };

export function HeaderPopover({
  buttonLabel,
  buttonTitle,
  navLabel,
  items,
  buttonClass,
  children,
  width = "w-56",
}: {
  /** 버튼의 접근 이름 */
  buttonLabel: string;
  buttonTitle?: string;
  /** 펼친 목록의 이름 */
  navLabel: string;
  items: PopoverItem[];
  /** 열림 여부에 따른 버튼 모양 */
  buttonClass: (open: boolean) => string;
  /** 버튼 안 내용 (아이콘·글자) */
  children: ReactNode;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={buttonLabel}
        title={buttonTitle}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={buttonClass(open)}
      >
        {children}
      </button>
      {open && (
        <nav
          id={listId}
          aria-label={navLabel}
          className={`rounded-card border-line absolute top-[calc(100%+8px)] right-0 z-50 border bg-white p-1.5 shadow-[0_8px_24px_rgba(26,34,51,0.12)] ${width}`}
        >
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href} className={item.className}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-ink hover:bg-cream flex min-h-11 flex-col justify-center rounded-[10px] px-3 py-1.5 text-sm font-semibold"
                >
                  {item.label}
                  {item.hint && (
                    <span className="text-muted text-[12px] font-normal">{item.hint}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
