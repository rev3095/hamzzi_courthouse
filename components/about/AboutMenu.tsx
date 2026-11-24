"use client";
// 헤더 메뉴 아이콘 (DEC-051, Figma에 없는 메뉴): 누르면 소개 · 기능 가이드 · 향후 계획 · 개발자·문의가 펼쳐진다.
// 라우트 훅을 쓰지 않는다(cacheComponents) — 링크를 누르면 닫는다. 바깥을 누르거나 Esc를 누르면 닫힌다.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ABOUT_PAGES } from "@/lib/about/content";

const ITEMS: { href: string; label: string; mobileOnly?: true }[] = [
  // 좁은 화면에서는 헤더의 커뮤니티 버튼을 숨기고 여기서 연다 (가로 넘침 방지)
  { href: "/community", label: "커뮤니티", mobileOnly: true },
  ...ABOUT_PAGES.map((p) => ({ href: p.href as string, label: p.label })),
  { href: "/about/developer#contact", label: "문의 남기기" },
];

export function AboutMenu() {
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
        aria-label="햄찌법원 메뉴 (소개·기능 가이드·향후 계획·문의)"
        title="메뉴"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`text-ink hover:border-gold flex size-11 shrink-0 items-center justify-center rounded-full border bg-white ${
          open ? "border-gold" : "border-line"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path
            d="M4 6h14M4 11h14M4 16h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <nav
          id={listId}
          aria-label="햄찌법원 메뉴"
          className="rounded-card border-line absolute top-[calc(100%+8px)] right-0 z-50 w-56 border bg-white p-1.5 shadow-[0_8px_24px_rgba(26,34,51,0.12)]"
        >
          <ul className="flex flex-col">
            {ITEMS.map((item) => (
              <li key={item.href} className={item.mobileOnly ? "sm:hidden" : undefined}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-ink hover:bg-cream flex min-h-11 items-center rounded-[10px] px-3 text-sm font-semibold"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
