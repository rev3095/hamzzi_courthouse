"use client";
// 햄찌법원 편집기 (/studio, 개발 전용). 사이트 머리·꼬리를 덮는 전체 화면 작업 공간.
// 탭: 마스코트 리소스(상태별 그림) · 발표 자료 디자인(claude.ai 아티팩트에서 옮겨 옴)
import { useEffect, useState } from "react";
import { HamzziBadge } from "../HamzziJudge";
import { DeckDesigner } from "./DeckDesigner";
import { MascotStudio } from "./MascotStudio";
import { ExternalIcon } from "./ui";

const TABS = [
  { key: "mascot", label: "마스코트 리소스" },
  { key: "deck", label: "발표 자료 디자인" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function Studio() {
  const [tab, setTab] = useState<Tab>("mascot");

  // 주소 #deck 으로 바로 열기
  useEffect(() => {
    const fromHash = () => setTab(window.location.hash === "#deck" ? "deck" : "mascot");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "deck" ? "#deck" : window.location.pathname);
  };

  return (
    <div className="bg-bg fixed inset-0 z-50 flex flex-col overflow-y-auto lg:overflow-hidden">
      <header className="border-line sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-6 border-b bg-white px-4 lg:px-6">
        <div className="flex h-14 items-center gap-2.5">
          <HamzziBadge size={32} rounded="card" />
          <h1 className="font-display text-ink text-[17px] font-black whitespace-nowrap">
            햄찌법원 편집기
          </h1>
          <span className="bg-cream text-label rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">
            개발 전용
          </span>
        </div>
        <nav
          role="tablist"
          aria-label="편집기"
          className="-mb-px flex h-14 items-stretch gap-1 max-sm:order-3 max-sm:h-11 max-sm:w-full"
        >
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => go(t.key)}
                className={`border-b-2 px-3 text-[14px] whitespace-nowrap transition-colors ${
                  on
                    ? "border-ink text-ink font-semibold"
                    : "text-muted hover:text-ink border-transparent"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="text-muted hover:text-ink ml-auto flex min-h-11 items-center gap-1.5 text-[13px]"
        >
          사이트 열기
          <ExternalIcon />
        </a>
      </header>
      <main className="flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        {tab === "mascot" ? (
          <MascotStudio />
        ) : (
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
            <DeckDesigner />
          </div>
        )}
      </main>
    </div>
  );
}
