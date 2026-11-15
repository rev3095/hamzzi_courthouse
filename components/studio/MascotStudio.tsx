"use client";
// 햄찌법원 편집기 · 마스코트 리소스 탭. 상태 목록 → 실제 화면 맥락 미리보기 → 그림 올리기·저장·되돌리기.
// 저장은 개발 서버 API(/api/dev/studio/mascot)가 public/mascot/moods/와 lib/mascot/manifest.json을 바꾼다.
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MASCOT_MOODS, MASCOT_SIZE, MOOD_INFO, type MascotMood } from "@/lib/mascot/moods";
import type { MoodView, StudioView } from "@/lib/mascot/view";
import { HamzziJudge, MascotPreviewProvider } from "../HamzziJudge";
import {
  ACCEPT_TYPES,
  formatBytes,
  PREP_PROBLEM_TEXT,
  PrepError,
  prepareMascot,
  type Prepared,
} from "./image-prep";
import { CONTEXT_LABEL, MascotContext, MOOD_CONTEXTS, type ContextKey } from "./MascotContexts";
import { CheckIcon, Segmented, UndoIcon, UploadIcon, WarnIcon } from "./ui";

const API = "/api/dev/studio/mascot";
type Backdrop = "page" | "white" | "checker" | "dark";
type Frame = "mobile" | "wide";
type Toast = { kind: "ok" | "error"; text: string } | null;

const BACKDROP_LABEL: Record<Backdrop, string> = {
  page: "페이지",
  white: "흰색",
  checker: "투명",
  dark: "어둡게",
};

export const CHECKER = "repeating-conic-gradient(#e9e6df 0% 25%, #ffffff 0% 50%) 50% / 14px 14px";
const backdropStyle = (b: Backdrop): React.CSSProperties =>
  b === "checker"
    ? { background: CHECKER }
    : { background: b === "dark" ? "var(--ink)" : b === "white" ? "#fff" : "var(--bg)" };

const SERVER_PROBLEM: Record<string, string> = {
  not_webp: "서버가 webp 형식이 아니라고 판단했어요.",
  too_large: "그림이 800KB를 넘어요.",
  wrong_size: `그림 크기가 ${MASCOT_SIZE.width}×${MASCOT_SIZE.height}가 아니에요.`,
};

async function call(init?: RequestInit): Promise<StudioView> {
  const res = await fetch(API, { cache: "no-store", ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = body?.error?.details?.reason;
    if (res.status === 404) throw new Error("편집기 API는 개발 서버(pnpm dev)에서만 열려요.");
    throw new Error(
      (typeof reason === "string" && SERVER_PROBLEM[reason]) ||
        body?.error?.message ||
        "요청을 처리하지 못했어요.",
    );
  }
  return body.data as StudioView;
}

const when = (at: string) =>
  new Date(at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function MascotStudio() {
  const [view, setView] = useState<StudioView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mood, setMood] = useState<MascotMood>("error");
  const [context, setContext] = useState<ContextKey>(MOOD_CONTEXTS.error[0]);
  const [backdrop, setBackdrop] = useState<Backdrop>("page");
  const [frame, setFrame] = useState<Frame>("wide");
  const [draft, setDraft] = useState<Prepared | null>(null);
  const [showDraft, setShowDraft] = useState(true);
  const [trim, setTrim] = useState(true);
  const [opaqueOk, setOpaqueOk] = useState(false);
  const [prepping, setPrepping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const lastFile = useRef<File | null>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // 좁은 화면(가로 목록)에서 고른 상태가 보이게
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [mood]);

  useEffect(() => {
    call()
      .then(setView)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // 미리보기 주소는 쓰고 나면 정리한다
  useEffect(() => () => void (draft && URL.revokeObjectURL(draft.url)), [draft]);

  const current = view?.moods.find((m) => m.mood === mood) ?? null;
  const srcs = useMemo(() => {
    const out: Partial<Record<MascotMood, string>> = {};
    for (const m of view?.moods ?? []) out[m.mood] = m.src;
    if (draft && showDraft) out[mood] = draft.url;
    return out;
  }, [view, draft, showDraft, mood]);

  const discardDraft = () => {
    setDraft(null);
    setOpaqueOk(false);
    lastFile.current = null;
  };

  const pick = (next: MascotMood) => {
    if (next === mood) return;
    if (draft && !window.confirm("저장하지 않은 그림이 있어요. 버리고 다른 상태로 갈까요?")) return;
    discardDraft();
    setMood(next);
    setContext(MOOD_CONTEXTS[next][0]);
  };

  const prepare = useCallback(async (file: File, withTrim: boolean) => {
    setPrepping(true);
    try {
      const p = await prepareMascot(file, { trim: withTrim });
      lastFile.current = file;
      setDraft(p);
      setShowDraft(true);
      setOpaqueOk(false);
    } catch (e) {
      setToast({
        kind: "error",
        text: e instanceof PrepError ? PREP_PROBLEM_TEXT[e.problem] : "그림을 처리하지 못했어요.",
      });
    } finally {
      setPrepping(false);
    }
  }, []);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("mood", mood);
      form.set("file", draft.blob, `${mood}.webp`);
      setView(await call({ method: "POST", body: form }));
      discardDraft();
      setToast({ kind: "ok", text: `${MOOD_INFO[mood].label} 그림을 저장했어요.` });
    } catch (e) {
      setToast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: "undo" | "reset") => {
    setBusy(true);
    try {
      setView(
        await call({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, mood }),
        }),
      );
      setToast({
        kind: "ok",
        text: action === "undo" ? "바로 전 그림으로 되돌렸어요." : "기본 그림을 쓰도록 바꿨어요.",
      });
    } catch (e) {
      setToast({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const customCount = view?.moods.filter((m) => m.custom).length ?? 0;
  const canSave = !!draft && (draft.transparent || opaqueOk) && !busy;

  return (
    <MascotPreviewProvider srcs={srcs}>
      <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-0 lg:flex-1 lg:grid-cols-[264px_minmax(0,1fr)_360px]">
        {/* 상태 목록 */}
        <aside className="border-line border-b bg-white lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <div className="hidden px-5 pt-5 pb-2 lg:block">
            <p className="text-ink text-sm font-semibold">상태</p>
            <p className="text-muted mt-0.5 text-xs">
              {MASCOT_MOODS.length}개 중 {customCount}개 전용 그림
            </p>
          </div>
          <nav
            aria-label="마스코트 상태"
            className="flex gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-3 lg:pb-5"
          >
            {MASCOT_MOODS.map((m) => {
              const v = view?.moods.find((x) => x.mood === m);
              const on = m === mood;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  ref={on ? selectedRef : undefined}
                  aria-current={on ? "true" : undefined}
                  className={`rounded-card relative flex min-w-[176px] shrink-0 items-center gap-3 border px-2.5 py-2 text-left transition-colors lg:min-w-0 ${
                    on
                      ? "border-ink bg-ink text-white"
                      : "hover:bg-soft border-line lg:border-transparent"
                  }`}
                >
                  <span
                    className="rounded-button flex size-11 shrink-0 items-end justify-center overflow-hidden"
                    style={{ background: on ? "rgba(255,255,255,.08)" : "var(--soft)" }}
                  >
                    <HamzziJudge size={34} mood={m} interactive={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{MOOD_INFO[m].label}</span>
                    <span
                      className={`flex items-center gap-1.5 text-[12px] ${on ? "text-white/70" : "text-muted"}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${v?.custom ? "bg-sage" : on ? "bg-white/40" : "bg-line"}`}
                      />
                      {v ? (v.custom ? "전용 그림" : "기본 그림 사용") : "불러오는 중"}
                    </span>
                  </span>
                  {draft && on && (
                    <span
                      className="bg-gold absolute top-2 right-2 size-2 rounded-full"
                      title="저장 전"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* 미리보기 */}
        <section
          aria-label="미리보기"
          className="bg-soft flex flex-col lg:min-h-0 lg:overflow-y-auto"
        >
          <div className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-white px-4 py-3 lg:px-6">
            <Segmented
              label="화면 맥락"
              value={context}
              onChange={setContext}
              options={MOOD_CONTEXTS[mood].map((c) => ({ value: c, label: CONTEXT_LABEL[c] }))}
            />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Segmented
                label="배경"
                value={backdrop}
                onChange={setBackdrop}
                options={(Object.keys(BACKDROP_LABEL) as Backdrop[]).map((b) => ({
                  value: b,
                  label: BACKDROP_LABEL[b],
                }))}
              />
              <Segmented
                label="폭"
                value={frame}
                onChange={setFrame}
                options={[
                  { value: "mobile", label: "375" },
                  { value: "wide", label: "넓게" },
                ]}
              />
            </div>
          </div>

          {loadError && (
            <p
              role="alert"
              className="text-warn-text bg-note border-note-line rounded-card mx-4 mt-4 border px-4 py-3 text-sm lg:mx-6"
            >
              {loadError}
            </p>
          )}

          <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            {draft && (
              <div className="mx-auto mb-4 flex max-w-[760px] items-center justify-between gap-3">
                <p className="text-ink flex items-center gap-2 text-[13px] font-semibold">
                  <span className="bg-gold size-2 rounded-full" />
                  {showDraft ? "저장 전 그림으로 보는 중" : "지금 저장된 그림으로 보는 중"}
                </p>
                <Segmented
                  label="비교"
                  value={showDraft ? "draft" : "saved"}
                  onChange={(v) => setShowDraft(v === "draft")}
                  options={[
                    { value: "draft", label: "새 그림" },
                    { value: "saved", label: "지금" },
                  ]}
                />
              </div>
            )}
            <div
              className="rounded-panel border-line mx-auto border p-3 shadow-[0_18px_50px_-34px_rgba(26,34,51,.5)] transition-[max-width] sm:p-5"
              style={{ ...backdropStyle(backdrop), maxWidth: frame === "mobile" ? 375 : 760 }}
            >
              <div inert className="pointer-events-none select-none">
                <MascotContext context={context} mood={mood} />
              </div>
            </div>
            <p className="text-muted mx-auto mt-3 max-w-[760px] text-center text-xs">
              실제 화면 컴포넌트로 그린 미리보기예요. 눌러도 동작하지 않아요.
            </p>

            <div className="mx-auto mt-8 max-w-[760px]">
              <p className="text-muted mb-2 text-xs font-semibold tracking-[0.06em]">
                크기별 · 투명 배경
              </p>
              <div
                className="rounded-panel border-line flex items-end justify-around gap-4 overflow-x-auto border px-4 pt-6 pb-3"
                style={{ background: CHECKER }}
              >
                {[230, 160, 120, 64].map((s) => (
                  <figure key={s} className="flex shrink-0 flex-col items-center gap-2">
                    <HamzziJudge size={s} mood={mood} interactive={false} />
                    <figcaption className="text-muted rounded-full bg-white/90 px-2 text-[11px]">
                      {s}px
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 속성 · 올리기 */}
        <aside className="border-line border-t bg-white lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <div className="px-5 py-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-ink text-lg font-semibold">{MOOD_INFO[mood].label}</h2>
              <code className="bg-soft text-muted rounded-[4px] px-1.5 py-0.5 text-[11px]">
                mood=&quot;{mood}&quot;
              </code>
            </div>
            <p className="text-muted mt-1 text-[13px] leading-relaxed">{MOOD_INFO[mood].when}</p>
            <dl className="mt-4 grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-[13px]">
              <dt className="text-muted">쓰는 곳</dt>
              <dd className="text-ink">
                {MOOD_INFO[mood].usedIn.length > 0 ? (
                  MOOD_INFO[mood].usedIn.join(", ")
                ) : (
                  <span className="text-muted">아직 없음 · 그림만 준비</span>
                )}
              </dd>
              <dt className="text-muted">표정</dt>
              <dd className="text-ink">{MOOD_INFO[mood].art}</dd>
              <dt className="text-muted">대사</dt>
              <dd className="text-ink">
                {MOOD_INFO[mood].line ?? <span className="text-muted">없음</span>}
              </dd>
            </dl>
          </div>

          <Section title="그림 올리기">
            <DropZone
              disabled={prepping || busy}
              onFile={(f) => void prepare(f, trim)}
              busy={prepping}
            />
            <label className="text-ink mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[13px]">
              <span>
                투명 여백 자동 정리
                <span className="text-muted block text-[12px]">
                  잘라 낸 뒤 기본 그림과 같은 틀(발 기준)에 맞춰요
                </span>
              </span>
              <input
                type="checkbox"
                checked={trim}
                onChange={(e) => {
                  setTrim(e.target.checked);
                  if (lastFile.current) void prepare(lastFile.current, e.target.checked);
                }}
                className="size-5 accent-[var(--ink)]"
              />
            </label>

            {draft && (
              <div className="rounded-card border-line mt-3 border">
                <div className="border-line flex items-center gap-3 border-b px-3 py-3">
                  <span
                    className="rounded-button flex size-14 shrink-0 items-end justify-center overflow-hidden"
                    style={{ background: CHECKER }}
                  >
                    <Image src={draft.url} alt="" width={42} height={56} unoptimized />
                  </span>
                  <div className="min-w-0 text-[13px]">
                    <p className="text-ink truncate font-semibold">{draft.source.name}</p>
                    <p className="text-muted">
                      {draft.source.width}×{draft.source.height} · {formatBytes(draft.source.bytes)}{" "}
                      → {MASCOT_SIZE.width}×{MASCOT_SIZE.height} webp · {formatBytes(draft.bytes)}
                    </p>
                  </div>
                </div>
                <ul className="flex flex-col gap-2 px-3 py-3 text-[13px]">
                  <Check ok>
                    형식 · {draft.source.type.replace("image/", "").toUpperCase()} → WebP
                  </Check>
                  <Check ok>
                    크기 · {MASCOT_SIZE.width}×{MASCOT_SIZE.height}, 800KB 이하
                  </Check>
                  <Check ok={draft.transparent}>
                    {draft.transparent
                      ? `투명 배경 · 투명 ${Math.round(draft.transparentShare * 100)}%`
                      : "배경이 투명하지 않아요 · 카드 바탕색과 어긋나 보일 수 있어요"}
                  </Check>
                  <Check ok>
                    {draft.trimmed ? "여백 정리 · 발 기준 아래 정렬" : "여백 그대로 · 가운데 맞춤"}
                  </Check>
                </ul>
                {!draft.transparent && (
                  <label className="border-line text-ink flex min-h-11 items-center gap-2.5 border-t px-3 text-[13px]">
                    <input
                      type="checkbox"
                      checked={opaqueOk}
                      onChange={(e) => setOpaqueOk(e.target.checked)}
                      className="size-5 accent-[var(--ink)]"
                    />
                    배경이 있어도 이 그림을 쓸게요
                  </label>
                )}
              </div>
            )}

            {draft && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!canSave}
                  onClick={() => void save()}
                  className="rounded-button bg-ink min-h-11 flex-1 px-4 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {busy ? "저장 중…" : "이 그림으로 저장"}
                </button>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[14px]"
                >
                  취소
                </button>
              </div>
            )}
          </Section>

          <Section title="되돌리기">
            <History
              current={current}
              busy={busy}
              onUndo={() => void act("undo")}
              onReset={() => void act("reset")}
            />
          </Section>

          <p className="text-muted px-5 pt-1 pb-6 text-[12px] leading-relaxed">
            저장하면 <code>public/mascot/moods/</code>에 그림이 생기고{" "}
            <code>lib/mascot/manifest.json</code>이 바뀌어요. 개발 화면에는 바로 반영되고,
            커밋·배포해야 사이트에 반영돼요. 되돌리기 기록은 이 컴퓨터(<code>.studio/</code>)에만
            남아요.
          </p>
        </aside>
      </div>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4"
      >
        {toast && (
          <p
            role={toast.kind === "error" ? "alert" : "status"}
            className={`rounded-card flex items-center gap-2 px-4 py-3 text-[14px] shadow-lg ${
              toast.kind === "ok"
                ? "bg-ink text-white"
                : "bg-note text-warn-text border-note-line border"
            }`}
          >
            {toast.kind === "ok" ? <CheckIcon /> : <WarnIcon />}
            {toast.text}
          </p>
        )}
      </div>
    </MascotPreviewProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line border-t px-5 py-5">
      <h3 className="text-muted mb-3 text-xs font-semibold tracking-[0.06em]">{title}</h3>
      {children}
    </section>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? "text-ink" : "text-warn-text"}`}>
      <span className={`mt-0.5 shrink-0 ${ok ? "text-sage" : ""}`}>
        {ok ? <CheckIcon /> : <WarnIcon />}
      </span>
      <span>{children}</span>
    </li>
  );
}

function DropZone({
  onFile,
  disabled,
  busy,
}: {
  onFile: (f: File) => void;
  disabled: boolean;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !disabled) onFile(f);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={`rounded-card flex w-full flex-col items-center gap-2 border border-dashed px-4 py-7 text-center transition-colors disabled:opacity-60 ${
          over ? "border-gold bg-note" : "border-line hover:border-gold bg-soft"
        }`}
      >
        <span className="text-gold">
          <UploadIcon />
        </span>
        <span className="text-ink text-[14px] font-semibold">
          {busy ? "그림을 맞추는 중…" : "그림을 끌어다 놓거나 눌러서 고르기"}
        </span>
        <span className="text-muted text-[12px]">PNG·WebP 투명 배경 권장 · 15MB 이하</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

function History({
  current,
  busy,
  onUndo,
  onReset,
}: {
  current: MoodView | null;
  busy: boolean;
  onUndo: () => void;
  onReset: () => void;
}) {
  const prev = current?.history[0];
  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!prev || busy}
          onClick={onUndo}
          className="rounded-button border-line text-ink flex min-h-11 flex-1 items-center justify-center gap-2 border bg-white px-3 text-[14px] disabled:opacity-40"
        >
          <UndoIcon />
          바로 전으로
        </button>
        <button
          type="button"
          disabled={!current?.custom || busy}
          onClick={onReset}
          className="rounded-button border-line text-ink min-h-11 flex-1 border bg-white px-3 text-[14px] disabled:opacity-40"
        >
          기본 그림으로
        </button>
      </div>
      {current && current.history.length > 0 ? (
        <ol className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="되돌리기 기록 (최근 순)">
          {current.history.map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex shrink-0 flex-col items-center gap-1">
              <span
                className={`rounded-button flex h-[60px] w-[46px] items-end justify-center overflow-hidden border ${
                  i === 0 ? "border-gold" : "border-line"
                }`}
                style={{ background: CHECKER }}
              >
                {h.src ? (
                  <Image src={h.src} alt="" width={44} height={58} unoptimized />
                ) : (
                  <span className="text-muted mb-auto pt-4 text-[10px]">기본</span>
                )}
              </span>
              <span className="text-muted text-[10px]">{when(h.at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted mt-3 text-[12px]">아직 바꾼 기록이 없어요.</p>
      )}
    </div>
  );
}
