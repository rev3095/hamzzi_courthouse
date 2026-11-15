"use client";
// 마스코트 · 햄찌 판사 (Figma 05 Components "마스코트 · 햄찌 판사"). 누르면 몸을 흔들며 두드리는 동작을 한다.
// 항상 "AI 캐릭터"로 표기한다 (브랜드 가이드 2장). 움직임은 prefers-reduced-motion에서 꺼진다(globals.css).
// 그림: public/mascot/hamzzi-judge.webp (전신, 480×635) · hamzzi-face.webp (얼굴, 160×160)
import Image from "next/image";
import { useState } from "react";

const JUDGE_W = 480;
const JUDGE_H = 635;

export function HamzziJudge({
  size = 230,
  interactive = true,
  knocking = false,
}: {
  size?: number;
  /** 표정. 지금은 그림이 한 장이라 모든 표정이 같다 (상태별 그림은 리소스 편집기에서 추가 예정) */
  mood?: "default" | "sorry";
  interactive?: boolean;
  /** 분석 중: 두드리는 동작을 계속한다 */
  knocking?: boolean;
}) {
  const [knock, setKnock] = useState(0);
  const img = (
    <Image
      key={knock}
      src="/mascot/hamzzi-judge.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={Math.round((size * JUDGE_H) / JUDGE_W)}
      priority={interactive}
      draggable={false}
      className={`block select-none ${knocking ? "hz-judge-loop" : knock ? "hz-judge-knock" : ""}`}
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
