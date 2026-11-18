"use client";
// 검색 종류 탭 (/search·/research 공용, F-003·DEC-029). 2026-11-18 사용자 승인 시안 A:
// 모바일은 주요 4개(판례·법령해석례·헌재 결정례·자치법규) + '더 보기'를 누르면 묶음별(재결례·해석례·위원회 결정문·
// 법규·기타) 목록이 탭 아래에 펼쳐진다. 숨긴 종류를 고르면 '더 보기' 자리에 그 이름이 보인다.
// 데스크톱(lg 이상)은 종류 탭 전체를 그대로 보인다. 색은 브랜드 토큰만 쓴다 (새 토큰 없음).
import { useId, useState } from "react";
import type { DecisionDomain } from "@/lib/client/api";

export type SearchKind = "cases" | DecisionDomain | "ordinances" | "admin_rules";

/** 모바일에서 늘 보이는 종류 */
export const PRIMARY_KINDS: SearchKind[] = [
  "cases",
  "interpretation",
  "constitutional",
  "ordinances",
];

/** '더 보기' 묶음. 여기에 없는 새 종류는 마지막 묶음(법규·기타)에 들어간다 */
const GROUPS: { title: string; kinds: SearchKind[] }[] = [
  { title: "재결례", kinds: ["admin_appeal", "tax_tribunal", "appeal_review", "acr_special"] },
  { title: "해석례", kinds: ["customs", "nts"] },
  { title: "위원회 결정문", kinds: ["ftc", "pipc", "nlrc", "acr"] },
  {
    title: "법규·기타",
    kinds: ["admin_rules", "treaty", "school", "public_corp", "public_inst", "english_law"],
  },
];

/** 주요 종류를 뺀 나머지를 묶음별로 (목록에 있는 종류만, 순서는 GROUPS) */
export function moreGroups<K extends SearchKind>(
  kinds: { kind: K; label: string }[],
): { title: string; items: { kind: K; label: string }[] }[] {
  const rest = kinds.filter((k) => !PRIMARY_KINDS.includes(k.kind));
  const grouped = new Set(GROUPS.flatMap((g) => g.kinds));
  return GROUPS.map((g, i) => ({
    title: g.title,
    // 묶음 안 순서는 GROUPS를 따르고, 묶음에 없는 새 종류는 마지막 묶음 끝에 붙인다
    items: [
      ...g.kinds.flatMap((kind) => rest.filter((k) => k.kind === kind)),
      ...(i === GROUPS.length - 1 ? rest.filter((k) => !grouped.has(k.kind)) : []),
    ],
  })).filter((g) => g.items.length > 0);
}

const STYLE = {
  light: {
    tab: "rounded-full border px-4",
    on: "border-gold bg-cream text-ink",
    off: "border-line text-muted hover:border-gold bg-white",
    panel: "rounded-card border-line bg-soft border",
    title: "text-muted",
  },
  dark: {
    tab: "rounded-[8px] px-3.5",
    on: "text-ink bg-white",
    off: "bg-white/10 text-white hover:bg-white/20",
    panel: "rounded-card border border-white/15 bg-white/5",
    title: "text-white/70",
  },
} as const;

export function KindTabs<K extends SearchKind>({
  kinds,
  value,
  onChange,
  label,
  variant = "light",
}: {
  kinds: { kind: K; label: string }[];
  value: K;
  onChange: (kind: K) => void;
  /** tablist 이름 (예: "검색 종류") */
  label: string;
  /** light = /search 흰 패널, dark = /research 어두운 상단 띠 */
  variant?: "light" | "dark";
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const s = STYLE[variant];
  const groups = moreGroups(kinds);
  const restCount = groups.reduce((n, g) => n + g.items.length, 0);
  const hiddenPicked = !PRIMARY_KINDS.includes(value) ? kinds.find((k) => k.kind === value) : null;
  const chip = (on: boolean) =>
    `flex min-h-11 items-center text-sm font-semibold ${s.tab} ${on ? s.on : s.off}`;
  const pick = (k: K) => {
    setOpen(false);
    onChange(k);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <div role="tablist" aria-label={label} className="contents">
          {kinds.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={value === k.kind}
              onClick={() => pick(k.kind)}
              // 주요 종류가 아니면 모바일에서는 '더 보기' 안에서 고른다
              className={`${chip(value === k.kind)} ${PRIMARY_KINDS.includes(k.kind) ? "" : "hidden lg:flex"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {restCount > 0 && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className={`${chip(Boolean(hiddenPicked))} gap-1 lg:hidden`}
          >
            {hiddenPicked ? hiddenPicked.label : `더 보기 ${restCount}`}
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className={open ? "rotate-180" : ""}
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
      {open && (
        <div id={panelId} className={`mt-3 px-4 py-3 lg:hidden ${s.panel}`}>
          {groups.map((g) => (
            <section key={g.title} aria-label={g.title} className="mt-2 first:mt-0">
              <h3 className={`text-[13px] font-semibold ${s.title}`}>{g.title}</h3>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {g.items.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    aria-pressed={value === k.kind}
                    onClick={() => pick(k.kind)}
                    className={chip(value === k.kind)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
