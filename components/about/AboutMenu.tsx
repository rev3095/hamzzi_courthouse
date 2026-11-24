"use client";
// 헤더 메뉴 아이콘 (DEC-051, Figma에 없는 메뉴): 누르면 소개 · 기능 가이드 · 향후 계획 · 개발자·문의가 펼쳐진다.
import { ABOUT_PAGES } from "@/lib/about/content";
import { HeaderPopover, type PopoverItem } from "../HeaderPopover";

const ITEMS: PopoverItem[] = [
  // 좁은 화면에서는 헤더의 커뮤니티 버튼을 숨기고 여기서 연다 (가로 넘침 방지)
  { href: "/community", label: "커뮤니티", className: "sm:hidden" },
  ...ABOUT_PAGES.map((p) => ({ href: p.href as string, label: p.label })),
  { href: "/about/developer#contact", label: "문의 남기기" },
];

export function AboutMenu() {
  return (
    <HeaderPopover
      buttonLabel="햄찌법원 메뉴 (소개·기능 가이드·향후 계획·문의)"
      buttonTitle="메뉴"
      navLabel="햄찌법원 메뉴"
      items={ITEMS}
      buttonClass={(open) =>
        `text-ink hover:border-gold flex size-11 shrink-0 items-center justify-center rounded-full border bg-white ${
          open ? "border-gold" : "border-line"
        }`
      }
    >
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path
          d="M4 6h14M4 11h14M4 16h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </HeaderPopover>
  );
}
