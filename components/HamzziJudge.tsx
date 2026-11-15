"use client";
// 마스코트 · 햄찌 판사 (Figma 05 Components "마스코트 · 햄찌 판사"). 누르면 몸을 흔들며 두드리는 동작을 한다.
// 항상 "AI 캐릭터"로 표기한다 (브랜드 가이드 2장). 움직임은 prefers-reduced-motion에서 꺼진다(globals.css).
// 그림: 상태별 그림(lib/mascot/moods.ts, /studio 편집기로 교체) → 없으면 public/mascot/hamzzi-judge.webp (전신, 480×635)
// 얼굴: hamzzi-face.webp (160×160)
import Image from "next/image";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_MASCOT_SRC, MASCOT_SIZE, mascotSrc, type MascotMood } from "@/lib/mascot/moods";

/** 편집기 미리보기용: 상태별 그림 주소를 저장 전 그림으로 바꿔 보여 준다. 일반 화면에서는 쓰지 않는다 */
const MascotPreview = createContext<Partial<Record<MascotMood, string>> | null>(null);

export function MascotPreviewProvider({
  srcs,
  children,
}: {
  srcs: Partial<Record<MascotMood, string>>;
  children: ReactNode;
}) {
  return <MascotPreview.Provider value={srcs}>{children}</MascotPreview.Provider>;
}

export function HamzziJudge({
  size = 230,
  mood = "default",
  interactive = true,
  knocking = false,
}: {
  size?: number;
  /** 화면 상황에 맞는 상태 (브랜드 가이드 2.3). 그 상태 그림이 없으면 기본 그림 */
  mood?: MascotMood;
  interactive?: boolean;
  /** 분석 중: 두드리는 동작을 계속한다 */
  knocking?: boolean;
}) {
  const [knock, setKnock] = useState(0);
  const preview = useContext(MascotPreview);
  const wanted = preview?.[mood] ?? mascotSrc(mood);
  // 상태 그림 파일이 없거나 깨졌으면 기본 그림으로 (한 번만)
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed === wanted ? DEFAULT_MASCOT_SRC : wanted;
  // 민감 사건(차분)은 움직이지 않는다 (브랜드 가이드 2.4)
  const still = mood === "calm";
  const img = (
    <Image
      key={`${src}-${knock}`}
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * MASCOT_SIZE.height) / MASCOT_SIZE.width)}
      priority={interactive}
      unoptimized={!src.startsWith("/mascot/")}
      draggable={false}
      onError={() => src !== DEFAULT_MASCOT_SRC && setFailed(wanted)}
      className={`block select-none ${
        still ? "" : knocking ? "hz-judge-loop" : knock ? "hz-judge-knock" : ""
      }`}
      style={{ transformOrigin: "50% 100%" }}
    />
  );

  if (!interactive) return img;
  return (
    <button
      type="button"
      onClick={() => setKnock((k) => k + 1)}
      aria-label="햄찌 판사 (AI 캐릭터) — 누르면 방망이를 두드려요"
      className="rounded-panel focus-visible:outline-gold focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {img}
    </button>
  );
}

/** 로고 · 햄찌 얼굴 (헤더·결과·약속 배너의 아이콘 틀 안) */
export function HamzziFace({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/mascot/hamzzi-face.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className="block rounded-full select-none"
    />
  );
}

/** 아이콘 틀 안의 햄찌 얼굴 (꿀색 원·사각 배경) */
export function HamzziBadge({
  size = 52,
  rounded = "full",
}: {
  size?: number;
  rounded?: "full" | "card";
}) {
  return (
    <span
      className={`bg-honey border-honey-line inline-flex shrink-0 items-center justify-center overflow-hidden border ${
        rounded === "full" ? "rounded-full" : "rounded-card"
      }`}
      style={{ width: size, height: size }}
    >
      <HamzziFace size={Math.round(size * 0.9)} />
    </span>
  );
}
