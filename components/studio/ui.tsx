"use client";
// 편집기 공용 조각: 분할 버튼, 선 아이콘(브랜드 가이드 3.5 — 선 두께 2, 끝 둥글게)

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  /** 바깥에 제목이 따로 있으면 안쪽 이름표를 숨긴다 */
  hideLabel?: boolean;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
      {!hideLabel && <span className="text-muted hidden text-xs sm:inline">{label}</span>}
      <div className="bg-soft border-line flex max-w-full overflow-x-auto rounded-[10px] border p-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={`min-h-9 shrink-0 rounded-[8px] px-3 text-[13px] whitespace-nowrap transition-colors ${
                on ? "text-ink bg-white font-semibold shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const icon = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const UploadIcon = () => (
  <svg {...icon} width={26} height={26}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);
export const UndoIcon = () => (
  <svg {...icon}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const CheckIcon = () => (
  <svg {...icon} width={16} height={16}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const WarnIcon = () => (
  <svg {...icon} width={16} height={16}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);
export const ExternalIcon = () => (
  <svg {...icon} width={15} height={15}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
