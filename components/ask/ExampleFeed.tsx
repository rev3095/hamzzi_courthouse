"use client";
// 분야별 예시 질문 피드 (S-01, DEC-012 — 직접 작성한 가상 사연). D+의 빠른 기능 칩 자리 (docs/07 결정 3).
// 누르면(마우스·Enter·Space) 질문창에 채우고 바로 보낸다. 무료 모드에서는 미리 검증해 둔 분석을 재생한다 (DEC-015).
import { useMemo, useRef, useState } from "react";

export type FeedExample = { id: string; question: string; area: string };

export function ExampleFeed({
  examples,
  onPick,
  disabled,
}: {
  examples: FeedExample[];
  onPick: (question: string) => void;
  disabled?: boolean;
}) {
  const areas = useMemo(() => ["전체", ...new Set(examples.map((e) => e.area))], [examples]);
  const [area, setArea] = useState("전체");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = area === "전체" ? examples : examples.filter((e) => e.area === area);

  return (
    <section id="examples" aria-labelledby="examples-title" className="w-full text-left">
      <div className="flex items-baseline gap-2">
        <h2 id="examples-title" className="font-display text-ink text-[19px] font-bold">
          예시 질문
        </h2>
        <span className="text-muted text-[13px]">직접 작성한 가상 사연</span>
      </div>
      {/* 분야 칩: 탭 목록. Tab으로 들어와 ←→·Home·End로 옮기면 바로 선택된다 (WAI-ARIA tabs) */}
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
          tabs.current[next]?.focus();
        }}
        className="mt-3 flex flex-wrap gap-2"
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
            }`}
          >
            {a}
          </button>
        ))}
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
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(e.question)}
                aria-label={`예시 질문으로 시작: ${e.question}`}
                className="rounded-card border-line hover:border-gold flex h-full w-full flex-col gap-2 border bg-white p-5 text-left transition-colors disabled:opacity-60"
              >
                <span className="bg-cream text-label w-fit rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                  {e.area}
                </span>
                <span className="text-ink text-[15px] leading-relaxed">{e.question}</span>
                <span className="text-link mt-auto pt-1 text-sm">이 질문으로 시작 →</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
