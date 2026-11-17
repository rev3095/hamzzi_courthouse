"use client";
// 홈 카테고리 버튼 (S-01, DEC-026). 분야를 고르면 질문창 위에 안내·질문 틀이 나타난다.
// Figma에 아직 프레임이 없어 05 Components "칩·예시 질문" 카드 스타일(cream 라벨·line 테두리·gold 강조)로 만든다.
// 이모지·색 아이콘은 쓰지 않는다 (브랜드 가이드 3.5).
import { CATEGORY_LIST, type CategoryKey } from "@/lib/procedure/categories";

export function CategoryPicker({
  selected,
  onPick,
}: {
  selected: CategoryKey | null;
  onPick: (key: CategoryKey) => void;
}) {
  return (
    <section id="categories" aria-labelledby="categories-title" className="w-full text-left">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="categories-title" className="font-display text-ink text-[19px] font-bold">
          어떤 일인가요?
        </h2>
        <span className="text-muted text-[13px]">분야를 고르면 질문 틀을 알려 드려요</span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORY_LIST.map((c) => {
          const on = c.key === selected;
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(c.key)}
                className={`rounded-card flex h-full min-h-[76px] w-full flex-col gap-1 border bg-white px-4 py-3 text-left transition-colors ${
                  on ? "border-ink shadow-[0_0_0_1px_var(--ink)]" : "border-line hover:border-gold"
                }`}
              >
                <span className="text-ink text-[15px] font-bold">{c.label}</span>
                <span className="text-muted text-[13px] leading-snug">{c.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
