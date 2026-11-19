"use client";
// 분야별 예시 답변 피드 (S-01, DEC-012 — 직접 작성한 가상 사연). D+의 빠른 기능 칩 자리 (docs/07 결정 3).
// 누르면 예시 답변 화면(/examples/[id], DEC-028)으로 바로 간다 — 질문 생성·분석 API를 부르지 않아 질문 횟수에 세지 않는다.
// 좁은 화면(lg 미만)은 '전체' + 예시가 많은 분야 PRIMARY_AREAS개만 보이고 나머지는 '더 보기'로 펼친다
// (2026-11-19 사용자 승인, 검색 종류 탭 시안 A와 같은 방식). 고른 분야는 접혀 있어도 늘 보인다.
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

export type FeedExample = { id: string; question: string; area: string; href: string };

/** 좁은 화면에서 늘 보이는 분야 수 ('전체' 제외) */
export const PRIMARY_AREAS = 5;

/** 예시가 많은 순(같으면 처음 나온 순)으로 앞의 n개 분야 */
export function primaryAreas(examples: { area: string }[], n = PRIMARY_AREAS): string[] {
  const count = new Map<string, number>();
  for (const e of examples) count.set(e.area, (count.get(e.area) ?? 0) + 1);
  return [...count.entries()]
    .map(([area, c], i) => ({ area, c, i }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .slice(0, n)
    .map((x) => x.area);
}

export function ExampleFeed({ examples }: { examples: FeedExample[] }) {
  const areas = useMemo(() => ["전체", ...new Set(examples.map((e) => e.area))], [examples]);
  const [area, setArea] = useState("전체");
  const [more, setMore] = useState(false);
  const primary = useMemo(() => new Set(["전체", ...primaryAreas(examples)]), [examples]);
  const restCount = areas.filter((a) => !primary.has(a) && a !== area).length;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = area === "전체" ? examples : examples.filter((e) => e.area === area);

  return (
    <section id="examples" aria-labelledby="examples-title" className="w-full text-left">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="examples-title" className="font-display text-ink text-[19px] font-bold">
          예시 답변 바로 보기
        </h2>
        <span className="text-muted text-[13px]">
          직접 작성한 가상 사연 · 질문 횟수에 포함되지 않아요
        </span>
      </div>
      {/* 분야 칩: 탭 목록. Tab으로 들어와 ←→·Home·End로 옮기면 바로 선택된다 (WAI-ARIA tabs) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <div
          role="tablist"
          aria-label="분야"
          onKeyDown={(e) => {
            const i = areas.indexOf(area);
            const next =
              e.key === "ArrowRight"
                ? (i + 1) % areas.length
                : e.key === "ArrowLeft"
                  ? (i - 1 + areas.length) % areas.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? areas.length - 1
                      : -1;
            if (next < 0) return;
            e.preventDefault();
            setArea(areas[next]);
            // 접힌 분야는 고른 뒤에 보이므로 다음 그리기 뒤에 포커스를 옮긴다
            requestAnimationFrame(() => tabs.current[next]?.focus());
          }}
          className="contents"
        >
          {areas.map((a, i) => (
            <button
              key={a}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`area-tab-${i}`}
              aria-selected={a === area}
              aria-controls="example-list"
              tabIndex={a === area ? 0 : -1}
              onClick={() => setArea(a)}
              className={`min-h-11 rounded-full border px-4 text-sm ${
                a === area ? "border-ink bg-ink text-white" : "border-line text-ink bg-white"
              } ${more || primary.has(a) || a === area ? "" : "hidden lg:inline-block"}`}
            >
              {a}
            </button>
          ))}
        </div>
        {restCount > 0 && (
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore(!more)}
            className="border-line text-muted hover:border-ink flex min-h-11 items-center gap-1 rounded-full border border-dashed bg-white px-4 text-sm lg:hidden"
          >
            {more ? "접기" : `더 보기 ${restCount}`}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className={more ? "rotate-180" : ""}
            >
              <path
                d="M3 5l4 4 4-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <div
        id="example-list"
        role="tabpanel"
        aria-labelledby={`area-tab-${areas.indexOf(area)}`}
        className="mt-4"
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                aria-label={`예시 답변 보기: ${e.question}`}
                className="rounded-card border-line hover:border-gold flex h-full w-full flex-col gap-2 border bg-white p-5 text-left transition-colors"
              >
                <span className="bg-cream text-label w-fit rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                  {e.area}
                </span>
                <span className="text-ink text-[15px] leading-relaxed">{e.question}</span>
                <span className="text-link mt-auto pt-1 text-sm">예시 답변 보기 →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
