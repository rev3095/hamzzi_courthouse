"use client";
// 사건 한 건의 화면 (F-016, DEC-053) — 내 사건과 가상 사건(DEC-061)이 같은 판을 쓴다.
// 머리 패널(사건 이름 + 진행 단계)과 그 단계의 내용 하나만 보인다. 단계는 세 묶음(모으기 → 정리하기 → 찾고 기록하기)으로 나눠
// 처음 보는 사람도 왼쪽에서 오른쪽으로 따라가면 되게 하고, 내용 아래에 이전·다음 단계를 둔다 (2026-11-26 사용자 요청).
// 정리 도구다: 머리의 숫자는 담긴 항목 수일 뿐 평가가 아니다 (절대 규칙 2).
import { useRef, useState, type ReactNode } from "react";
import type { MatterData, MatterParty } from "@/lib/matters/model";
import { ResearchTab, type ResearchSeed } from "./ResearchTab";
import { StructureMap } from "./StructureMap";
import { DocsTab, FactsTab, IssuesTab, NotesTab, OverviewTab, type TabKey } from "./tabs";
import { btnLine } from "./ui";
import { pillTab } from "@/components/ui/styles";

/** 진행 단계 묶음. 화면에 보이는 메뉴 글자는 여기 한 곳에서만 관리한다 */
export const STAGES: { label: string; tabs: { key: TabKey; name: string }[] }[] = [
  { label: "한눈에", tabs: [{ key: "overview", name: "개요" }] },
  {
    label: "1 모으기",
    tabs: [
      { key: "docs", name: "자료" },
      { key: "facts", name: "사실관계" },
    ],
  },
  {
    label: "2 정리하기",
    tabs: [
      { key: "map", name: "구조도" },
      { key: "issues", name: "쟁점" },
    ],
  },
  {
    label: "3 찾고 기록하기",
    tabs: [
      { key: "research", name: "리서치" },
      { key: "notes", name: "노트" },
    ],
  },
];
const ORDER = STAGES.flatMap((s) => s.tabs);

export function MatterBoard({
  id,
  title,
  data,
  update,
  firstTab = "overview",
  onBack,
  status,
  banner,
  onDelete,
}: {
  id: string;
  title: string;
  data: MatterData;
  update: (fn: (d: MatterData) => MatterData) => void;
  firstTab?: TabKey;
  onBack: () => void;
  /** 머리 패널 오른쪽 위 (저장 상태 등) */
  status?: ReactNode;
  /** 머리 패널 아래 안내 (가상 사건 안내 등) */
  banner?: ReactNode;
  /** 있으면 개요 아래에 사건 지우기를 둔다 */
  onDelete?: () => void;
}) {
  const [tab, setTab] = useState<TabKey>(firstTab);
  const [seed, setSeed] = useState<ResearchSeed>({});
  const [noteSeed, setNoteSeed] = useState<{ partyId: string; name: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const toCompany = (p: MatterParty) => {
    setSeed({ company: { name: p.name, partyId: p.id } });
    setTab("research");
  };
  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ title, data }, null, 1)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "matter.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const at = ORDER.findIndex((t) => t.key === tab);
  const prev = ORDER[at - 1];
  const next = ORDER[at + 1];
  const step = (key: TabKey) => {
    setTab(key);
    top.current?.scrollIntoView?.({ block: "start" });
  };

  return (
    <div ref={top} className="scroll-mt-4">
      <section
        aria-label="사건"
        className="rounded-panel border-line border bg-white px-[18px] py-[18px] lg:px-8 lg:py-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted hover:text-ink min-h-11 text-[14px] font-semibold underline-offset-4 hover:underline"
          >
            ← 사건 목록
          </button>
          {status}
        </div>
        <h1 className="font-display text-ink mt-1 truncate text-[24px] font-bold lg:text-[28px]">
          {title}
          {data.titleAuto && data.auto && (
            <span
              className="text-label ml-2 align-middle font-sans text-[12px] font-semibold"
              title="AI가 사건 자료를 읽고 지은 이름이에요"
            >
              AI 제목
            </span>
          )}
        </h1>
        <p className="text-muted mt-1 text-[13px]">
          자료 {data.docs.length} · 사실 {data.facts.length} · 당사자 {data.parties.length} · 쟁점{" "}
          {data.issues.length} · 노트 {data.notes.length}
        </p>
        <div
          role="tablist"
          aria-label="사건 진행 단계"
          className="mt-4 flex gap-5 overflow-x-auto pb-1"
        >
          {STAGES.map((s) => (
            <div key={s.label} role="presentation" className="shrink-0">
              <p className="text-muted text-[12px] font-bold">{s.label}</p>
              <div role="presentation" className="mt-1.5 flex gap-1.5">
                {s.tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={pillTab(tab === t.key)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {banner}

      <div className="mt-5" role="tabpanel">
        {tab === "overview" && (
          <OverviewTab
            data={data}
            update={update}
            go={setTab}
            onExport={exportFile}
            onDelete={onDelete}
          />
        )}
        {tab === "docs" && <DocsTab data={data} update={update} go={setTab} />}
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
        {tab === "issues" && <IssuesTab matterId={id} data={data} update={update} />}
        {tab === "research" && (
          <ResearchTab
            key={`${seed.company?.partyId ?? ""}|${seed.query ?? ""}`}
            matterId={id}
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

      <nav
        aria-label="이전·다음 단계"
        className="border-line mt-6 flex items-center justify-between gap-2 border-t pt-4"
      >
        {prev ? (
          <button type="button" className={btnLine} onClick={() => step(prev.key)}>
            ← {prev.name}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button type="button" className={btnLine} onClick={() => step(next.key)}>
            다음: {next.name} →
          </button>
        )}
      </nav>
    </div>
  );
}
