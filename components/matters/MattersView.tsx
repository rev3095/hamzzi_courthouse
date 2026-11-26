"use client";
// 사건 진행 화면 /matters (F-016, DEC-053) — 변호사가 맡은 사건을 진행 순서대로 정리하는 도구.
// 자료(서류 읽기) → 사실관계 → 구조도 → 쟁점 → 리서치 → 노트. 로그인 사용자만 쓰고 사건 자료는 계정에 저장된다.
// 판단 도구가 아니라 정리 도구다: 승패·유불리·책임 비율 같은 판정을 보여 주지 않는다 (절대 규칙 2).
// 화면 구성 (2026-11-26 사용자 요청): 판례 리서치(DEC-054)처럼 사이트 기본 바탕 위에 같은 폭의 둥근 패널로 담고,
// 화면은 둘뿐이다 — ① 사건 목록(새 사건 만들기 하나가 주된 행동) ② 사건 한 건(MatterBoard). 목록과 탭을 한 화면에 겹쳐 두지 않는다.
// 자동 정리 (2026-11-27 사용자 요청, DEC-073): 목록은 한 줄씩이고, 자료가 바뀐 사건은 서버가 Haiku로 제목(이름을 비운 사건)·법 분야·
// 한 줄 요약을 붙인다. 저장이 끝난 뒤와 목록을 연 뒤에 부르고, 자료가 그대로면 서버가 모델을 부르지 않는다.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isSignedIn } from "@/lib/client/api";
import { AI_NOTICE } from "@/lib/api/respond";
import {
  autoMatter,
  createMatter,
  deleteMatter,
  getMatter,
  listMatters,
  matterErrorText,
  saveMatter,
  type LoadedMatter,
} from "@/lib/client/matters";
import { openParam } from "@/lib/client/sessions";
import {
  MATTER_FIELD_LABEL,
  autoSig,
  autoStale,
  type MatterData,
  type MatterSummary,
} from "@/lib/matters/model";
import { useQuota } from "../useQuota";
import { CaseSwitch } from "./CaseSwitch";
import { MatterBoard } from "./MatterBoard";
import { PresetWorkspace } from "./PresetWorkspace";
import type { TabKey } from "./tabs";
import { Empty, MatterList, MatterRow, SectionTitle } from "./ui";
import { PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";

type Save = "idle" | "saving" | "saved" | "failed";

export function MattersView() {
  const quota = useQuota();
  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 pb-10 lg:pt-12">
        {quota === null ? (
          // 로그인 여부를 받는 동안에도 제목과 진행·정리 전환은 먼저 보인다
          <HomeHead>
            <p className="text-muted mt-4 text-sm" aria-live="polite">
              불러오는 중…
            </p>
          </HomeHead>
        ) : isSignedIn(quota) ? (
          <Workspace />
        ) : (
          // 로그인 전에는 가상 사건 프리셋으로 기능을 둘러본다 (DEC-061). 내 사건 저장은 로그인 뒤
          <PresetWorkspace home={<HomeHead />} />
        )}
      </div>
    </div>
  );
}

/** 사건 목록 화면의 머리 패널. 로그인하면 여기서 바로 새 사건을 만든다 */
function HomeHead({ children }: { children?: ReactNode }) {
  return (
    <section aria-label="사건 진행">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={PAGE_TITLE}>사건 진행</h1>
        <CaseSwitch current="progress" />
      </div>
      <p className={PAGE_LEAD}>
        서류를 올리면 사실관계·당사자·쟁점으로 나눠 담는 정리 도구예요. 판단은 하지 않아요.
      </p>
      {children}
    </section>
  );
}

function Workspace() {
  const [list, setList] = useState<MatterSummary[] | null>(null);
  const [matter, setMatter] = useState<LoadedMatter | null>(null);
  const [firstTab, setFirstTab] = useState<TabKey>("overview");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<Save>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ id: string; data: MatterData } | null>(null);
  // 자동 정리를 이미 부른 사건 (목록: 사건+고친 시각, 연 사건: 사건+자료 지문) — 같은 자료로 거듭 부르지 않는다
  const tried = useRef(new Set<string>());
  const [autoBusy, setAutoBusy] = useState<string[]>([]);

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

  // 연 사건의 자동 정리: 받은 정리는 화면 자료에 합쳐 다음 저장 때 함께 보낸다(서버 저장이 앞선 저장과 겹쳐 빠졌을 때를 위해)
  const autoOpen = useCallback(async (id: string, data: MatterData) => {
    const key = `${id}:${autoSig(data)}`;
    if (!autoStale(data) || tried.current.has(key)) return;
    tried.current.add(key);
    const r = await autoMatter(id);
    if (!r.ok || !r.data.ai.used || !r.data.auto) return;
    const { auto, title } = r.data;
    setMatter((m) => (m && m.id === id ? { ...m, title, data: { ...m.data, auto } } : m));
    // 저장을 기다리는 자료가 있으면 거기에도 넣는다. 없으면 화면 자료에 든 정리가 다음 저장 때 함께 간다 (제목은 서버가 저장한다)
    if (pending.current?.id === id)
      pending.current = { id, data: { ...pending.current.data, auto } };
  }, []);

  const flush = useCallback(async () => {
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    setSave("saving");
    const r = await saveMatter(job.id, { data: job.data });
    if (r.ok) {
      setSave("saved");
      void autoOpen(job.id, job.data);
    } else {
      setSave("failed");
      setError(matterErrorText(r.error.code, r.error.details?.reason));
    }
  }, [autoOpen]);

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

  // 목록에서 자료가 바뀐 사건을 몇 건씩 정리한다. 서버가 건너뛴 사건(예산·민감정보)은 다시 부르지 않는다
  useEffect(() => {
    if (!list) return;
    const todo = list.filter((m) => m.stale && !tried.current.has(`${m.id}@${m.updatedAt}`));
    if (todo.length === 0) return;
    const batch = todo.slice(0, 3);
    for (const m of batch) tried.current.add(`${m.id}@${m.updatedAt}`);
    let live = true;
    // 목록을 받은 뒤 정리 중 표시를 켠다
    setAutoBusy(batch.map((m) => m.id));
    void (async () => {
      for (const m of batch) await autoMatter(m.id);
      setAutoBusy([]);
      if (!live) return;
      void refresh();
    })();
    return () => {
      live = false;
    };
  }, [list, refresh]);

  function show(m: LoadedMatter, tab: TabKey) {
    setMatter(m);
    setFirstTab(tab);
    setSave("idle");
  }

  async function open(id: string) {
    await flush();
    setError(null);
    const r = await getMatter(id);
    if (!r.ok) return setError(matterErrorText(r.error.code, r.error.details?.reason));
    show(r.data, "overview");
  }

  // 마이페이지 '내 세션'에서 고른 사건을 바로 연다 (/matters?open=<id>, DEC-056).
  // useSearchParams 대신 주소를 한 번만 읽는다(cacheComponents의 Suspense 규칙을 피한다). 남의 사건 번호면 서버가 404로 막는다
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current) return;
    openedFromUrl.current = true;
    const id = openParam(window.location.search);
    // 처음 한 번만 연다 (open은 렌더마다 새로 만들어지는 함수다)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) void open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    setError(null);
    const r = await createMatter(title.trim());
    if (!r.ok) return setError(matterErrorText(r.error.code, r.error.details?.reason));
    setTitle("");
    // 새 사건은 첫 단계(자료)에서 시작한다
    show(r.data, "docs");
    void refresh();
  }

  async function back() {
    await flush();
    setMatter(null);
    setError(null);
    void refresh();
  }

  const alert = error && (
    <p
      role="alert"
      className="text-ink mt-3 rounded-[6px] border border-[var(--ink)] bg-white px-3 py-2 text-[13px] font-semibold"
    >
      {error}
    </p>
  );

  if (matter) {
    return (
      <MatterBoard
        key={matter.id}
        id={matter.id}
        title={matter.title}
        data={matter.data}
        update={update}
        firstTab={firstTab}
        onBack={() => void back()}
        status={
          <span className="text-muted text-[13px]" aria-live="polite" data-testid="save-state">
            {save === "saving"
              ? "저장 중…"
              : save === "saved"
                ? "저장됨"
                : save === "failed"
                  ? "저장하지 못했어요"
                  : ""}
          </span>
        }
        banner={alert}
        onDelete={() => {
          const id = matter.id;
          pending.current = null;
          setMatter(null);
          void deleteMatter(id).then(refresh);
        }}
      />
    );
  }

  return (
    <PresetWorkspace
      signedIn
      onImported={(m) => {
        show(m, "overview");
        void refresh();
      }}
      home={
        <>
          <HomeHead>
            <form
              className="mt-5 flex max-w-[640px] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <input
                className="text-ink placeholder:text-muted/70 border-line focus-visible:border-ink rounded-button min-h-12 w-full border bg-white px-4 text-[15px] outline-none"
                value={title}
                maxLength={80}
                placeholder="사건 이름 (비워 두면 서류를 읽은 뒤 AI가 지어요)"
                onChange={(e) => setTitle(e.target.value)}
                aria-label="새 사건 이름"
              />
              <button
                type="submit"
                className="bg-ink rounded-button min-h-12 shrink-0 px-5 text-[14px] font-bold whitespace-nowrap text-white disabled:opacity-50"
              >
                사건 만들기
              </button>
            </form>
            <p className="text-muted mt-2 text-[13px]">
              만들면 바로 서류 올리기로 넘어가요. 사건 자료는 내 계정에 저장되고, 목록의 법 분야와
              한 줄 요약은 AI(Haiku)가 이름·연락처를 가린 자료로 붙여요.
            </p>
          </HomeHead>
          {alert}
          <section aria-label="내 사건" className="mt-8">
            <SectionTitle title="내 사건" />
            {list === null ? (
              <p className="text-muted mt-3 text-[13px]" aria-live="polite">
                불러오는 중…
              </p>
            ) : list.length === 0 ? (
              <div className="mt-3">
                <Empty>
                  아직 사건이 없어요. 위에서 사건을 만들거나, 아래 가상 사건을 열어 먼저 둘러보세요.
                </Empty>
              </div>
            ) : (
              <>
                <MatterList testId="matter-list">
                  {list.map((m) => (
                    <MatterRow
                      key={m.id}
                      title={m.title}
                      counts={m.counts}
                      field={m.field ? MATTER_FIELD_LABEL[m.field] : null}
                      gist={m.gist || m.summary}
                      byAi={Boolean(m.gist)}
                      updatedAt={m.updatedAt}
                      pending={autoBusy.includes(m.id)}
                      onClick={() => void open(m.id)}
                    />
                  ))}
                </MatterList>
                {list.some((m) => m.gist || m.field) && (
                  <p className="text-muted mt-2 text-[12px]">{AI_NOTICE}</p>
                )}
              </>
            )}
          </section>
        </>
      }
    />
  );
}
