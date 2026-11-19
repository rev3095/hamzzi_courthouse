"use client";
// 홈 카테고리 버튼 (S-01, DEC-028 · 묶음 탭은 DEC-034). 분야를 고르면 질문창 위에 안내·질문 틀이 나타난다.
// 버튼이 많아 묶음(CATEGORY_GROUPS) 중 하나만 펼쳐 보인다 — 묶음 탭을 누르면 그 묶음의 버튼으로 바뀐다.
// Figma에 아직 프레임이 없어 05 Components "칩·예시 질문" 카드 스타일(cream 라벨·line 테두리·gold 강조)로 만든다.
// 이모지·색 아이콘은 쓰지 않는다 (브랜드 가이드 3.5).
import { useState } from "react";
import { CATEGORIES, CATEGORY_GROUPS, groupOf, type CategoryKey } from "@/lib/procedure/categories";

export function CategoryPicker({
  selected,
  onPick,
}: {
  selected: CategoryKey | null;
  onPick: (key: CategoryKey) => void;
}) {
  // 사용자가 누른 묶음이 먼저다. 누른 적이 없으면 고른 분야(예시 답변에서 넘어온 ?category= 포함)의 묶음, 그것도 없으면 첫 묶음
  const [opened, setOpened] = useState<string | null>(null);
  const groupKey = opened ?? (selected ? groupOf(selected) : CATEGORY_GROUPS[0].key);
  const group = CATEGORY_GROUPS.find((g) => g.key === groupKey) ?? CATEGORY_GROUPS[0];

  return (
    <section id="categories" aria-labelledby="categories-title" className="w-full text-left">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="categories-title" className="font-display text-ink text-[19px] font-bold">
          어떤 일인가요?
        </h2>
        <span className="text-muted text-[13px]">분야를 고르면 질문 틀을 알려 드려요</span>
      </div>
      <div role="tablist" aria-label="분야 묶음" className="mt-3 flex flex-wrap gap-2">
        {CATEGORY_GROUPS.map((g) => {
          const on = g.key === group.key;
          return (
            <button
              key={g.key}
              type="button"
              role="tab"
              id={`category-tab-${g.key}`}
              aria-selected={on}
              aria-controls="category-panel"
              onClick={() => setOpened(g.key)}
              className={`min-h-[40px] rounded-full border px-3.5 text-[14px] font-bold transition-colors ${
                on
                  ? "border-ink bg-ink text-white"
                  : "border-line text-ink hover:border-gold bg-white"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div id="category-panel" role="tabpanel" aria-labelledby={`category-tab-${group.key}`}>
        <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {group.keys.map((key) => {
            const c = CATEGORIES[key];
            const on = c.key === selected;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(c.key)}
                  className={`rounded-card flex h-full min-h-[76px] w-full flex-col gap-1 border bg-white px-4 py-3 text-left transition-colors ${
                    on
                      ? "border-ink shadow-[0_0_0_1px_var(--ink)]"
                      : "border-line hover:border-gold"
                  }`}
                >
                  <span className="text-ink text-[15px] font-bold">{c.label}</span>
                  <span className="text-muted text-[13px] leading-snug">{c.description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
