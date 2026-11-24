"use client";
// 사건 진행 화면 /matters (F-016, DEC-053) — 변호사가 맡은 사건을 진행 순서대로 정리하는 도구.
// 자료(서류 읽기) → 사실관계 → 구조도 → 쟁점 → 리서치 → 노트. 로그인 사용자만 쓰고 사건 자료는 계정에 저장된다.
// 판단 도구가 아니라 정리 도구다: 승패·유불리·책임 비율 같은 판정을 보여 주지 않는다 (절대 규칙 2).
// 화면은 흑백 업무용 톤(판례 리서치와 같은 결)이고, 자세한 내용은 마우스를 올리거나 눌러 펼친다.
import { useCallback, useEffect, useRef, useState } from "react";
import { isSignedIn } from "@/lib/client/api";
import {
  createMatter,
  deleteMatter,
  getMatter,
  listMatters,
  matterErrorText,
  saveMatter,
  type LoadedMatter,
} from "@/lib/client/matters";
import type { MatterData, MatterParty, MatterSummary } from "@/lib/matters/model";
import { GoogleLoginButton } from "../LimitNotice";
import { useQuota } from "../useQuota";
import { ResearchTab, type ResearchSeed } from "./ResearchTab";
import { StructureMap } from "./StructureMap";
import { DocsTab, FactsTab, IssuesTab, NotesTab, OverviewTab, type TabKey } from "./tabs";
import { ConfirmButton, Empty, btn, btnLine, field } from "./ui";

const TABS: { key: TabKey; name: string }[] = [
  { key: "overview", name: "개요" },
  { key: "docs", name: "자료" },
  { key: "facts", name: "사실관계" },
  { key: "map", name: "구조도" },
  { key: "issues", name: "쟁점" },
  { key: "research", name: "리서치" },
  { key: "notes", name: "노트" },
];

type Save = "idle" | "saving" | "saved" | "failed";

export function MattersView() {
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  return (
    <div className="bg-soft flex-1">
      <div className="bg-ink text-white">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-6 lg:py-8">
          <p className="text-xs font-bold tracking-[0.14em] text-white/70">CASE WORKSPACE</p>
          <h1 className="font-display mt-1 text-[26px] font-bold">사건 진행</h1>
          <p className="mt-1 text-sm text-white/75">
            서류를 읽어 사실관계·당사자·쟁점으로 나누고, 찾은 내용을 계속 덧붙이는 정리 도구예요.
            판단은 하지 않아요.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1320px] px-4 py-6">
        {quota === null ? (
          <p className="text-muted text-sm" aria-live="polite">
            불러오는 중…
          </p>
        ) : signedIn ? (
          <Workspace />
        ) : (
          <div className="mx-auto max-w-[440px] rounded-[8px] border border-[var(--line)] bg-white p-6">
            <h2 className="text-ink text-[17px] font-bold">로그인하고 쓰는 기능이에요</h2>
            <p className="text-muted mt-2 text-[14px] leading-relaxed">
              사건 자료를 계정에 저장해 다음에 이어서 정리할 수 있게 하려고 로그인이 필요해요. 사건
              자료는 본인만 볼 수 있어요.
            </p>
            <div className="mt-4">
              <GoogleLoginButton next="/matters" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Workspace() {
  const [list, setList] = useState<MatterSummary[] | null>(null);
  const [matter, setMatter] = useState<LoadedMatter | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<Save>("idle");
  const [seed, setSeed] = useState<ResearchSeed>({});
  const [noteSeed, setNoteSeed] = useState<{ partyId: string; name: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ id: string; data: MatterData } | null>(null);

  const refresh = useCallback(async () => {
    const r = await listMatters();
    if (r.ok) setList(r.data.items);
    else setError(matterErrorText(r.error.code, r.error.details?.reason));
  }, []);
  useEffect(() => {
    // 처음 한 번 내 사건 목록을 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const flush = useCallback(async () => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    setSave("saving");
    const r = await saveMatter(job.id, { data: job.data });
    if (r.ok) setSave("saved");
    else {
      setSave("failed");
      setError(matterErrorText(r.error.code, r.error.details?.reason));
    }
  }, []);

  // 고칠 때마다 잠깐 기다렸다가 저장한다. 화면을 떠날 때 남은 변경은 바로 보낸다
  const update = useCallback(
    (fn: (d: MatterData) => MatterData) => {
      setMatter((m) => {
        if (!m) return m;
        const data = fn(m.data);
        pending.current = { id: m.id, data };
        return { ...m, data };
      });
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 900);
    },
    [flush],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
    [flush],
  );

  async function open(id: string) {
    await flush();
    setError(null);
    const r = await getMatter(id);
    if (!r.ok) return setError(matterErrorText(r.error.code, r.error.details?.reason));
    setMatter(r.data);
    setTab("overview");
    setSave("idle");
    setSeed({});
    setNoteSeed(null);
  }

  async function create() {
    setError(null);
    const r = await createMatter(title.trim());
    if (!r.ok) return setError(matterErrorText(r.error.code, r.error.details?.reason));
    setTitle("");
    setMatter(r.data);
    setTab("docs");
    setSave("idle");
    void refresh();
  }

  function exportFile() {
    if (!matter) return;
    const blob = new Blob([JSON.stringify({ title: matter.title, data: matter.data }, null, 1)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "matter.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const go = (t: TabKey) => setTab(t);
  const toCompany = (p: MatterParty) => {
    setSeed({ company: { name: p.name, partyId: p.id } });
    setTab("research");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="내 사건">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void create();
          }}
        >
          <input
            className={field}
            value={title}
            maxLength={80}
            placeholder="새 사건 이름"
            onChange={(e) => setTitle(e.target.value)}
            aria-label="새 사건 이름"
          />
          <button type="submit" className={btn} disabled={!title.trim()}>
            만들기
          </button>
        </form>
        <ul className="mt-3 space-y-1.5" data-testid="matter-list">
          {(list ?? []).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => void open(m.id)}
                aria-current={matter?.id === m.id}
                className={`w-full rounded-[6px] border px-3 py-2 text-left ${
                  matter?.id === m.id
                    ? "border-ink bg-ink text-white"
                    : "border-line text-ink hover:border-ink bg-white"
                }`}
              >
                <span className="block truncate text-[14px] font-semibold">{m.title}</span>
                <span
                  className={`block text-[12px] ${matter?.id === m.id ? "text-white/70" : "text-muted"}`}
                >
                  자료 {m.counts.docs} · 당사자 {m.counts.parties} · 쟁점 {m.counts.issues} · 노트{" "}
                  {m.counts.notes}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {list !== null && list.length === 0 && (
          <p className="text-muted mt-3 text-[13px] leading-relaxed">
            아직 사건이 없어요. 위에 사건 이름을 적고 만들어 보세요.
          </p>
        )}
      </aside>

      <div className="min-w-0">
        {error && (
          <p
            role="alert"
            className="text-ink mb-3 rounded-[6px] border border-[var(--ink)] bg-white px-3 py-2 text-[13px] font-semibold"
          >
            {error}
          </p>
        )}
        {!matter ? (
          <Empty>왼쪽에서 사건을 고르거나 새로 만들어 주세요.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-ink min-w-0 truncate text-[20px] font-bold">{matter.title}</h2>
              <span className="flex items-center gap-3">
                <span
                  className="text-muted text-[12px]"
                  aria-live="polite"
                  data-testid="save-state"
                >
                  {save === "saving"
                    ? "저장 중…"
                    : save === "saved"
                      ? "저장됨"
                      : save === "failed"
                        ? "저장하지 못했어요"
                        : ""}
                </span>
                <ConfirmButton
                  onConfirm={() => {
                    const id = matter.id;
                    pending.current = null;
                    setMatter(null);
                    void deleteMatter(id).then(refresh);
                  }}
                >
                  사건 지우기
                </ConfirmButton>
              </span>
            </div>
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
            <div className="mt-4" role="tabpanel">
              {tab === "overview" && (
                <OverviewTab data={matter.data} update={update} go={go} onExport={exportFile} />
              )}
              {tab === "docs" && <DocsTab data={matter.data} update={update} go={go} />}
              {tab === "facts" && <FactsTab data={matter.data} update={update} />}
              {tab === "map" && (
                <StructureMap
                  data={matter.data}
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
              {tab === "issues" && <IssuesTab data={matter.data} update={update} />}
              {tab === "research" && (
                <ResearchTab
                  key={`${seed.company?.partyId ?? ""}|${seed.query ?? ""}`}
                  data={matter.data}
                  update={update}
                  seed={seed}
                  onSaved={() => setNoteSeed(null)}
                />
              )}
              {tab === "notes" && (
                <NotesTab
                  key={noteSeed?.partyId ?? "notes"}
                  data={matter.data}
                  update={update}
                  seed={noteSeed}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
