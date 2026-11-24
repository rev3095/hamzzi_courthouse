"use client";
// 헤더 '판례 아카이브' 버튼 (DEC-052, Figma에 없는 메뉴): 누르면 검색(/search) · 리서치(/research) 중 하나를 고른다.
import { HeaderPopover } from "../HeaderPopover";

export const ARCHIVE_ITEMS = [
  { href: "/search", label: "검색", hint: "판례·법령을 종류별로 빠르게 찾기" },
  { href: "/research", label: "리서치", hint: "목록 옆 미리보기 · 보관함 · 인용 복사" },
];

export function ArchiveMenu() {
  return (
    <HeaderPopover
      buttonLabel="판례 아카이브 (검색·리서치)"
      navLabel="판례 아카이브"
      items={ARCHIVE_ITEMS}
      width="w-64"
      buttonClass={(open) =>
        `text-ink bg-honey hover:border-gold flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-bold shadow-[0_1px_0_rgba(26,34,51,0.04)] ${
          open ? "border-gold" : "border-honey-line"
        }`
      }
    >
      <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="9.5" cy="9.5" r="6.5" stroke="currentColor" strokeWidth="2" />
        <path d="M14.5 14.5L19 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span aria-hidden="true" className="max-sm:hidden">
        판례 아카이브
      </span>
    </HeaderPopover>
  );
}
