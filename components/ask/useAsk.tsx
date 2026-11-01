"use client";
// 질문 보내기 흐름 (F-001, F-007, DEC-010): 입력 → POST /inquiries → (민감정보 동의 S-02b) → (가린 문장 확인 S-02a)
// → pii-confirmation → 결과 화면 /inquiries/[id]에서 분석. 3회를 다 쓰면 로그인 안내(S-06).
// 원문은 입력란에만 있고 브라우저에 저장하지 않는다. 저장하는 것은 서버가 돌려준 마스킹본뿐 (DEC-006).
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmPii,
  createInquiry,
  notifyQuotaChanged,
  rememberQuestion,
  type ClientError,
} from "@/lib/client/api";
import type { PiiFinding } from "@/lib/pii";
import { LoginNotice } from "../LoginNotice";
import { Modal, PrimaryButton, SecondaryButton } from "../Modal";

type Pending =
  | { kind: "none" }
  | { kind: "consent"; text: string; categories: string[] }
  | { kind: "pii"; id: string; findings: PiiFinding[]; maskedText: string }
  | { kind: "login" };

const PII_LABEL: Record<string, string> = {
  name: "이름",
  phone: "전화번호",
  rrn: "주민등록번호",
  account: "계좌번호",
  email: "이메일",
  address: "주소",
};

const SENSITIVE_LABEL: Record<string, string> = {
  health: "건강 정보",
  criminal_record: "범죄경력 정보",
};

/** 사용자에게 보여 줄 오류 문장. 서버 고정 문구만 쓰고, 입력 내용은 넣지 않는다 */
export function askErrorText(err: ClientError): string {
  if (err.code === "EMPTY_INPUT") return "내용을 적어 주세요.";
  if (err.code === "VALIDATION_ERROR") return "질문은 2,000자까지 적을 수 있어요.";
  if (err.code === "RATE_LIMITED")
    return "오늘은 이 네트워크에서 질문을 많이 했어요. 내일 다시 오시거나 로그인해 주세요.";
  return `${err.message}${err.requestId ? ` (오류 번호 ${err.requestId})` : ""}`;
}

export function useAsk(opts: { parentInquiryId?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>({ kind: "none" });

  const go = (id: string) => {
    notifyQuotaChanged();
    router.push(`/inquiries/${id}`);
  };

  async function send(text: string, sensitiveConsent = false) {
    setError(null);
    if (!text.trim()) {
      setError("내용을 적어 주세요.");
      return;
    }
    setBusy(true);
    const r = await createInquiry({
      text,
      ...(sensitiveConsent && { sensitiveConsent: true }),
      ...(opts.parentInquiryId && { parentInquiryId: opts.parentInquiryId }),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "CONSENT_REQUIRED") {
        const cats = r.error.details?.categories;
        setPending({ kind: "consent", text, categories: Array.isArray(cats) ? cats : [] });
      } else if (r.error.code === "LOGIN_REQUIRED") {
        notifyQuotaChanged();
        setPending({ kind: "login" });
      } else {
        setError(askErrorText(r.error));
      }
      return;
    }
    rememberQuestion(r.data.id, r.data.maskedText, opts.parentInquiryId);
    if (r.data.piiConfirmationRequired) {
      setPending({
        kind: "pii",
        id: r.data.id,
        findings: r.data.piiFindings,
        maskedText: r.data.maskedText,
      });
      return;
    }
    go(r.data.id);
  }

  async function acceptMasked(id: string) {
    setBusy(true);
    const r = await confirmPii(id);
    setBusy(false);
    if (!r.ok) {
      setPending({ kind: "none" });
      setError(askErrorText(r.error));
      return;
    }
    go(id);
  }

  const close = () => setPending({ kind: "none" });

  const modals =
    pending.kind === "login" ? (
      <LoginNotice reason="quota" onClose={close} />
    ) : pending.kind === "consent" ? (
      <ConsentModal
        categories={pending.categories}
        busy={busy}
        onAccept={() => {
          const text = pending.text;
          close();
          void send(text, true);
        }}
        onClose={close}
      />
    ) : pending.kind === "pii" ? (
      <Modal title="개인정보로 보이는 내용을 가렸어요" onClose={close}>
        <p className="text-muted text-[15px] leading-relaxed">
          가린 문장만 저장하고 분석해요. 적으신 원문은 저장하지 않아요.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {pending.findings.map((f) => (
            <li
              key={f.type}
              className="bg-cream text-label rounded-[6px] px-2.5 py-1 text-xs font-semibold"
            >
              {PII_LABEL[f.type] ?? f.type} {f.count}
            </li>
          ))}
        </ul>
        <p className="text-muted mt-4 text-[13px]">가린 문장</p>
        <p className="rounded-card bg-soft text-ink mt-1 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
          {pending.maskedText}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <PrimaryButton disabled={busy} onClick={() => void acceptMasked(pending.id)}>
            이대로 분석하기
          </PrimaryButton>
          <SecondaryButton onClick={close}>내용 고치기</SecondaryButton>
        </div>
      </Modal>
    ) : null;

  return { busy, error, setError, send, modals, needLogin: () => setPending({ kind: "login" }) };
}

function ConsentModal({
  categories,
  busy,
  onAccept,
  onClose,
}: {
  categories: string[];
  busy: boolean;
  onAccept: () => void;
  onClose: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const names = categories.map((c) => SENSITIVE_LABEL[c] ?? c).join(" · ");
  return (
    <Modal title="민감한 정보가 들어 있을 수 있어요" onClose={onClose}>
      <p className="text-muted text-[15px] leading-relaxed">
        {names ? `${names} 같은 ` : "건강이나 범죄경력 같은 "}정보는 따로 동의를 받은 뒤에만
        처리하고 저장해요. 동의하지 않으면 아무것도 저장하지 않아요.
      </p>
      <label className="text-ink mt-4 flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="size-5 accent-[var(--ink)]"
        />
        민감정보 처리에 동의합니다 (필수)
      </label>
      <a href="/privacy" target="_blank" className="text-link text-[13px] underline">
        자세히 보기 · 개인정보처리방침
      </a>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton disabled={!agreed || busy} onClick={onAccept}>
          동의하고 계속
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>내용 고치기</SecondaryButton>
      </div>
    </Modal>
  );
}
