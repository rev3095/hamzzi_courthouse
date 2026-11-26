// 나라 표시용 작은 국기 (DEC-074). 이모지 국기는 Windows에서 글자로만 보여 SVG로 그린다.
// 알아볼 수 있을 만큼만 단순하게 그렸고 장식이라 aria-hidden — 나라 이름은 언제나 옆에 글로 적는다(CountryLabel).
import type { ReactNode } from "react";
import { COUNTRIES, type CountryCode } from "@/lib/search/world/types";

const star = (cx: number, cy: number, r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
};

const ART: Record<CountryCode, ReactNode> = {
  kr: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <path d="M6.5 7a3.5 3.5 0 0 1 7 0z" fill="#cd2e3a" />
      <path d="M6.5 7a3.5 3.5 0 0 0 7 0z" fill="#0047a0" />
      <g stroke="#111" strokeWidth="0.9">
        <path d="M2.6 4.2l2-2.6M3.6 4.9l2-2.6" />
        <path d="M14.4 1.6l2 2.6M15.4 0.9l2 2.6" />
        <path d="M2.6 9.8l2 2.6M3.6 9.1l2 2.6" />
        <path d="M14.4 12.4l2-2.6M15.4 13.1l2-2.6" />
      </g>
    </>
  ),
  us: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <g fill="#b22234">
        <rect width="20" height="2" />
        <rect y="4" width="20" height="2" />
        <rect y="8" width="20" height="2" />
        <rect y="12" width="20" height="2" />
      </g>
      <rect width="9" height="8" fill="#3c3b6e" />
      <g fill="#fff">
        <circle cx="2" cy="2" r="0.6" />
        <circle cx="4.5" cy="2" r="0.6" />
        <circle cx="7" cy="2" r="0.6" />
        <circle cx="3.2" cy="4" r="0.6" />
        <circle cx="5.8" cy="4" r="0.6" />
        <circle cx="2" cy="6" r="0.6" />
        <circle cx="4.5" cy="6" r="0.6" />
        <circle cx="7" cy="6" r="0.6" />
      </g>
    </>
  ),
  eu: (
    <>
      <rect width="20" height="14" fill="#003399" />
      <g fill="#ffcc00">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI / 6) * i;
          return (
            <circle
              key={i}
              cx={(10 + 4.4 * Math.sin(a)).toFixed(2)}
              cy={(7 - 4.4 * Math.cos(a)).toFixed(2)}
              r="0.7"
            />
          );
        })}
      </g>
    </>
  ),
  jp: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <circle cx="10" cy="7" r="4" fill="#bc002d" />
    </>
  ),
  uk: (
    <>
      <rect width="20" height="14" fill="#012169" />
      <path d="M0 0l20 14M20 0L0 14" stroke="#fff" strokeWidth="2.8" />
      <path d="M0 0l20 14M20 0L0 14" stroke="#c8102e" strokeWidth="1" />
      <path d="M10 0v14M0 7h20" stroke="#fff" strokeWidth="4.4" />
      <path d="M10 0v14M0 7h20" stroke="#c8102e" strokeWidth="2.4" />
    </>
  ),
  ca: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect width="5" height="14" fill="#d80621" />
      <rect x="15" width="5" height="14" fill="#d80621" />
      {/* 단풍잎을 단순하게 */}
      <path
        d="M10 2.4l1 2 1.5-.6-.5 2.4 1.8-.6-.6 1.6 1 .6-2.4 1.8.3 1.2-1.8-.3V12h-.6v-1.5l-1.8.3.3-1.2L5.8 7.8l1-.6-.6-1.6 1.8.6L7.5 3.8l1.5.6z"
        fill="#d80621"
      />
    </>
  ),
  au: (
    <>
      <rect width="20" height="14" fill="#012169" />
      <g>
        <path d="M0 0l9 7M9 0L0 7" stroke="#fff" strokeWidth="1.6" />
        <path d="M4.5 0v7M0 3.5h9" stroke="#fff" strokeWidth="2.2" />
        <path d="M4.5 0v7M0 3.5h9" stroke="#c8102e" strokeWidth="1.1" />
      </g>
      <g fill="#fff">
        <polygon points={star(4.5, 10.6, 1.7)} />
        <polygon points={star(15, 2.6, 1)} />
        <polygon points={star(12.6, 6.4, 1)} />
        <polygon points={star(17.4, 5.6, 1)} />
        <polygon points={star(15, 11.2, 1)} />
      </g>
    </>
  ),
  cn: (
    <>
      <rect width="20" height="14" fill="#de2910" />
      <g fill="#ffde00">
        <polygon points={star(4, 4, 2.4)} />
        <polygon points={star(7.6, 1.6, 0.8)} />
        <polygon points={star(9, 3.4, 0.8)} />
        <polygon points={star(9, 5.6, 0.8)} />
        <polygon points={star(7.6, 7.4, 0.8)} />
      </g>
    </>
  ),
  intl: (
    <>
      <rect width="20" height="14" fill="#eef4fb" />
      <g fill="none" stroke="#2f5d9b" strokeWidth="0.9">
        <circle cx="10" cy="7" r="5" />
        <ellipse cx="10" cy="7" rx="2.2" ry="5" />
        <path d="M5 7h10M6 4.2h8M6 9.8h8" />
      </g>
    </>
  ),
};

export function Flag({ country, className = "" }: { country: CountryCode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-flag={country}
      viewBox="0 0 20 14"
      width="20"
      height="14"
      className={`border-line inline-block shrink-0 rounded-[2px] border ${className}`}
    >
      {ART[country]}
    </svg>
  );
}

/** 국기 + 나라 이름. 색·그림만으로 나라를 알리지 않게 이름을 항상 함께 적는다 */
export function CountryLabel({
  country,
  className = "",
}: {
  country: CountryCode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Flag country={country} />
      <span>{COUNTRIES[country].name}</span>
    </span>
  );
}
