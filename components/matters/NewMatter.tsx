"use client";
// 새 사건 만들기 창 (2026-11-27 사용자 요청): DeepSearch 입력 창(components/ask/DeepAsk)처럼 단계를 나눠 받는다.
// ① 시작 방법(서류부터 / 직접 적어서) → ② 사건 내용(칸마다 선택) → ③ 확인. 칸을 사건 자료로 바꾸는 규칙은 lib/matters/start.ts이고
// 모델을 부르지 않는다(비용 0). 적은 내용은 '사건 만들기'를 누를 때만 내 계정에 저장된다.
import { useEffect, useId, useRef, useState } from "react";
import {
  MATTER_KINDS,
  MATTER_KIND_LABEL,
  type MatterData,
  type MatterKind,
} from "@/lib/matters/model";
import {
  EMPTY_START,
  MY_SIDE_CHOICES,
  START_EXAMPLE,
  START_LIMITS,
  START_MODES,
  composeStart,
  startCounts,
  type StartMode,
  type StartValues,
} from "@/lib/matters/start";
import { PrimaryButton, SecondaryButton } from "../Modal";

type Step = 0 | 1 | 2;

const input =
  "rounded-card border-line text-ink placeholder:text-muted/60 focus:border-gold w-full border bg-white px-3.5 py-2.5 text-[15px] leading-relaxed outline-none";

export function NewMatter({
  onCreate,
  onClose,
}: {
  /** 만들기 — 실패하면 화면에 보일 문장을 돌려준다 */
  onCreate: (title: string, data: MatterData, mode: StartMode) => Promise<string | null>;
  onClose: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(0);
  const [mode, setMode] = useState<StartMode>("write");
  const [v, setV] = useState<StartValues>(EMPTY_START);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof StartValues>(k: K, value: StartValues[K]) => {
    setV((old) => ({ ...old, [k]: value }));
    setError(null);
  };
  const steps = mode === "docs" ? ["시작 방법", "이름·입장"] : ["시작 방법", "사건 내용", "확인"];
  const last = steps.length - 1;
  const counts = startCounts(v, mode);

  async function make() {
    setBusy(true);
    setError(null);
    const { title, data } = composeStart(v, mode);
    const failed = await onCreate(title, data, mode);
    setBusy(false);
    if (failed) setError(failed);
  }

  return (
    <div className="bg-ink/50 fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        className="rounded-t-panel sm:rounded-panel border-line flex max-h-[92dvh] w-full max-w-[720px] flex-col border bg-white shadow-xl outline-none"
        data-testid="new-matter"
      >
        <header className="border-line border-b px-5 pt-5 pb-4 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={`${id}-title`} className="font-display text-ink text-xl font-bold">
                새 사건 만들기
              </h2>
              <p className="text-muted mt-1 text-[13px] leading-relaxed">
                칸은 모두 선택이에요. 아는 만큼만 적고, 나머지는 사건 화면에서 서류를 올리거나 더
                적으면 돼요.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-muted hover:text-ink -mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <ol aria-label="단계" className="mt-4 flex items-center gap-2">
            {steps.map((s, i) => {
              const state = i < step ? "done" : i === step ? "now" : "next";
              return (
                <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    aria-current={state === "now" ? "step" : undefined}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      state === "next"
                        ? "border-line text-muted border bg-white"
                        : "bg-ink text-white"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span
                    className={`shrink-0 text-[13px] font-semibold whitespace-nowrap ${
                      state === "next" ? "text-muted" : "text-ink"
                    } ${state === "now" ? "" : "hidden sm:inline"}`}
                  >
                    {s}
                  </span>
                  {i < last && <span aria-hidden="true" className="bg-line h-px min-w-4 flex-1" />}
                </li>
              );
            })}
          </ol>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="시작 방법">
              {START_MODES.map((m) => {
                const on = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setMode(m.value)}
                    className={`rounded-card flex flex-col items-start gap-2 border p-4 text-left transition-shadow ${
                      on
                        ? "border-ink bg-cream/40 shadow-[0_0_0_1px_var(--ink)]"
                        : "border-line hover:border-ink bg-white"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-ink text-[16px] font-bold">{m.title}</span>
                      <span
                        aria-hidden="true"
                        className={`flex size-5 items-center justify-center rounded-full border ${
                          on ? "border-ink bg-ink" : "border-line bg-white"
                        }`}
                      >
                        {on && <span className="size-2 rounded-full bg-white" />}
                      </span>
                    </span>
                    <span className="text-muted text-[13px] leading-relaxed">{m.body}</span>
                    <span className="text-ink mt-auto pt-1 text-[12px] font-semibold">
                      {m.next}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted text-[13px]">
                  {mode === "docs"
                    ? "서류를 읽으면 사실관계·당사자는 자동으로 채워져요."
                    : "한 줄에 하나씩 적으면 사건 화면에서 항목으로 나뉘어요."}
                </p>
                <button
                  type="button"
                  onClick={() => setV({ ...START_EXAMPLE })}
                  className="text-link text-[13px] font-semibold underline-offset-2 hover:underline"
                >
                  예시 채워 보기
                </button>
              </div>

              <Field
                id={`${id}-title-input`}
                label="사건 이름"
                hint="비워 두면 자료를 읽은 뒤 AI(Haiku)가 지어요."
                count={`${v.title.length}/${START_LIMITS.title}`}
              >
                <input
                  id={`${id}-title-input`}
                  className={input}
                  value={v.title}
                  maxLength={START_LIMITS.title}
                  placeholder="예: 전세 보증금 반환"
                  onChange={(e) => set("title", e.target.value)}
                />
              </Field>

              <Field label="내 입장" hint="사건 화면의 구조도에서 나를 어느 쪽에 둘지 정해요.">
                <div role="radiogroup" aria-label="내 입장" className="grid gap-2 sm:grid-cols-3">
                  {MY_SIDE_CHOICES.map((c) => {
                    const on = v.mySide === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set("mySide", c.value)}
                        className={`rounded-button border px-3 py-2.5 text-left ${
                          on ? "border-ink bg-ink text-white" : "border-line hover:border-ink"
                        }`}
                      >
                        <span className="block text-[14px] font-bold">{c.label}</span>
                        <span
                          className={`mt-0.5 block text-[12px] leading-snug ${on ? "text-white/80" : "text-muted"}`}
                        >
                          {c.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {mode === "write" && (
                <>
                  <Field
                    label="상대방"
                    hint="이름 대신 '집주인'·'전 회사'처럼 적어도 돼요. 연락처·주소는 적지 마세요."
                  >
                    <Parties value={v.parties} onChange={(p) => set("parties", p)} />
                  </Field>
                  <Field
                    id={`${id}-facts`}
                    label="있었던 일"
                    hint="한 줄에 하나, 일어난 순서대로. 줄 앞에 날짜(2026.03.02)를 적으면 날짜 칸으로 나눠요."
                    count={`${v.facts.length}/${START_LIMITS.lines}`}
                  >
                    <textarea
                      id={`${id}-facts`}
                      className={`${input} resize-y`}
                      rows={5}
                      value={v.facts}
                      maxLength={START_LIMITS.lines}
                      placeholder={"2026.03.02 계약이 끝남\n보증금을 돌려받지 못함"}
                      onChange={(e) => set("facts", e.target.value)}
                    />
                  </Field>
                  <Field
                    id={`${id}-demands`}
                    label="받은 요구·하려는 요구"
                    hint="한 줄에 하나. 상대에게 받은 요구도, 내가 하려는 요구도 괜찮아요."
                    count={`${v.demands.length}/${START_LIMITS.lines}`}
                  >
                    <textarea
                      id={`${id}-demands`}
                      className={`${input} resize-y`}
                      rows={3}
                      value={v.demands}
                      maxLength={START_LIMITS.lines}
                      placeholder="보증금을 돌려 달라고 요구"
                      onChange={(e) => set("demands", e.target.value)}
                    />
                  </Field>
                  <Field
                    id={`${id}-summary`}
                    label="한 줄 요약"
                    count={`${v.summary.length}/${START_LIMITS.summary}`}
                  >
                    <input
                      id={`${id}-summary`}
                      className={input}
                      value={v.summary}
                      maxLength={START_LIMITS.summary}
                      placeholder="예: 계약이 끝났는데 보증금을 돌려받지 못한 일"
                      onChange={(e) => set("summary", e.target.value)}
                    />
                  </Field>
                </>
              )}
              <p className="text-muted text-[13px] leading-relaxed">
                전화번호·주민등록번호·계좌번호·주소는 적지 마세요. 적더라도 저장할 때 알아볼 수 있는
                꼴은 가려요.
              </p>
            </div>
          )}

          {step === 2 && (
            <div data-testid="new-matter-review">
              <p className="text-ink text-[15px] font-semibold">
                {v.title.trim() || "이름 없는 사건 (AI가 지어요)"}
              </p>
              <p className="text-muted mt-0.5 text-[13px]">
                내 입장 · {MY_SIDE_CHOICES.find((c) => c.value === v.mySide)?.label}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["상대방", counts.parties],
                    ["있었던 일", counts.facts],
                    ["날짜 있는 일", counts.dated],
                    ["요구", counts.demands],
                  ] as const
                ).map(([k, n]) => (
                  <div key={k} className="bg-soft rounded-card px-3 py-3">
                    <dt className="text-muted text-[12px] font-semibold">{k}</dt>
                    <dd className="text-ink mt-1 text-[20px] font-bold tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
              {counts.summary && (
                <p className="border-line text-ink mt-3 rounded-[8px] border px-3 py-2 text-[14px] leading-relaxed">
                  {v.summary.trim()}
                </p>
              )}
              <p className="text-muted mt-4 text-[13px] leading-relaxed">
                {counts.parties + counts.facts + counts.demands === 0
                  ? "적은 내용이 없어도 괜찮아요. 빈 사건으로 만들고 사건 화면에서 채워요."
                  : "적은 그대로 담겨요. 목록의 법 분야·한 줄 요약은 이름·연락처를 가린 뒤 AI(Haiku)가 붙여요. 사건 화면에서 언제든 고치거나 지울 수 있어요."}
              </p>
            </div>
          )}
        </div>

        <footer className="border-line border-t px-5 py-4 sm:px-7">
          {error && (
            <p role="alert" className="text-ink mb-2 text-[13px] font-semibold">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted text-[12px] leading-relaxed">
              {step === last
                ? "만든 사건은 내 계정에만 저장돼요. 질문 횟수는 쓰지 않아요."
                : `${step + 1} / ${steps.length} 단계`}
            </p>
            <div className="flex gap-2">
              {step > 0 && (
                <SecondaryButton
                  disabled={busy}
                  onClick={() => setStep((s) => (s - 1) as Step)}
                  className="flex-1 sm:flex-none"
                >
                  이전
                </SecondaryButton>
              )}
              {step < last ? (
                <PrimaryButton
                  onClick={() => setStep((s) => (s + 1) as Step)}
                  className="flex-1 sm:flex-none"
                >
                  다음
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  disabled={busy}
                  onClick={() => void make()}
                  className="flex-1 sm:flex-none"
                >
                  {busy ? "만드는 중…" : mode === "docs" ? "만들고 서류 올리기" : "사건 만들기"}
                </PrimaryButton>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  count,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {id ? (
          <label htmlFor={id} className="text-ink text-[15px] font-semibold">
            {label}
            <span className="text-muted ml-1 text-xs font-normal">선택</span>
          </label>
        ) : (
          <p className="text-ink text-[15px] font-semibold">
            {label}
            <span className="text-muted ml-1 text-xs font-normal">선택</span>
          </p>
        )}
        {count && <span className="text-muted text-xs tabular-nums">{count}</span>}
      </div>
      {hint && <p className="text-muted mt-0.5 text-[13px] leading-snug">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** 상대방 줄: 이름 + 종류(회사·기관·개인·집단). 처음에는 START_LIMITS.parties명까지 받는다 */
function Parties({
  value,
  onChange,
}: {
  value: { name: string; kind: MatterKind }[];
  onChange: (v: { name: string; kind: MatterKind }[]) => void;
}) {
  const rows = value.length ? value : [{ name: "", kind: "person" as MatterKind }];
  const put = (i: number, p: Partial<{ name: string; kind: MatterKind }>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <input
            aria-label={`상대방 ${i + 1} 이름`}
            className={`${input} min-w-0 flex-1 basis-full sm:basis-auto`}
            value={r.name}
            maxLength={START_LIMITS.partyName}
            placeholder="예: 집주인"
            onChange={(e) => put(i, { name: e.target.value })}
          />
          <div
            role="radiogroup"
            aria-label={`상대방 ${i + 1} 종류`}
            className="bg-soft inline-flex shrink-0 rounded-full p-1"
          >
            {MATTER_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={r.kind === k}
                onClick={() => put(i, { kind: k })}
                className={`min-h-8 rounded-full px-2.5 text-[12px] font-semibold ${
                  r.kind === k ? "text-ink bg-white shadow-sm" : "text-muted"
                }`}
              >
                {MATTER_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              aria-label={`상대방 ${i + 1} 빼기`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="text-muted hover:text-ink flex size-9 shrink-0 items-center justify-center text-lg"
            >
              ×
            </button>
          )}
        </div>
      ))}
      {rows.length < START_LIMITS.parties && (
        <button
          type="button"
          onClick={() => onChange([...rows, { name: "", kind: "person" }])}
          className="border-line text-ink hover:border-ink rounded-button self-start border border-dashed px-3 py-1.5 text-[13px] font-semibold"
        >
          + 상대방 더하기
        </button>
      )}
    </div>
  );
}
