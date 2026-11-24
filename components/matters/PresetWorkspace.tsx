"use client";
// 가상 사건 프리셋 (DEC-061): 로그인하지 않은 사람에게 '사건 분석' 기능을 미리 채운 가상 사건으로 보여 준다.
// 탭·구조도·노트는 로그인 화면과 같은 컴포넌트를 쓰고, 고친 내용은 이 화면 메모리에만 둔다(서버에 저장하지 않음).
// AI 기능 버튼은 서버가 로그인을 요구해 "로그인이 필요해요"로 끝난다 — 판례 검색처럼 로그인이 필요 없는 기능은 그대로 쓴다.
import { useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import type { MatterData, MatterParty } from "@/lib/matters/model";
import { MATTER_PRESETS, PRESET_NOTICE } from "@/lib/matters/presets";
import { GoogleLoginButton } from "../LimitNotice";
import { ResearchTab, type ResearchSeed } from "./ResearchTab";
import { StructureMap } from "./StructureMap";
import { DocsTab, FactsTab, IssuesTab, NotesTab, OverviewTab, type TabKey } from "./tabs";
import { btn, btnLine } from "./ui";

const TABS: { key: TabKey; name: string }[] = [
  { key: "overview", name: "개요" },
  { key: "docs", name: "자료" },
  { key: "facts", name: "사실관계" },
  { key: "map", name: "구조도" },
  { key: "issues", name: "쟁점" },
  { key: "research", name: "리서치" },
  { key: "notes", name: "노트" },
];

export function PresetWorkspace() {
  const [at, setAt] = useState(0);
  // 고친 내용은 프리셋별로 이 화면 메모리에만 둔다
  const [edits, setEdits] = useState<Record<string, MatterData>>({});
  const [tab, setTab] = useState<TabKey>("overview");
  const [seed, setSeed] = useState<ResearchSeed>({});
  const [noteSeed, setNoteSeed] = useState<{ partyId: string; name: string } | null>(null);
  const preset = MATTER_PRESETS[at];
  if (!preset) return null;
  const data = edits[preset.id] ?? preset.data;
  const update = (fn: (d: MatterData) => MatterData) =>
    setEdits((e) => ({ ...e, [preset.id]: fn(e[preset.id] ?? preset.data) }));
  const go = (t: TabKey) => setTab(t);
  const toCompany = (p: MatterParty) => {
    setSeed({ company: { name: p.name, partyId: p.id } });
    setTab("research");
  };
  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ title: preset.title, data }, null, 1)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "matter.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <section
        aria-label="가상 사건 안내"
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--line)] bg-white px-4 py-3"
      >
        <div className="min-w-0">
          <p className="text-ink text-[14px] font-bold">가상 사건으로 둘러보기</p>
          <p className="text-muted mt-0.5 text-[13px] leading-relaxed">{PRESET_NOTICE}</p>
          <p className="text-muted mt-0.5 text-[12px]">{AI_NOTICE}</p>
        </div>
        <GoogleLoginButton next="/matters" />
      </section>
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="가상 사건">
          <ul className="space-y-1.5" data-testid="preset-list">
            {MATTER_PRESETS.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAt(i);
                    setTab("overview");
                    setSeed({});
                    setNoteSeed(null);
                  }}
                  aria-current={i === at}
                  className={`w-full rounded-[6px] border px-3 py-2 text-left ${
                    i === at
                      ? "border-ink bg-ink text-white"
                      : "border-line text-ink hover:border-ink bg-white"
                  }`}
                >
                  <span className="block truncate text-[14px] font-semibold">{p.title}</span>
                  <span
                    className={`block text-[12px] ${i === at ? "text-white/70" : "text-muted"}`}
                  >
                    자료 {p.data.docs.length} · 당사자 {p.data.parties.length} · 쟁점{" "}
                    {p.data.issues.length} · 노트 {p.data.notes.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0">
          <h2 className="text-ink min-w-0 truncate text-[20px] font-bold">{preset.title}</h2>
          <div
            className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
            role="tablist"
            aria-label="사건 진행 단계"
          >
            {TABS.map((t, i) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`${tab === t.key ? btn : btnLine} shrink-0 whitespace-nowrap`}
              >
                {i > 0 && <span className="mr-1 opacity-60">{i}</span>}
                {t.name}
              </button>
            ))}
          </div>
          <div className="mt-4" role="tabpanel" key={preset.id}>
            {tab === "overview" && (
              <OverviewTab data={data} update={update} go={go} onExport={exportFile} />
            )}
            {tab === "docs" && <DocsTab data={data} update={update} go={go} />}
            {tab === "facts" && <FactsTab data={data} update={update} />}
            {tab === "map" && (
              <StructureMap
                data={data}
                update={update}
                onCompany={toCompany}
                onSearch={(query) => {
                  setSeed({ query });
                  setTab("research");
                }}
                onNote={(p) => {
                  setNoteSeed({ partyId: p.id, name: p.name });
                  setTab("notes");
                }}
              />
            )}
            {tab === "issues" && <IssuesTab matterId={preset.id} data={data} update={update} />}
            {tab === "research" && (
              <ResearchTab
                key={`${seed.company?.partyId ?? ""}|${seed.query ?? ""}`}
                matterId={preset.id}
                data={data}
                update={update}
                seed={seed}
                onSaved={() => setNoteSeed(null)}
              />
            )}
            {tab === "notes" && (
              <NotesTab
                key={noteSeed?.partyId ?? "notes"}
                data={data}
                update={update}
                seed={noteSeed}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
