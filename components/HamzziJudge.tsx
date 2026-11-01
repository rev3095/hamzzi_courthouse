"use client";
// 마스코트 · 햄찌 판사 (Figma 05 Components "마스코트 · 햄찌 판사"). 누르면 방망이를 두드린다.
// 항상 "AI 캐릭터"로 표기한다 (브랜드 가이드 2장). 움직임은 prefers-reduced-motion에서 꺼진다(globals.css).
import { useState } from "react";

export function HamzziJudge({
  size = 230,
  mood = "default",
  interactive = true,
  knocking = false,
}: {
  size?: number;
  mood?: "default" | "sorry";
  interactive?: boolean;
  /** 분석 중: 방망이를 계속 두드린다 */
  knocking?: boolean;
}) {
  const [knock, setKnock] = useState(0);
  const svg = (
    <svg
      width={size}
      height={(size * 200) / 230}
      viewBox="0 0 230 200"
      fill="none"
      aria-hidden="true"
      className="block"
    >
      <path
        opacity="0.07"
        d="M110 208C157.5 208 196 204.4 196 200C196 195.6 157.5 192 110 192C62.5 192 24 195.6 24 200C24 204.4 62.5 208 110 208Z"
        fill="black"
      />
      <path
        d="M238 152H206C203.8 152 202 153.8 202 156V162C202 164.2 203.8 166 206 166H238C240.2 166 242 164.2 242 162V156C242 153.8 240.2 152 238 152Z"
        fill="#6E4426"
      />
      <ellipse cx="222" cy="152" rx="20" ry="5" fill="#8A5A32" />
      {/* 귀 */}
      <circle cx="56" cy="50" r="17" fill="#E9A94B" />
      <circle cx="56" cy="50" r="9.5" fill="#F4B6B0" />
      <circle cx="144" cy="50" r="17" fill="#E9A94B" />
      <circle cx="144" cy="50" r="9.5" fill="#F4B6B0" />
      {/* 몸·머리 */}
      <ellipse cx="100" cy="148" rx="62" ry="46" fill="#E9A94B" />
      <ellipse cx="100" cy="96" rx="62" ry="54" fill="#E9A94B" />
      {/* 법복 */}
      <path
        d="M46 150C50 128 72 124 100 124C128 124 150 128 154 150L160 190H40L46 150Z"
        fill="#1A2233"
      />
      <path d="M88 124L100 142L112 124H88Z" fill="white" />
      <path d="M93 142L100 156L107 142H93Z" fill="white" />
      <circle cx="100" cy="168" r="3" fill="#C9A24A" />
      <path d="M100 124V190" stroke="#2C3850" strokeWidth="1.5" />
      {/* 얼굴 */}
      <ellipse cx="100" cy="106" rx="42" ry="30" fill="#FFF3DF" />
      <ellipse cx="78" cy="94" rx="7" ry="7.6" fill="#2A1C14" />
      <ellipse cx="122" cy="94" rx="7" ry="7.6" fill="#2A1C14" />
      <circle cx="80.5" cy="91" r="2.4" fill="white" />
      <circle cx="124.5" cy="91" r="2.4" fill="white" />
      <ellipse opacity="0.7" cx="64" cy="110" rx="10" ry="6.5" fill="#F59F95" />
      <ellipse opacity="0.7" cx="136" cy="110" rx="10" ry="6.5" fill="#F59F95" />
      <ellipse cx="100" cy="104" rx="4.2" ry="3.2" fill="#C7706A" />
      {mood === "sorry" ? (
        <path
          d="M93 114C95.3 111 97.7 110 100 110C102.3 110 104.7 111 107 114"
          stroke="#7A4A30"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M93 110C95.3 113.3 97.7 113.3 100 110C102.3 113.3 104.7 113.3 107 110"
          stroke="#7A4A30"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
      {/* 월계관 */}
      <path d="M62 54C87.3 32.7 112.7 32.7 138 54" stroke="#5B7340" strokeWidth="2.2" />
      <g fill="#6F8A4E">
        <ellipse cx="68" cy="47" rx="7.5" ry="3.3" transform="rotate(-40 68 47)" />
        <ellipse cx="78" cy="39" rx="7.5" ry="3.3" transform="rotate(-28 78 39)" />
        <ellipse cx="89" cy="34" rx="7.5" ry="3.3" transform="rotate(-12 89 34)" />
        <ellipse cx="111" cy="34" rx="7.5" ry="3.3" transform="rotate(12 111 34)" />
        <ellipse cx="122" cy="39" rx="7.5" ry="3.3" transform="rotate(28 122 39)" />
        <ellipse cx="132" cy="47" rx="7.5" ry="3.3" transform="rotate(40 132 47)" />
      </g>
      <circle cx="100" cy="31" r="3.4" fill="#C9A24A" />
      {/* 발·왼손 */}
      <ellipse cx="80" cy="192" rx="13" ry="6" fill="#F4C9A8" />
      <ellipse cx="120" cy="192" rx="13" ry="6" fill="#F4C9A8" />
      <ellipse cx="62" cy="150" rx="10" ry="8" fill="#F4C9A8" />
      {/* 방망이 + 오른손 */}
      <g
        key={knock}
        className={knocking ? "hz-gavel-loop" : knock ? "hz-gavel-knock" : undefined}
        style={{ transformOrigin: "166px 150px" }}
      >
        <rect x="164" y="94" width="8" height="62" rx="3" fill="#8A5A32" />
        <rect x="144" y="76" width="48" height="22" rx="6" fill="#6E4426" />
        <rect x="150" y="76" width="4" height="22" fill="#C9A24A" />
        <rect x="182" y="76" width="4" height="22" fill="#C9A24A" />
        <ellipse cx="166" cy="148" rx="11" ry="9" fill="#F4C9A8" />
      </g>
    </svg>
  );

  if (!interactive) return svg;
  return (
    <button
      type="button"
      onClick={() => setKnock((k) => k + 1)}
      aria-label="햄찌 판사 (AI 캐릭터) — 누르면 방망이를 두드려요"
      className="rounded-panel focus-visible:outline-gold focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {svg}
    </button>
  );
}

/** 로고 · 햄찌 얼굴 (헤더·결과·약속 배너의 아이콘 틀 안) */
export function HamzziFace({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="8" fill="#E9A94B" />
      <circle cx="16" cy="16" r="4.5" fill="#F4B6B0" />
      <circle cx="48" cy="16" r="8" fill="#E9A94B" />
      <circle cx="48" cy="16" r="4.5" fill="#F4B6B0" />
      <ellipse cx="32" cy="36" rx="25" ry="22" fill="#E9A94B" />
      <ellipse cx="32" cy="42" rx="17" ry="13" fill="#FFF3DF" />
      <circle cx="24" cy="34" r="3" fill="#2A1C14" />
      <circle cx="40" cy="34" r="3" fill="#2A1C14" />
      <circle cx="25" cy="33" r="1" fill="white" />
      <circle cx="41" cy="33" r="1" fill="white" />
      <ellipse opacity="0.7" cx="19" cy="42" rx="4" ry="2.5" fill="#F59F95" />
      <ellipse opacity="0.7" cx="45" cy="42" rx="4" ry="2.5" fill="#F59F95" />
      <ellipse cx="32" cy="40" rx="2" ry="1.5" fill="#C7706A" />
      <path d="M17 18C27 11.3 37 11.3 47 18" stroke="#5B7340" strokeWidth="2" />
      <g fill="#6F8A4E">
        <ellipse cx="21" cy="14" rx="3.2" ry="1.6" transform="rotate(-35 21 14)" />
        <ellipse cx="27" cy="11.5" rx="3.2" ry="1.6" transform="rotate(-15 27 11.5)" />
        <ellipse cx="37" cy="11.5" rx="3.2" ry="1.6" transform="rotate(15 37 11.5)" />
        <ellipse cx="43" cy="14" rx="3.2" ry="1.6" transform="rotate(35 43 14)" />
      </g>
    </svg>
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
      className={`bg-honey border-honey-line inline-flex shrink-0 items-center justify-center border ${
        rounded === "full" ? "rounded-full" : "rounded-card"
      }`}
      style={{ width: size, height: size }}
    >
      <HamzziFace size={Math.round(size * 0.78)} />
    </span>
  );
}
