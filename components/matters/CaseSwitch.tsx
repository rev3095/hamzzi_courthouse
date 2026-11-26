// 사건 메뉴 전환 (2026-11-27 사용자 요청, DEC-067 보충): 주 메뉴 '사건'에서 진행(/matters) ↔ 정리(/casefile)를 오간다.
// 판례·법령의 검색 ↔ 리서치 전환(components/search/ArchiveSwitch)과 같은 꼴이다. 주소에는 아무것도 싣지 않는다.
import Link from "next/link";

type Mode = "progress" | "organize";

export const CASE_MODES: { mode: Mode; href: string; label: string; hint: string }[] = [
  {
    mode: "progress",
    href: "/matters",
    label: "진행",
    hint: "사건 진행 — 내 사건을 단계별로 정리",
  },
  {
    mode: "organize",
    href: "/casefile",
    label: "정리",
    hint: "사건 정리 — 상황 글이나 서류 사진으로 DeepSearch 정리",
  },
];

export function CaseSwitch({ current }: { current: Mode }) {
  return (
    <nav aria-label="사건" className="border-line inline-flex rounded-full border bg-white p-1">
      {CASE_MODES.map((m) => {
        const on = m.mode === current;
        return (
          <Link
            key={m.mode}
            href={m.href}
            aria-current={on ? "page" : undefined}
            title={m.hint}
            className={`flex min-h-9 items-center rounded-full px-4 text-sm font-semibold ${
              on ? "bg-ink text-white" : "text-ink hover:bg-cream"
            }`}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
