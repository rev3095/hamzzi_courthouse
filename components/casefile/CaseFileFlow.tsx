"use client";
// 서류 분석 창 (F-015, DEC-052): 동의 → 서류 읽기(Haiku 1회) → 읽은 내용 확인·수정 → 분석 보내기.
// auto(DEC-065, 홈 질문창)면 읽은 내용으로 곧바로 분석을 보낸다 — 확인 화면은 보내는 동안과 실패했을 때만 보인다.
// - 동의 전에는 사진을 서버로 보내지 않는다. 사진 전송 동의와 민감정보 처리 동의를 따로 받는다.
// - 읽은 내용은 서버가 개인정보를 가린 것만 온다. 개인의 이름은 보이지 않고, 법인·사업자·기관 이름만 보인다.
// - 사용자가 확인·수정한 사건 개요는 일반 질문과 같은 길(가리기 → 저장 → 검색 → 답변 → 인용 검증)로 간다.
// - 누가 옳은지·이길지는 표시하지 않는다. 당사자는 서류에 적힌 역할과 자리(요구하는 쪽 / 받는 쪽)로만 나눈다 (절대 규칙 2).
import { useEffect, useId, useRef, useState } from "react";
import {
  CASEFILE_LIMITS,
  KIND_LABEL,
  MY_SIDE_LABEL,
  PARTY_SIDES,
  SIDE_LABEL,
  composeCaseText,
  type CaseParty,
  type CaseReading,
  type MySide,
} from "@/lib/casefile/limits";
import {
  READ_UNAVAILABLE,
  readCaseFiles,
  readErrorText,
  type PreparedImage,
} from "@/lib/client/casefile";
import { MAX_INPUT_CHARS } from "@/lib/inquiries/policy";
import type { PiiFinding } from "@/lib/pii";
import { PrimaryButton, SecondaryButton } from "../Modal";

type Step =
  | { kind: "consent" }
  | { kind: "reading" }
  | { kind: "stopped"; message: string; limit?: boolean }
  | {
      kind: "review";
      reading: CaseReading;
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

export function CaseFileFlow({
  images,
  question,
  busy,
  error,
  auto = false,
  onAnalyze,
  onLimit,
  onClose,
}: {
  /** 읽은 내용으로 곧바로 분석을 보낸다 (DEC-065) */
  auto?: boolean;
  images: PreparedImage[];
  /** 질문창에 적어 둔 글 */
  question: string;
  /** 분석 요청을 보내는 중 */
  busy: boolean;
  /** 분석 요청이 실패했을 때의 문장 */
  error?: string | null;
  onAnalyze: (text: string, parties: CaseParty[]) => void;
  /** 하루 횟수를 다 썼을 때 — 창을 닫고 한도 안내를 띄운다 */
  onLimit: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>({ kind: "consent" });
  // 읽자마자 분석을 보냈는지 (auto)
  const [sent, setSent] = useState(false);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function read() {
    setStep({ kind: "reading" });
    const r = await readCaseFiles(images, question.slice(0, CASEFILE_LIMITS.questionChars));
    if (!r.ok) {
      const reason = r.error.details?.reason;
      const limit =
        r.error.code === "LOGIN_REQUIRED" ||
        (r.error.code === "RATE_LIMITED" && reason === "user_daily");
      if (limit) return onLimit();
      return setStep({ kind: "stopped", message: readErrorText(r.error.code, reason) });
    }
    if (!r.data.ai.used || !r.data.reading) {
      const reason = r.data.ai.used ? "model_failed" : r.data.ai.reason;
      return setStep({ kind: "stopped", message: READ_UNAVAILABLE[reason] });
    }
    if (auto && r.data.reading.summary.trim()) {
      const text = composeCaseText({
        docTypes: r.data.reading.docTypes,
        summary: r.data.reading.summary,
        claims: r.data.reading.claims,
        mySide: "unknown",
        question: question.slice(0, CASEFILE_LIMITS.questionChars),
      });
      if (text.length <= MAX_INPUT_CHARS) {
        setSent(true);
        onAnalyze(text, r.data.reading.parties);
      }
    }
    setStep({
      kind: "review",
      reading: r.data.reading,
      findings: r.data.piiFindings,
      notice: r.data.notice,
      dropped: r.data.dropped ?? 0,
    });
  }

  const title =
    step.kind === "consent"
      ? "자료를 읽기 전에 확인해 주세요"
      : step.kind === "reading"
        ? "서류를 읽고 있어요"
        : step.kind === "stopped"
          ? "서류를 읽지 못했어요"
          : sent && busy
            ? "읽은 내용으로 바로 분석하고 있어요"
            : "읽은 내용이 맞는지 확인해 주세요";

  return (
    <div className="bg-ink/50 fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hz-casefile-title"
        tabIndex={-1}
        className="rounded-panel border-line flex max-h-[92vh] w-full max-w-[600px] flex-col border bg-white shadow-xl outline-none"
      >
        <div className="border-line flex items-start justify-between gap-3 border-b px-5 py-4">
          <h2 id="hz-casefile-title" className="font-display text-ink text-xl font-bold">
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
              auto={auto}
              onAccept={() => void read()}
              onClose={onClose}
            />
          )}
          {step.kind === "reading" && (
            <div className="flex flex-col items-center gap-4 py-10" role="status">
              <span className="border-ink/15 border-t-ink size-9 animate-spin rounded-full border-[3px]" />
              <p className="text-muted text-[15px]">
                사진 {images.length}장에서 글자를 읽고 개인정보를 가리는 중이에요.
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
          {step.kind === "review" && (
            <Review
              reading={step.reading}
              findings={step.findings}
              notice={step.notice}
              dropped={step.dropped}
              question={question}
              busy={busy}
              error={error ?? null}
              onAnalyze={onAnalyze}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Consent({
  count,
  auto,
  onAccept,
  onClose,
}: {
  count: number;
  auto: boolean;
  onAccept: () => void;
  onClose: () => void;
}) {
  const [send, setSend] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  return (
    <>
      <ul className="text-ink list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
        <li>
          서류 {count}개를 AI 모델 제공자(Anthropic)에게 보내 읽어요. 사진과 PDF는 나와 상대방의
          이름·주소 같은 개인정보가 가려지지 않은 채 그대로 가요.
        </li>
        <li>
          한글·워드·파워포인트·엑셀·텍스트 문서는 글만 꺼내 이름·연락처·주소 같은 개인정보를 가린 뒤
          보내요. 다만 모든 이름을 빠짐없이 가리지는 못할 수 있어요.
        </li>
        <li>
          사진·파일은 읽는 데만 쓰고 햄찌법원 서버에 저장하지 않아요. 읽은 내용은 개인정보를 가린
          사건 개요만 남겨요.
        </li>
        <li>
          개인의 이름은 결과에 보이지 않고, 개인을 찾아보는 검색도 하지 않아요. 법인·사업자만 공개된
          정보를 찾아볼 수 있어요.
        </li>
        <li>주민등록번호나 계좌번호가 보이는 부분은 가리고 찍으면 더 안전해요.</li>
      </ul>
      <label className="text-ink mt-4 flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={send}
          onChange={(e) => setSend(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        서류 사진·PDF·문서를 AI에게 보내 읽는 데 동의합니다 (필수)
      </label>
      <label className="text-ink flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        서류에 든 건강·범죄경력 같은 민감정보 처리에 동의합니다 (필수)
      </label>
      <a href="/privacy" target="_blank" className="text-link text-[13px] underline">
        자세히 보기 · 개인정보처리방침
      </a>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton disabled={!send || !sensitive} onClick={onAccept}>
          {auto ? "동의하고 바로 분석하기" : "동의하고 서류 읽기"}
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      </div>
    </>
  );
}

function Review({
  reading,
  findings,
  notice,
  dropped,
  question,
  busy,
  error,
  onAnalyze,
  onClose,
}: {
  reading: CaseReading;
  findings: PiiFinding[];
  notice: string | null;
  dropped: number;
  question: string;
  busy: boolean;
  error: string | null;
  onAnalyze: (text: string, parties: CaseParty[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [summary, setSummary] = useState(reading.summary);
  const [ask, setAsk] = useState(question.slice(0, CASEFILE_LIMITS.questionChars));
  const [mySide, setMySide] = useState<MySide>("unknown");
  // 요구·주장도 사용자가 고칠 수 있다 (잘못 읽은 금액·기한을 그대로 보내지 않게). 비운 줄은 빠진다
  const [claims, setClaims] = useState(reading.claims);
  const text = composeCaseText({
    docTypes: reading.docTypes,
    summary,
    claims: claims.map((c) => c.trim()).filter(Boolean),
    mySide,
    question: ask,
  });
  const over = text.length > MAX_INPUT_CHARS;
  const empty = !summary.trim();

  return (
    <>
      {notice && (
        <p className="bg-cream text-label inline-block rounded-[6px] px-2 py-0.5 text-xs font-semibold">
          {notice}
        </p>
      )}
      <p className="text-muted mt-2 text-[14px] leading-relaxed">
        AI가 사진에서 읽은 내용이에요. 날짜와 금액이 서류와 같은지 꼭 확인하고, 틀린 곳은 고쳐
        주세요.
      </p>

      {reading.docTypes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="서류 종류">
          {reading.docTypes.map((d) => (
            <li key={d} className="bg-soft text-ink rounded-[6px] px-2.5 py-1 text-[13px]">
              {d}
            </li>
          ))}
        </ul>
      )}
      {findings.length > 0 && (
        <p className="text-muted mt-2 text-[13px]">
          가린 개인정보:{" "}
          {findings.map((f) => `${PII_LABEL[f.type] ?? f.type} ${f.count}`).join(" · ")}
        </p>
      )}

      {dropped > 0 && (
        <p className="text-muted mt-1 text-[13px]">
          조문 번호·사건번호나 결과를 내다보는 표현이 든 문장 {dropped}개는 뺐어요. 필요하면 아래에
          직접 적어 주세요.
        </p>
      )}

      <label htmlFor={`${id}-summary`} className="text-ink mt-4 block text-[14px] font-semibold">
        사건 개요
      </label>
      <textarea
        id={`${id}-summary`}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        maxLength={CASEFILE_LIMITS.summaryChars}
        rows={8}
        className="rounded-card border-line text-ink mt-1 w-full resize-y border bg-white px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-[var(--gold)]"
      />

      {claims.length > 0 && (
        <>
          <p className="text-ink mt-3 text-[14px] font-semibold">서류의 요구·주장</p>
          <ul className="mt-1 space-y-1.5">
            {claims.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <input
                  value={c}
                  onChange={(e) =>
                    setClaims((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  maxLength={140}
                  aria-label={`요구·주장 ${i + 1}`}
                  className="rounded-button border-line text-ink min-h-11 w-full border bg-white px-3 text-[14px] outline-none focus:border-[var(--gold)]"
                />
                <button
                  type="button"
                  onClick={() => setClaims((list) => list.filter((_, j) => j !== i))}
                  aria-label={`요구·주장 ${i + 1} 빼기`}
                  className="text-muted hover:text-ink flex size-11 shrink-0 items-center justify-center"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M2 2l10 10M12 2L2 12"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <PartyList parties={reading.parties} />

      <fieldset className="mt-4">
        <legend className="text-ink text-[14px] font-semibold">
          나는 이 서류에서 어느 쪽인가요?
        </legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {(Object.keys(MY_SIDE_LABEL) as MySide[]).map((s) => (
            <label
              key={s}
              className={`flex min-h-11 cursor-pointer items-center rounded-full border px-3.5 text-[14px] ${
                mySide === s
                  ? "border-gold bg-cream text-ink font-semibold"
                  : "border-line text-ink"
              }`}
            >
              <input
                type="radio"
                name={`${id}-side`}
                checked={mySide === s}
                onChange={() => setMySide(s)}
                className="sr-only"
              />
              {MY_SIDE_LABEL[s]}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={`${id}-ask`} className="text-ink mt-4 block text-[14px] font-semibold">
        궁금한 점
      </label>
      <textarea
        id={`${id}-ask`}
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        maxLength={CASEFILE_LIMITS.questionChars}
        rows={2}
        placeholder="비워 두면 쟁점과 진행 절차를 물어봐요"
        className="rounded-card border-line text-ink placeholder:text-muted/70 mt-1 w-full resize-y border bg-white px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-[var(--gold)]"
      />

      <p className={`mt-2 text-[13px] ${over ? "text-warn-text" : "text-muted"}`}>
        {over
          ? `내용이 너무 길어요 (${text.length}/${MAX_INPUT_CHARS}자). 사건 개요를 줄여 주세요.`
          : "분석은 질문 1번으로 세고, 쟁점별로 법제처 법령·판례를 찾는 DeepSearch 방식으로 해요."}
      </p>
      {error && (
        <p role="alert" className="text-warn-text mt-2 text-[14px]">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <PrimaryButton
          disabled={busy || over || empty}
          onClick={() => onAnalyze(text, reading.parties)}
        >
          이대로 분석하기
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>닫기</SecondaryButton>
      </div>
    </>
  );
}

/** 당사자를 서류에서의 자리로 나눠 보인다. 누가 옳은지는 표시하지 않는다 */
export function PartyList({
  parties,
  action,
}: {
  parties: CaseParty[];
  /** 법인·사업자 옆에 붙일 것 (결과 화면의 공개 정보 찾아보기) */
  action?: (party: CaseParty) => React.ReactNode;
}) {
  if (parties.length === 0) return null;
  return (
    <section className="mt-4" aria-label="당사자">
      <p className="text-ink text-[14px] font-semibold">서류에 적힌 당사자</p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {PARTY_SIDES.map((side) => {
          const list = parties.filter((p) => p.side === side);
          if (list.length === 0) return null;
          return (
            <div key={side} className="rounded-card border-line border px-3 py-2.5">
              <p className="text-muted text-[12px] font-semibold">{SIDE_LABEL[side]}</p>
              <ul className="mt-1 space-y-2">
                {list.map((p, i) => (
                  <li key={`${p.role}-${p.name}-${i}`} className="text-[14px]">
                    <span className="bg-cream text-label mr-1.5 rounded-[6px] px-1.5 py-0.5 text-[12px] font-semibold">
                      {p.role}
                    </span>
                    <span className="text-ink">
                      {p.kind === "person"
                        ? "개인 (이름은 표시하지 않아요)"
                        : p.name || `${KIND_LABEL[p.kind]} (이름을 읽지 못했어요)`}
                    </span>
                    {p.kind !== "person" && p.name && (
                      <span className="text-muted ml-1 text-[12px]">{KIND_LABEL[p.kind]}</span>
                    )}
                    {action?.(p)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-muted mt-1.5 text-[12px] leading-relaxed">
        서류에 적힌 역할을 그대로 옮긴 것이고, 누가 옳은지 판단한 것이 아니에요.
      </p>
    </section>
  );
}
