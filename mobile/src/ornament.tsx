// 아테네 신전 장식 (DEC-049). 그림 파일 없이 SVG로 그려 인터넷 없이도 그대로 보인다. 모두 꾸밈이라 화면 낭독에서 뺀다.
import type { ReactNode } from "react";

/** 박공(삼각 지붕) + 기둥머리 띠. 화면 머리 장식 */
export function Pediment({ label }: { label?: string }) {
  return (
    <svg className="pediment" viewBox="0 0 360 96" role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id="pd-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#ece4d2" />
        </linearGradient>
      </defs>
      <path d="M180 6 344 70H16Z" fill="url(#pd-stone)" stroke="#c9b27a" strokeWidth="1.5" />
      <path d="M180 20 300 64H60Z" fill="none" stroke="#dccb9f" strokeWidth="1" />
      {/* 꼭대기·모서리 장식 */}
      <circle cx="180" cy="6" r="4" fill="#c9a654" />
      <path d="M12 70q-6-10 4-14M348 70q6-10-4-14" fill="none" stroke="#c9a654" strokeWidth="2" />
      {/* 저울 */}
      <g stroke="#a9873c" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M180 34v22M166 38h28M172 56h16" />
        <path d="M166 38l-6 11h12zM194 38l-6 11h12z" fill="#f3e6c2" />
      </g>
      <rect x="10" y="70" width="340" height="8" fill="#f3ecdb" stroke="#c9b27a" strokeWidth="1" />
      <rect
        x="4"
        y="78"
        width="352"
        height="12"
        rx="1"
        fill="#fffdf8"
        stroke="#c9b27a"
        strokeWidth="1"
      />
      {label && (
        <text
          x="180"
          y="87.5"
          textAnchor="middle"
          fontFamily="Cinzel, 'Noto Serif KR', serif"
          fontSize="7.5"
          letterSpacing="3.2"
          fill="#8a6f33"
        >
          {label}
        </text>
      )}
    </svg>
  );
}

/** 월계관 테두리 — 가운데에 그림(마스코트·아이콘)을 둔다 */
export function Laurel({ children, size = 96 }: { children: ReactNode; size?: number }) {
  const leaves = Array.from({ length: 9 }, (_, i) => i);
  return (
    <span className="laurel" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="presentation" aria-hidden="true">
        {[1, -1].map((side) => (
          <g key={side} transform={side === 1 ? undefined : "translate(100 0) scale(-1 1)"}>
            {leaves.map((i) => {
              const a = (200 + i * 17) * (Math.PI / 180);
              const x = 50 + Math.cos(a) * 44;
              const y = 50 - Math.sin(a) * 44;
              return (
                <ellipse
                  key={i}
                  cx={x}
                  cy={y}
                  rx="7.5"
                  ry="3.1"
                  fill={i % 2 ? "#8ba565" : "#6f8a4e"}
                  transform={`rotate(${-(200 + i * 17) + 62} ${x} ${y})`}
                />
              );
            })}
          </g>
        ))}
        <path
          d="M44 95q6 3 12 0"
          stroke="#a9873c"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
      <span className="laurel-in">{children}</span>
    </span>
  );
}

/** 구획 사이 장식 줄: 가는 금선 + 가운데 마름모 */
export function Divider() {
  return (
    <div className="divider" aria-hidden="true">
      <span />
      <i />
      <span />
    </div>
  );
}

type IconName =
  | "temple"
  | "scroll"
  | "column"
  | "agora"
  | "wreath"
  | "scales"
  | "search"
  | "pen"
  | "book"
  | "spark"
  | "back"
  | "arrow"
  | "seed"
  | "shield"
  | "chat"
  | "link"
  | "check"
  | "bolt";

const PATHS: Record<IconName, ReactNode> = {
  temple: (
    <>
      <path d="M3 9.5 12 4l9 5.5z" />
      <path d="M5 12v6M9.5 12v6M14.5 12v6M19 12v6M3 20.5h18M4 9.5h16" />
    </>
  ),
  scroll: (
    <>
      <path d="M7 4h11a2 2 0 0 1 2 2v1H9V6a2 2 0 0 0-4 0v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7" />
      <path d="M9.5 11h6M9.5 14.5h6" />
    </>
  ),
  column: (
    <>
      <path d="M6 4h12M7 7h10M6 20.5h12M7.5 17.5h9" />
      <path d="M8.5 7v10.5M12 7v10.5M15.5 7v10.5" />
    </>
  ),
  agora: (
    <>
      <path d="M4 6.5h11a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H10L6.5 18v-3.5H4A1.5 1.5 0 0 1 2.5 13V8A1.5 1.5 0 0 1 4 6.5z" />
      <path d="M18.5 10.5H20a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 20 17.5h-1v2.5l-3-2.5h-3" />
    </>
  ),
  wreath: (
    <>
      <path d="M12 20c-5 0-8-3.6-8-8 0-2.6 1.2-4.8 3-6.2M12 20c5 0 8-3.6 8-8 0-2.6-1.2-4.8-3-6.2" />
      <path d="M6.2 9.2 4 8.6M5.2 12.6 3 12.8M6.6 15.8l-2 1M17.8 9.2l2.2-.6M18.8 12.6l2.2.2M17.4 15.8l2 1" />
      <circle cx="12" cy="10.5" r="2.2" />
    </>
  ),
  scales: (
    <>
      <path d="M12 4v15.5M8 20h8M5 7.5h14" />
      <path d="M5 7.5 2.5 13h5zM19 7.5 16.5 13h5z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  pen: (
    <path d="M4 20l1-4.5L16.5 4a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19zM14.5 6l3.5 3.5" />
  ),
  book: (
    <>
      <path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.500 4.500-2 8-2v-13c-3.500 0-6 .5-8 2z" />
      <path d="M12 6.500v13" />
    </>
  ),
  spark: (
    <path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM18.500 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  ),
  back: <path d="M14.500 5 8 12l6.500 7" />,
  arrow: <path d="M9.500 5 16 12l-6.500 7" />,
  seed: (
    <>
      <path d="M12 21c-4.500-2.500-6.500-6-6.500-9.500C5.500 7 8.500 4 12 3c3.500 1 6.500 4 6.500 8.500 0 3.500-2 7-6.500 9.500z" />
      <path d="M12 21V10M12 14l3-3M12 12.500 9.500 10" />
    </>
  ),
  shield: (
    <path d="M12 3.500 19 6v5.500c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6zM9 12l2.200 2.200L15.200 10" />
  ),
  chat: (
    <path d="M5 5.500h14a1.500 1.500 0 0 1 1.500 1.500v8a1.500 1.500 0 0 1-1.500 1.500h-6.500L8 20v-3.500H5A1.500 1.500 0 0 1 3.500 15V7A1.500 1.500 0 0 1 5 5.500z" />
  ),
  link: (
    <path d="M10 14 20 4M14 4h6v6M18 13.500V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.500" />
  ),
  check: <path d="m5 12.500 4.500 4.500L19 7.500" />,
  bolt: <path d="M13 3 5 13.500h6L10.500 21l8-10.500h-6z" />,
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
