"use client";
// 자료 첨부 창 (F-017, DEC-058): 동의 → 자료 읽기(Haiku 1회) → 읽은 내용 확인·수정 → 질문 보내기(또는 검색어 고르기).
// - 동의 전에는 사진을 서버로 보내지 않는다. 사진 전송 동의와 민감정보 처리 동의를 따로 받는다 (서류 분석과 같다).
// - 읽은 내용은 서버가 개인정보를 가린 것만 온다. 사용자가 고친 내용은 질문과 함께 보내고 서버가 한 번 더 거른다.
// - 자료가 증거로 쓸모 있는지·유리한지는 표시하지 않는다 (절대 규칙 2).
import { useEffect, useId, useRef, useState } from "react";
import { CASEFILE_LIMITS } from "@/lib/casefile/limits";
import type { PreparedImage } from "@/lib/client/casefile";
import { MATERIALS_UNAVAILABLE, materialsErrorText, readMaterials } from "@/lib/client/materials";
import { MAX_INPUT_CHARS } from "@/lib/inquiries/policy";
import {
  DEFAULT_MATERIAL_QUESTION,
  MATERIAL_KINDS,
  MATERIAL_LIMITS,
  type MaterialKind,
  type MaterialReading,
} from "@/lib/materials/limits";
import type { PiiFinding } from "@/lib/pii";
import { PrimaryButton, SecondaryButton } from "../Modal";

type Step =
  | { kind: "consent" }
  | { kind: "reading" }
  | { kind: "stopped"; message: string }
  | {
      kind: "review";
      materials: MaterialReading[];
      queries: string[];
      findings: PiiFinding[];
      notice: string | null;
      dropped: number;
    };

const PII_LABEL: Record<string, string> = {
  name: "이름",
  phone: "전화번호",
  rrn: "주민등록번호",
  account: "계좌번호",
  email: "이메일",
  address: "주소",
};

export type MaterialsFlowProps = {
  images: PreparedImage[];
  /** 질문창에 적어 둔 글 */
  question: string;
  /** ask = 질문과 함께 보내기, search = 판례 검색어 고르기 */
  mode: "ask" | "search";
  /** DeepSearch로 보낼지 (안내 문구만 다르다) */
  deep?: boolean;
  busy: boolean;
  error?: string | null;
  /** ask: 읽은 내용을 확인한 뒤 질문 보내기 */
  onSend?: (text: string, materials: MaterialReading[]) => void;
  /** search: 고른 검색어와 읽은 내용 */
  onPick?: (query: string, materials: MaterialReading[], notice: string | null) => void;
  /** 하루 횟수를 다 썼을 때 — 창을 닫고 한도 안내를 띄운다 */
  onLimit: () => void;
  onClose: () => void;
};

export function MaterialsFlow(props: MaterialsFlowProps) {
  const { images, question, onLimit, onClose } = props;
  const panel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>({ kind: "consent" });

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function read() {
    setStep({ kind: "reading" });
    const r = await readMaterials(images, question);
    if (!r.ok) {
      const reason = r.error.details?.reason;
      const limit =
        r.error.code === "LOGIN_REQUIRED" ||
        (r.error.code === "RATE_LIMITED" && reason === "user_daily");
      if (limit) return onLimit();
      return setStep({ kind: "stopped", message: materialsErrorText(r.error.code, reason) });
    }
    if (!r.data.ai.used || r.data.materials.length === 0) {
      const reason = r.data.ai.used ? "unreadable" : r.data.ai.reason;
      return setStep({ kind: "stopped", message: MATERIALS_UNAVAILABLE[reason] });
    }
    setStep({
      kind: "review",
      materials: r.data.materials,
      queries: r.data.queries,
      findings: r.data.piiFindings,
      notice: r.data.notice,
      dropped: r.data.dropped,
    });
  }

  const title =
    step.kind === "consent"
      ? "자료 사진을 읽기 전에 확인해 주세요"
      : step.kind === "reading"
        ? "자료를 읽고 있어요"
        : step.kind === "stopped"
          ? "자료를 읽지 못했어요"
          : "읽은 내용이 맞는지 확인해 주세요";

  return (
    <div className="bg-ink/50 fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hz-materials-title"
        tabIndex={-1}
        className="rounded-panel border-line flex max-h-[92vh] w-full max-w-[620px] flex-col border bg-white shadow-xl outline-none"
        data-testid="materials-flow"
      >
        <div className="border-line flex items-start justify-between gap-3 border-b px-5 py-4">
          <h2 id="hz-materials-title" className="font-display text-ink text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-muted hover:text-ink -mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          {step.kind === "consent" && (
            <Consent
              count={images.length}
              mode={props.mode}
              onAccept={() => void read()}
              onClose={onClose}
            />
          )}
          {step.kind === "reading" && (
            <div className="flex flex-col items-center gap-4 py-10" role="status">
              <span className="border-ink/15 border-t-ink size-9 animate-spin rounded-full border-[3px]" />
              <p className="text-muted text-[15px]">
                자료 {images.length}개가 어떤 자료인지 보고, 개인정보를 가리는 중이에요.
              </p>
            </div>
          )}
          {step.kind === "stopped" && (
            <>
              <p role="alert" className="text-ink text-[15px] leading-relaxed">
                {step.message}
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
              </div>
            </>
          )}
          {step.kind === "review" && <Review {...props} step={step} />}
        </div>
      </div>
    </div>
  );
}

function Consent({
  count,
  mode,
  onAccept,
  onClose,
}: {
  count: number;
  mode: "ask" | "search";
  onAccept: () => void;
  onClose: () => void;
}) {
  const [send, setSend] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  return (
    <>
      <ul className="text-ink list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
        <li>
          자료 {count}개를 AI 모델 제공자(Anthropic)에게 보내 어떤 자료인지와 적힌 내용을 읽어요.
          사진과 PDF는 나와 상대방의 이름·연락처 같은 개인정보가 가려지지 않은 채 그대로 가요.
        </li>
        <li>
          한글·워드·파워포인트·엑셀·텍스트 문서는 글만 꺼내 이름·연락처·주소 같은 개인정보를 가린 뒤
          보내요. 다만 모든 이름을 빠짐없이 가리지는 못할 수 있어요.
        </li>
        <li>
          사진·파일은 읽는 데만 쓰고 햄찌법원 서버에 저장하지 않아요. 읽은 내용은 개인정보를 가린
          정리만 {mode === "ask" ? "질문과 함께 남겨요." : "이 화면에 보여 줘요."}
        </li>
        <li>자료가 증거로 쓸모 있는지, 사건에 어떤 영향을 줄지는 판단하지 않아요.</li>
        <li>주민등록번호나 계좌번호가 보이는 부분은 가리고 찍으면 더 안전해요.</li>
      </ul>
      <label className="text-ink mt-4 flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={send}
          onChange={(e) => setSend(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        자료 사진·PDF·문서를 AI에게 보내 읽는 데 동의합니다 (필수)
      </label>
      <label className="text-ink flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        자료와 함께 보낼 질문에 든 건강·범죄경력 같은 민감정보 처리에 동의합니다 (필수)
      </label>
      <a href="/privacy" target="_blank" className="text-link text-[13px] underline">
        자세히 보기 · 개인정보처리방침
      </a>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton disabled={!send || !sensitive} onClick={onAccept}>
          동의하고 자료 읽기
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      </div>
    </>
  );
}

function Review({
  step,
  question,
  mode,
  deep,
  busy,
  error,
  onSend,
  onPick,
  onClose,
}: MaterialsFlowProps & { step: Extract<Step, { kind: "review" }> }) {
  const id = useId();
  const [list, setList] = useState(step.materials);
  const [ask, setAsk] = useState(question.slice(0, MAX_INPUT_CHARS));
  const update = (i: number, patch: Partial<MaterialReading>) =>
    setList((l) => l.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const kept = list
    .map((m) => ({
      ...m,
      summary: m.summary.trim(),
      details: m.details.map((d) => d.trim()).filter(Boolean),
    }))
    .filter((m) => m.summary);
  const text = ask.trim() || DEFAULT_MATERIAL_QUESTION;
  const empty = kept.length === 0;

  return (
    <>
      {step.notice && (
        <p className="bg-cream text-label inline-block rounded-[6px] px-2 py-0.5 text-xs font-semibold">
          {step.notice}
        </p>
      )}
      <p className="text-muted mt-2 text-[14px] leading-relaxed">
        AI가 사진에서 읽은 내용이에요. 날짜와 금액이 사진과 같은지 꼭 확인하고, 틀린 곳은 고쳐
        주세요. 필요 없는 자료는 빼도 돼요.
      </p>
      {step.findings.length > 0 && (
        <p className="text-muted mt-2 text-[13px]">
          가린 개인정보:{" "}
          {step.findings.map((f) => `${PII_LABEL[f.type] ?? f.type} ${f.count}`).join(" · ")}
        </p>
      )}
      {step.dropped > 0 && (
        <p className="text-muted mt-1 text-[13px]">
          조문 번호·사건번호나 결과를 내다보는 표현이 든 문장 {step.dropped}개는 뺐어요.
        </p>
      )}

      <ol className="mt-3 flex flex-col gap-3">
        {list.map((m, i) => (
          <li key={i} className="rounded-card border-line border px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-ink rounded-[6px] px-2 py-0.5 text-xs font-bold text-white">
                자료 {i + 1}
              </span>
              <label className="sr-only" htmlFor={`${id}-kind-${i}`}>
                자료 {i + 1} 종류
              </label>
              <select
                id={`${id}-kind-${i}`}
                value={m.kind}
                onChange={(e) => update(i, { kind: e.target.value as MaterialKind })}
                className="rounded-button border-line text-ink min-h-11 border bg-white px-2 text-[14px]"
              >
                {MATERIAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setList((l) => l.filter((_, j) => j !== i))}
                className="text-muted hover:text-ink ml-auto min-h-11 px-2 text-[13px] underline-offset-2 hover:underline"
              >
                이 자료 빼기
              </button>
            </div>
            <label
              htmlFor={`${id}-sum-${i}`}
              className="text-ink mt-2 block text-[13px] font-semibold"
            >
              어떤 자료인지
            </label>
            <textarea
              id={`${id}-sum-${i}`}
              value={m.summary}
              onChange={(e) => update(i, { summary: e.target.value })}
              maxLength={MATERIAL_LIMITS.summaryChars}
              rows={2}
              className="rounded-card border-line text-ink mt-1 w-full resize-y border bg-white px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-[var(--gold)]"
            />
            {m.details.length > 0 && (
              <>
                <p className="text-ink mt-2 text-[13px] font-semibold">사진에 적힌 내용</p>
                <ul className="mt-1 space-y-1.5">
                  {m.details.map((d, j) => (
                    <li key={j}>
                      <input
                        value={d}
                        onChange={(e) =>
                          update(i, {
                            details: m.details.map((v, k) => (k === j ? e.target.value : v)),
                          })
                        }
                        maxLength={MATERIAL_LIMITS.detailChars}
                        aria-label={`자료 ${i + 1} 적힌 내용 ${j + 1}`}
                        className="rounded-button border-line text-ink min-h-11 w-full border bg-white px-3 text-[14px] outline-none focus:border-[var(--gold)]"
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {m.gaps.length > 0 && (
              <p className="text-muted mt-2 text-[13px]">확인하지 못한 것: {m.gaps.join(" · ")}</p>
            )}
          </li>
        ))}
      </ol>

      {mode === "ask" ? (
        <>
          <label htmlFor={`${id}-ask`} className="text-ink mt-4 block text-[14px] font-semibold">
            궁금한 점
          </label>
          <textarea
            id={`${id}-ask`}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={MAX_INPUT_CHARS}
            rows={3}
            placeholder="비워 두면 자료와 관련된 법령·판례, 살펴볼 점과 절차를 물어봐요"
            className="rounded-card border-line text-ink placeholder:text-muted/70 mt-1 w-full resize-y border bg-white px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-[var(--gold)]"
          />
          <p className="text-muted mt-2 text-[13px]">
            {deep
              ? "질문 1번으로 세고, 자료 내용을 함께 넣어 쟁점별로 법령·판례를 찾는 DeepSearch로 분석해요."
              : "질문 1번으로 세고, 자료 내용을 함께 넣어 법령·판례를 찾아 답해요."}
          </p>
          {error && (
            <p role="alert" className="text-warn-text mt-2 text-[14px]">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <PrimaryButton disabled={busy || empty} onClick={() => onSend?.(text, kept)}>
              자료와 함께 물어보기
            </PrimaryButton>
            <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
          </div>
        </>
      ) : (
        <>
          <p className="text-ink mt-4 text-[14px] font-semibold">이 자료와 관련된 검색어</p>
          {step.queries.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-2">
              {step.queries.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={empty}
                  onClick={() => onPick?.(q, kept, step.notice)}
                  className="border-gold-line bg-cream text-ink hover:border-gold min-h-11 rounded-full border px-4 text-[14px] font-semibold disabled:opacity-50"
                >
                  {q} 찾기
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-1 text-[13px]">
              알맞은 검색어를 찾지 못했어요. 아래 단추를 누른 뒤 검색창에 직접 적어 주세요.
            </p>
          )}
          {question.trim() && (
            <button
              type="button"
              disabled={empty}
              onClick={() => onPick?.(question.trim().slice(0, 100), kept, step.notice)}
              className="text-link mt-2 min-h-11 text-[14px] underline-offset-2 hover:underline"
            >
              적어 둔 검색어로 찾기
            </button>
          )}
          <p className="text-muted mt-2 text-[13px]">
            검색은 질문 횟수와 따로 세요. 검색 결과는 법제처 자료이고, 위 자료 정리는 이 화면에만
            보여요.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {step.queries.length === 0 && !question.trim() && (
              <PrimaryButton disabled={empty} onClick={() => onPick?.("", kept, step.notice)}>
                자료 정리만 보기
              </PrimaryButton>
            )}
            <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
          </div>
        </>
      )}
      <p className="text-muted mt-3 text-[12px]">
        사진·문서는 {CASEFILE_LIMITS.maxImages}개까지 · 사진·파일은 저장하지 않아요.
      </p>
    </>
  );
}
