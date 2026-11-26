"use client";
// 구조도 보기 틀 (DEC-065): 모든 구조도는 이 틀 안에 그린다 — 기본 원칙.
// - 그림을 화면 너비에 억지로 맞춰 줄이지 않는다. 글자가 읽히는 크기로 두고, 넘치면 끌어서(마우스·손가락) 옮겨 본다.
// - 확대·축소: 버튼, Ctrl(⌘) + 휠, 키보드 + / − / 0. '전체 보기'는 그림 전체가 틀에 들어오게 줄인다.
// - 그림 자체는 원래 크기(width × height)로 그리고 CSS 배율만 건다 — PNG 저장은 원래 크기 그대로 나간다.
//   children이 함수가 아니라 일반 노드라 서버 컴포넌트 안에서도 쓸 수 있다.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export const ZOOM = { min: 0.4, max: 2.5, step: 0.2, readable: 0.85 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 처음 배율: 틀 너비에 다 들어가면 그대로(최대 1), 안 들어가면 읽히는 크기(readable)까지만 줄인다 */
export function initialScale(frameWidth: number, contentWidth: number): number {
  if (frameWidth <= 0 || contentWidth <= 0) return 1;
  return clamp(frameWidth / contentWidth, ZOOM.readable, 1);
}

/** 그림 전체가 틀에 들어오는 배율 */
export function fitScale(
  frame: { width: number; height: number },
  content: { width: number; height: number },
): number {
  if (frame.width <= 0 || frame.height <= 0) return 1;
  return clamp(
    Math.min(frame.width / content.width, frame.height / content.height),
    ZOOM.min,
    ZOOM.max,
  );
}

export function ZoomPane({
  width,
  height,
  label,
  children,
  actions,
}: {
  /** 그림의 원래 크기(px) */
  width: number;
  height: number;
  /** 화면 읽기 도구용 이름 (예: "사건 구조도") */
  label: string;
  /** 원래 크기(width × height)로 그린 그림 */
  children: ReactNode;
  /** 도구 줄 오른쪽에 붙일 버튼 (이미지 저장 등) */
  actions?: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const touched = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // 처음과 틀 크기가 바뀔 때: 사용자가 배율을 만지기 전까지만 자동으로 맞춘다
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const apply = () => {
      if (!touched.current) setScale(initialScale(el.clientWidth, width));
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const zoomTo = useCallback((next: number | ((s: number) => number)) => {
    touched.current = true;
    setScale((s) => {
      const v = clamp(typeof next === "function" ? next(s) : next, ZOOM.min, ZOOM.max);
      return Math.round(v * 100) / 100;
    });
  }, []);

  // Ctrl(⌘) + 휠 확대·축소. 그냥 휠은 페이지·틀 스크롤 그대로 둔다 (passive: false가 필요해 직접 건다)
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo((s) => s + (e.deltaY < 0 ? ZOOM.step / 2 : -ZOOM.step / 2));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const fit = () => {
    const el = frame.current;
    if (!el) return;
    zoomTo(fitScale({ width: el.clientWidth, height: el.clientHeight }, { width, height }));
    el.scrollTo({ left: 0, top: 0 });
  };

  const btn =
    "rounded-button border-line text-ink flex min-h-9 min-w-9 items-center justify-center border bg-white px-2.5 text-[13px] disabled:opacity-40";

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={`${label} 보기 조절`}
        >
          <button
            type="button"
            className={btn}
            onClick={() => zoomTo((s) => s - ZOOM.step)}
            disabled={scale <= ZOOM.min}
            aria-label="축소"
          >
            −
          </button>
          <span className="text-muted w-12 text-center text-[13px] tabular-nums" aria-live="polite">
            {scale.toFixed(1)}배
          </span>
          <button
            type="button"
            className={btn}
            onClick={() => zoomTo((s) => s + ZOOM.step)}
            disabled={scale >= ZOOM.max}
            aria-label="확대"
          >
            +
          </button>
          <button type="button" className={btn} onClick={fit}>
            전체 보기
          </button>
          <button type="button" className={btn} onClick={() => zoomTo(1)}>
            원래 크기
          </button>
        </div>
        {actions}
      </div>
      <div
        ref={frame}
        role="group"
        aria-label={`${label} — 끌어서 옮기고, 확대·축소할 수 있어요`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") zoomTo((s) => s + ZOOM.step);
          else if (e.key === "-") zoomTo((s) => s - ZOOM.step);
          else if (e.key === "0") zoomTo(1);
        }}
        onPointerDown={(e) => {
          // 손가락은 브라우저 기본 스크롤을 쓴다. 마우스만 끌어서 옮긴다. 그림 안의 버튼·링크·입력은 그대로 누른다
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
          const el = e.currentTarget;
          drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
          el.setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          e.currentTarget.scrollLeft = d.left - (e.clientX - d.x);
          e.currentTarget.scrollTop = d.top - (e.clientY - d.y);
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        className={`border-line bg-soft max-h-[76vh] overflow-auto rounded-[12px] border outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
      >
        <div
          style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
          className="mx-auto"
        >
          <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            {children}
          </div>
        </div>
      </div>
      <p className="text-muted mt-1 text-[12px]">
        끌어서 옮겨 보세요. 확대·축소는 버튼이나 Ctrl + 휠로 해요.
      </p>
    </div>
  );
}
