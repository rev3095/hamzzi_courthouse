"use client";
// 사건 진행 — 개요·자료·사실관계·쟁점·노트 탭 (F-016, DEC-053).
// 정리 도구다: 서류에 적힌 것과 사용자가 적은 것을 모아 보여 줄 뿐, 승패·유불리·책임을 표시하지 않는다 (절대 규칙 2).
// AI가 읽거나 쓴 내용에는 AI_NOTICE를 붙인다 (절대 규칙 6). 쟁점의 근거는 법제처 조회로 인용을 확인한 문단만 온다 (절대 규칙 1).
import { useState, type ReactNode } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import { aiSkipText, matterErrorText, organizeIssues, readMatterDocs } from "@/lib/client/matters";
import {
  MATTER_KIND_LABEL,
  MATTER_SIDE_LABEL,
  NOTE_KINDS,
  NOTE_KIND_LABEL,
  composeIssueText,
  mergeReading,
  newId,
  sortFacts,
  type MatterData,
  type MatterNote,
  type MySide,
  type NoteKind,
} from "@/lib/matters/model";
import { AttachButton, AttachTray } from "../ask/AttachTray";
import { useAttachments } from "../ask/useAttachments";
import {
  AiTag,
  ConfirmButton,
  Empty,
  Fold,
  Hover,
  SectionTitle,
  btn,
  btnLine,
  card,
  field,
  label,
} from "./ui";

type TabProps = { data: MatterData; update: (fn: (d: MatterData) => MatterData) => void };
export type TabKey = "overview" | "docs" | "facts" | "map" | "issues" | "research" | "notes";

const personNamesOf = (data: MatterData) =>
  data.parties.filter((p) => p.kind === "person").map((p) => p.name);
const docTitle = (data: MatterData, docId: string | null) =>
  data.docs.find((d) => d.id === docId)?.title ?? "";

const MY_SIDE: Record<MySide, string> = {
  claimant: "요구·청구하는 쪽",
  respondent: "요구·청구를 받은 쪽",
  unknown: "정하지 않음",
};

// --- 개요 ----------------------------------------------------------------------------------

export function OverviewTab({
  data,
  update,
  go,
  onExport,
}: TabProps & { go: (tab: TabKey) => void; onExport: () => void }) {
  const steps: { tab: TabKey; name: string; count: number; todo: string }[] = [
    { tab: "docs", name: "자료", count: data.docs.length, todo: "서류 사진을 올려 읽어 보세요" },
    { tab: "facts", name: "사실관계", count: data.facts.length, todo: "날짜순으로 정리돼요" },
    {
      tab: "map",
      name: "구조도",
      count: data.parties.length,
      todo: "당사자와 관계를 그림으로 봐요",
    },
    { tab: "issues", name: "쟁점", count: data.issues.length, todo: "살펴볼 질문을 모아요" },
    { tab: "research", name: "리서치", count: 0, todo: "회사와 법령·판례를 찾아 붙여요" },
    { tab: "notes", name: "노트", count: data.notes.length, todo: "찾은 내용을 계속 덧붙여요" },
  ];
  return (
    <section>
      <SectionTitle
        title="개요"
        hint="이 사건을 한눈에 보는 곳이에요. 아래 순서대로 채워 가면 돼요."
      />
      <label className="mt-3 block">
        <span className={label}>사건 한 줄 요약</span>
        <textarea
          className={`${field} mt-1`}
          rows={2}
          maxLength={400}
          placeholder="예: 용역 계약 종료 뒤 남은 테스트 페이지에서 비롯된 정보 유출을 두고 온 통지"
          value={data.summary}
          onChange={(e) => update((d) => ({ ...d, summary: e.target.value }))}
        />
      </label>
      <fieldset className="mt-3">
        <legend className={label}>의뢰인은 서류에서 어느 쪽인가요</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(MY_SIDE) as MySide[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={data.mySide === s}
              onClick={() => update((d) => ({ ...d, mySide: s }))}
              className={data.mySide === s ? btn : btnLine}
            >
              {MY_SIDE[s]}
            </button>
          ))}
        </div>
      </fieldset>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.tab}>
            <button
              type="button"
              onClick={() => go(s.tab)}
              className={`${card} hover:border-ink w-full px-4 py-3 text-left`}
            >
              <span className={label}>{i + 1}단계</span>
              <span className="text-ink mt-0.5 flex items-baseline justify-between text-[15px] font-bold">
                {s.name}
                {s.tab !== "research" && (
                  <span className="text-[13px] font-semibold">{s.count}</span>
                )}
              </span>
              <span className="text-muted mt-0.5 block text-[12px]">{s.todo}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <SectionTitle
          title="서류의 요구와 기한"
          hint="AI가 서류에서 읽은 내용이에요. 날짜는 원문과 대조해 주세요."
          right={data.docs.length > 0 ? <AiTag notice={AI_NOTICE} /> : null}
        />
        {data.demands.length === 0 ? (
          <div className="mt-2">
            <Empty>아직 읽은 요구 사항이 없어요.</Empty>
          </div>
        ) : (
          <ul className={`${card} mt-2 divide-y divide-[var(--line)]`}>
            {data.demands.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2.5"
              >
                <span className="text-ink min-w-0 flex-1 text-[14px] leading-relaxed">
                  {d.what}
                </span>
                <span className="flex items-center gap-2">
                  {d.due && (
                    <Hover
                      align="right"
                      panel={<>서류: {docTitle(data, d.docId) || "직접 적음"}</>}
                    >
                      <span className="text-ink text-[13px] font-semibold">{d.due}</span>
                    </Hover>
                  )}
                  <ConfirmButton
                    onConfirm={() =>
                      update((x) => ({ ...x, demands: x.demands.filter((y) => y.id !== d.id) }))
                    }
                  >
                    지우기
                  </ConfirmButton>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.clauses.length > 0 && (
        <div className="mt-5">
          <Fold summary={`서류가 근거로 든 조항 ${data.clauses.length}`}>
            <p className="text-muted text-[12px] leading-relaxed">
              AI가 서류에서 읽어 옮긴 이름이고 원문과 대조하기 전이에요({AI_NOTICE}). 법령 조문은
              리서치 탭에서 법제처 원문으로 확인해 주세요.
            </p>
            <ul className="mt-1 space-y-1.5">
              {data.clauses.map((c) => (
                <li key={c.id} className="text-ink text-[13px] leading-relaxed">
                  <span className="font-semibold">{c.ref}</span>
                  {c.gist && <span className="text-muted"> — {c.gist}</span>}
                </li>
              ))}
            </ul>
          </Fold>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className={btnLine} onClick={onExport}>
          파일로 내보내기
        </button>
        <span className="text-muted text-[12px]">
          사건 자료를 이 기기에 파일(JSON)로 내려받아요.
        </span>
      </div>
    </section>
  );
}

// --- 자료 ----------------------------------------------------------------------------------

export function DocsTab({ data, update, go }: TabProps & { go: (tab: TabKey) => void }) {
  const attach = useAttachments();
  const [agree, setAgree] = useState({ images: false, sensitive: false });
  const [state, setState] = useState<{
    busy: boolean;
    message: string | null;
    done: string | null;
  }>({
    busy: false,
    message: null,
    done: null,
  });

  async function read() {
    setState({ busy: true, message: null, done: null });
    const r = await readMatterDocs(attach.items);
    if (!r.ok) {
      return setState({
        busy: false,
        message: matterErrorText(r.error.code, r.error.details?.reason),
        done: null,
      });
    }
    if (!r.data.reading) {
      const reason = r.data.ai.used ? "model_failed" : r.data.ai.reason;
      return setState({ busy: false, message: aiSkipText(reason), done: null });
    }
    const reading = r.data.reading;
    const pages = attach.items.length;
    update((d) => mergeReading(d, reading, pages));
    attach.clear();
    setAgree({ images: false, sensitive: false });
    setState({
      busy: false,
      message: null,
      done: `서류를 읽어 사실 ${reading.facts.length}개 · 당사자 ${reading.parties.length} · 요구 ${reading.demands.length}개를 더했어요.`,
    });
  }

  return (
    <section>
      <SectionTitle
        title="자료"
        hint={`서류 사진·문서(PDF·한글·워드·파워포인트·엑셀·텍스트)를 ${CASEFILE_LIMITS.maxImages}개까지 올리면 AI가 읽어 사실관계·당사자·요구를 나눠 담아요. 사진·파일은 저장하지 않아요.`}
      />
      <div
        className={`${card} mt-3 p-3`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attach.add([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
        }}
      >
        <div className="flex items-center gap-2">
          <div className="border-line flex h-12 overflow-hidden rounded-[6px] border">
            <AttachButton attach={attach} disabled={state.busy} />
          </div>
          <p className="text-muted text-[13px]">사진 버튼을 누르거나 여기에 끌어다 놓으세요.</p>
        </div>
        <AttachTray attach={attach} />
        {attach.items.length > 0 && (
          <div className="mt-2">
            <label className="text-ink flex min-h-10 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ink)]"
                checked={agree.images}
                onChange={(e) => setAgree({ ...agree, images: e.target.checked })}
              />
              서류 사진을 AI에게 보내 읽는 데 동의합니다 (사진에는 이름·주소가 가려지지 않은 채 들어
              있어요)
            </label>
            <label className="text-ink flex min-h-10 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ink)]"
                checked={agree.sensitive}
                onChange={(e) => setAgree({ ...agree, sensitive: e.target.checked })}
              />
              서류에 든 건강·범죄경력 같은 민감정보 처리에 동의합니다
            </label>
            <p className="text-muted text-[12px] leading-relaxed">
              읽은 내용 가운데 이름은 본인 사건 정리를 위해 그대로 두고, 연락처·등록번호·주소는
              가려서 계정에 저장해요.{" "}
              <a href="/privacy" target="_blank" className="underline">
                개인정보처리방침
              </a>
            </p>
            <button
              type="button"
              className={`${btn} mt-2`}
              disabled={state.busy || !agree.images || !agree.sensitive}
              onClick={() => void read()}
            >
              {state.busy ? "읽는 중…" : `서류 ${attach.items.length}장 읽기`}
            </button>
          </div>
        )}
        {state.message && (
          <p role="alert" className="text-ink mt-2 text-[13px] font-semibold">
            {state.message}
          </p>
        )}
        {state.done && (
          <p role="status" className="text-ink mt-2 text-[13px]">
            {state.done}{" "}
            <button type="button" className="font-semibold underline" onClick={() => go("facts")}>
              사실관계 보기
            </button>{" "}
            ·{" "}
            <button type="button" className="font-semibold underline" onClick={() => go("map")}>
              구조도 보기
            </button>
          </p>
        )}
      </div>

      <div className="mt-4">
        {data.docs.length === 0 ? (
          <Empty>아직 읽은 서류가 없어요.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.docs.map((d) => {
              const facts = data.facts.filter((f) => f.docId === d.id).length;
              const demands = data.demands.filter((x) => x.docId === d.id).length;
              return (
                <li key={d.id} className={`${card} px-4 py-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-ink text-[15px] font-bold">{d.title || d.type}</p>
                      <p className="text-muted text-[12px]">
                        {[d.type, d.date, `${d.pages}장`, `사실 ${facts} · 요구 ${demands}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="flex items-center gap-2">
                      <AiTag notice={AI_NOTICE} />
                      <ConfirmButton
                        onConfirm={() =>
                          update((x) => ({
                            ...x,
                            docs: x.docs.filter((y) => y.id !== d.id),
                            facts: x.facts.filter((y) => y.docId !== d.id),
                            demands: x.demands.filter((y) => y.docId !== d.id),
                            clauses: x.clauses.filter((y) => y.docId !== d.id),
                          }))
                        }
                      >
                        지우기
                      </ConfirmButton>
                    </span>
                  </div>
                  {d.gist && <p className="text-ink mt-1 text-[14px] leading-relaxed">{d.gist}</p>}
                </li>
              );
            })}
          </ul>
        )}
        {data.docs.length > 0 && (
          <p className="text-muted mt-2 text-[12px] leading-relaxed">
            AI가 사진에서 읽은 내용이에요. 날짜·금액·이름은 원문과 대조해 주세요. 서류를 지우면 그
            서류에서 나온 사실·요구·조항도 함께 지워져요.
          </p>
        )}
      </div>
    </section>
  );
}

// --- 사실관계 ------------------------------------------------------------------------------

export function FactsTab({ data, update }: TabProps) {
  const [draft, setDraft] = useState({ when: "", what: "" });
  const facts = sortFacts(data.facts);
  const fromDocs = data.facts.some((f) => f.docId);
  return (
    <section>
      <SectionTitle
        title="사실관계"
        hint="날짜순이에요. 서류의 주장도 '누가 그렇게 적었는지'와 함께 담아요. 서류에 적힌 조문·사건번호는 원문과 대조하기 전이에요. 눌러서 바로 고칠 수 있어요."
        right={fromDocs ? <AiTag notice={AI_NOTICE} /> : null}
      />
      {facts.length === 0 ? (
        <div className="mt-3">
          <Empty>아직 사실관계가 없어요. 자료 탭에서 서류를 읽거나 아래에 직접 적어 주세요.</Empty>
        </div>
      ) : (
        <ol className={`${card} mt-3 divide-y divide-[var(--line)]`} data-testid="facts">
          {facts.map((f) => (
            <li
              key={f.id}
              className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-start gap-2 px-3 py-2"
            >
              <input
                aria-label="시점"
                className="text-ink w-full bg-transparent text-[13px] font-semibold outline-none focus:underline"
                value={f.when}
                maxLength={40}
                placeholder="시점"
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    facts: d.facts.map((x) => (x.id === f.id ? { ...x, when: e.target.value } : x)),
                  }))
                }
              />
              <textarea
                aria-label="있었던 일"
                className="text-ink w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none focus:underline"
                rows={Math.min(4, Math.max(1, Math.ceil(f.what.length / 46)))}
                value={f.what}
                maxLength={400}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    facts: d.facts.map((x) => (x.id === f.id ? { ...x, what: e.target.value } : x)),
                  }))
                }
              />
              <span className="flex items-center gap-1">
                {f.docId && (
                  <Hover align="right" panel={<>서류: {docTitle(data, f.docId)}</>}>
                    <span className="text-muted text-[12px]">출처</span>
                  </Hover>
                )}
                <ConfirmButton
                  onConfirm={() =>
                    update((d) => ({ ...d, facts: d.facts.filter((x) => x.id !== f.id) }))
                  }
                >
                  지우기
                </ConfirmButton>
              </span>
            </li>
          ))}
        </ol>
      )}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.what.trim()) return;
          update((d) => ({
            ...d,
            facts: [
              ...d.facts,
              { id: newId(), when: draft.when.trim(), what: draft.what.trim(), docId: null },
            ],
          }));
          setDraft({ when: "", what: "" });
        }}
      >
        <input
          className={`${field} max-w-[170px]`}
          placeholder="시점 (2026-03-05)"
          value={draft.when}
          maxLength={40}
          onChange={(e) => setDraft({ ...draft, when: e.target.value })}
          aria-label="새 사실의 시점"
        />
        <input
          className={`${field} min-w-[220px] flex-1`}
          placeholder="있었던 일"
          value={draft.what}
          maxLength={400}
          onChange={(e) => setDraft({ ...draft, what: e.target.value })}
          aria-label="새 사실"
        />
        <button type="submit" className={btnLine} disabled={!draft.what.trim()}>
          더하기
        </button>
      </form>
    </section>
  );
}

// --- 쟁점 ----------------------------------------------------------------------------------

export function IssuesTab({ data, update }: TabProps) {
  const [title, setTitle] = useState("");
  const [agree, setAgree] = useState(false);
  const [state, setState] = useState<{ busy: boolean; message: string | null }>({
    busy: false,
    message: null,
  });
  const enough = data.facts.length > 0 || data.summary.trim().length > 0;

  async function organize() {
    setState({ busy: true, message: null });
    const r = await organizeIssues(composeIssueText(data), personNamesOf(data));
    if (!r.ok)
      return setState({
        busy: false,
        message: matterErrorText(r.error.code, r.error.details?.reason),
      });
    if (!r.data.ai.used) return setState({ busy: false, message: aiSkipText(r.data.ai.reason) });
    const found = r.data.issues;
    const unknowns = r.data.unknowns;
    update((d) => ({
      ...d,
      issues: [
        ...d.issues,
        ...found.map((i) => ({
          id: newId(),
          title: i.title,
          detail: "",
          points: i.points,
          unknowns: [],
          byAi: true,
        })),
        ...(unknowns.length > 0
          ? [
              {
                id: newId(),
                title: "자료에 적히지 않아 확인이 필요한 사실",
                detail: "",
                points: [],
                unknowns,
                byAi: true,
              },
            ]
          : []),
      ].slice(0, 40),
    }));
    setAgree(false);
    setState({
      busy: false,
      message:
        found.length === 0
          ? "정리할 쟁점을 찾지 못했어요. 사실관계를 더 채운 뒤 다시 해 주세요."
          : null,
    });
  }

  return (
    <section>
      <SectionTitle
        title="쟁점"
        hint="따로 살펴볼 질문을 모으는 곳이에요. 어느 쪽이 옳은지, 결과가 어떻게 될지는 정하지 않아요."
      />
      <div className={`${card} mt-3 p-3`}>
        <p className="text-ink text-[13px] leading-relaxed">
          AI 정리는 이름·연락처를 가린 사건 글을 보내 쟁점을 나누고, 법제처에서 찾은 법령·판례
          가운데 인용을 확인한 내용만 붙여요. DeepSearch 한 번만큼의 AI 사용량이 들어요.
        </p>
        <label className="text-ink mt-1 flex min-h-10 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ink)]"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          가린 사건 글을 AI와 법제처 검색으로 보내는 데 동의합니다 (민감한 내용이 섞여 있을 수
          있어요)
        </label>
        <button
          type="button"
          className={btn}
          disabled={state.busy || !agree || !enough}
          onClick={() => void organize()}
        >
          {state.busy ? "정리하는 중… (1~2분)" : "쟁점 정리 (AI)"}
        </button>
        {!enough && (
          <span className="text-muted ml-2 text-[12px]">사실관계나 사건 요약이 있어야 해요.</span>
        )}
        {state.message && (
          <p role="alert" className="text-ink mt-2 text-[13px] font-semibold">
            {state.message}
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {data.issues.map((i, n) => (
          <li key={i.id} className={`${card} px-4 py-3`}>
            <div className="flex items-start justify-between gap-2">
              <textarea
                aria-label={`쟁점 ${n + 1}`}
                rows={Math.min(3, Math.max(1, Math.ceil(i.title.length / 24)))}
                className="text-ink w-full resize-none bg-transparent text-[15px] leading-snug font-bold outline-none focus:underline"
                value={i.title}
                maxLength={400}
                onChange={(e) =>
                  update((d) => ({
                    ...d,
                    issues: d.issues.map((x) =>
                      x.id === i.id ? { ...x, title: e.target.value } : x,
                    ),
                  }))
                }
              />
              <span className="flex shrink-0 items-center gap-2">
                {i.byAi && <AiTag notice={AI_NOTICE} />}
                <ConfirmButton
                  onConfirm={() =>
                    update((d) => ({ ...d, issues: d.issues.filter((x) => x.id !== i.id) }))
                  }
                >
                  지우기
                </ConfirmButton>
              </span>
            </div>
            {i.points.length > 0 && (
              <Fold summary={`법제처에서 확인한 근거 ${i.points.length}`} open>
                <ul className="space-y-2">
                  {i.points.map((p, k) => (
                    <li key={k} className="text-ink text-[14px] leading-relaxed">
                      {p.text}{" "}
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-semibold underline"
                      >
                        {p.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </Fold>
            )}
            {i.unknowns.length > 0 && (
              <ul className="text-ink mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
                {i.unknowns.map((u, k) => (
                  <li key={k}>{u}</li>
                ))}
              </ul>
            )}
            <textarea
              aria-label={`쟁점 ${n + 1} 메모`}
              className={`${field} mt-2`}
              rows={2}
              maxLength={6000}
              placeholder="메모 (관련 사실, 확인할 자료, 주장 정리 등)"
              value={i.detail}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  issues: d.issues.map((x) =>
                    x.id === i.id ? { ...x, detail: e.target.value } : x,
                  ),
                }))
              }
            />
          </li>
        ))}
      </ul>
      {data.issues.length === 0 && (
        <div className="mt-3">
          <Empty>아직 쟁점이 없어요. AI로 정리하거나 아래에 직접 적어 주세요.</Empty>
        </div>
      )}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          update((d) => ({
            ...d,
            issues: [
              ...d.issues,
              {
                id: newId(),
                title: title.trim(),
                detail: "",
                points: [],
                unknowns: [],
                byAi: false,
              },
            ],
          }));
          setTitle("");
        }}
      >
        <input
          className={`${field} min-w-[240px] flex-1`}
          placeholder="살펴볼 질문 (예: 계약 종료 뒤 삭제 의무는 누구에게 있는지)"
          value={title}
          maxLength={400}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="새 쟁점"
        />
        <button type="submit" className={btnLine} disabled={!title.trim()}>
          더하기
        </button>
      </form>
    </section>
  );
}

// --- 노트 ----------------------------------------------------------------------------------

/** 본문의 [[이름]]을 당사자·쟁점·노트로 이어 마우스를 올리면 요약이 뜨게 한다 */
function Linked({ text, data }: { text: string; data: MatterData }) {
  const parts = text.split(/(\[\[[^\]\n]{1,60}\]\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[\[(.+)\]\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const name = m[1].trim();
        const party = data.parties.find((p) => p.name === name);
        const issue = data.issues.find((x) => x.title === name);
        const note = data.notes.find((x) => x.title === name);
        const panel: ReactNode = party ? (
          <>
            <span className="block font-semibold">{party.name}</span>
            <span className="text-muted block">
              {MATTER_KIND_LABEL[party.kind]} · {MATTER_SIDE_LABEL[party.side]}
              {party.role ? ` · ${party.role}` : ""}
            </span>
            {party.note && <span className="mt-1 block">{party.note}</span>}
          </>
        ) : issue ? (
          <>
            <span className="block font-semibold">쟁점</span>
            <span className="block">{issue.detail || `근거 ${issue.points.length}`}</span>
          </>
        ) : note ? (
          <>
            <span className="block font-semibold">{NOTE_KIND_LABEL[note.kind]}</span>
            <span className="block">{note.body.slice(0, 200)}</span>
          </>
        ) : (
          <>아직 같은 이름의 당사자·쟁점·노트가 없어요.</>
        );
        return (
          <Hover key={i} panel={panel}>
            <span className="font-semibold">{name}</span>
          </Hover>
        );
      })}
    </>
  );
}

export function NotesTab({
  data,
  update,
  seed,
}: TabProps & {
  /** 구조도에서 "메모 붙이기"로 넘어온 당사자 */
  seed: { partyId: string; name: string } | null;
}) {
  const [filter, setFilter] = useState<NoteKind | "all">("all");
  const [draft, setDraft] = useState({
    title: seed ? `${seed.name} 메모` : "",
    body: seed ? `[[${seed.name}]] ` : "",
  });
  const refs = seed ? [seed.partyId] : [];
  const notes = [...data.notes].reverse().filter((n) => filter === "all" || n.kind === filter);
  const patch = (id: string, change: Partial<MatterNote>) =>
    update((d) => ({ ...d, notes: d.notes.map((n) => (n.id === id ? { ...n, ...change } : n)) }));

  return (
    <section>
      <SectionTitle
        title="노트"
        hint="찾은 내용과 생각을 계속 덧붙이는 곳이에요. 본문에 [[당사자 이름]]처럼 적으면 그 항목과 이어져 마우스를 올렸을 때 요약이 떠요."
      />
      <form
        className={`${card} mt-3 p-3`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.body.trim() && !draft.title.trim()) return;
          const now = new Date().toISOString();
          update((d) => ({
            ...d,
            notes: [
              ...d.notes,
              {
                id: newId(),
                title: draft.title.trim() || "메모",
                body: draft.body.trim(),
                kind: "memo" as const,
                refs,
                sources: [],
                byAi: false,
                at: now,
              },
            ].slice(-200),
          }));
          setDraft({ title: "", body: "" });
        }}
      >
        <input
          className={field}
          placeholder="제목"
          value={draft.title}
          maxLength={120}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          aria-label="노트 제목"
        />
        <textarea
          className={`${field} mt-2`}
          rows={3}
          placeholder="내용"
          value={draft.body}
          maxLength={6000}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          aria-label="노트 내용"
        />
        <button
          type="submit"
          className={`${btn} mt-2`}
          disabled={!draft.body.trim() && !draft.title.trim()}
        >
          노트 더하기
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="노트 종류">
        {(["all", ...NOTE_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={filter === k ? btn : btnLine}
          >
            {k === "all" ? "전체" : NOTE_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {notes.length === 0 ? (
        <div className="mt-3">
          <Empty>아직 노트가 없어요. 리서치 탭에서 찾은 내용을 노트로 저장할 수 있어요.</Empty>
        </div>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="notes">
          {notes.map((n) => (
            <li key={n.id} className={`${card} px-4 py-3`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={label}>
                    {NOTE_KIND_LABEL[n.kind]} · {n.at.slice(0, 10)}
                  </p>
                  <p className="text-ink text-[15px] font-bold">{n.title}</p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {n.byAi && <AiTag notice={AI_NOTICE} />}
                  <ConfirmButton
                    onConfirm={() =>
                      update((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== n.id) }))
                    }
                  >
                    지우기
                  </ConfirmButton>
                </span>
              </div>
              <p className="text-ink mt-1 line-clamp-3 text-[14px] leading-relaxed whitespace-pre-wrap">
                <Linked text={n.body} data={data} />
              </p>
              <Fold summary="펼쳐서 고치기">
                <textarea
                  className={field}
                  rows={8}
                  value={n.body}
                  maxLength={6000}
                  onChange={(e) => patch(n.id, { body: e.target.value })}
                  aria-label={`${n.title} 내용`}
                />
                {n.sources.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {n.sources.map((s) => (
                      <li key={s.url} className="text-[13px]">
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink underline"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Fold>
              {n.refs.length > 0 && (
                <p className="text-muted text-[12px]">
                  연결:{" "}
                  {n.refs
                    .map((id) => data.parties.find((p) => p.id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
