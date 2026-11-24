"use client";
// 질문 보내기 흐름 (F-001, F-007, DEC-010): 입력 → POST /inquiries → (민감정보 동의 S-02b) → (가린 문장 확인 S-02a)
// → pii-confirmation → 결과 화면 /inquiries/[id]에서 분석. 하루 횟수를 다 쓰면 데모 한도 안내(S-06 자리).
// 원문은 입력란에만 있고 브라우저에 저장하지 않는다. 저장하는 것은 서버가 돌려준 마스킹본뿐 (DEC-006).
import { useRouter } from "next/navigation";
import { isLongQuestion } from "@/lib/ai/models";
import { useState } from "react";
import {
  confirmPii,
  createInquiry,
  isUserDailyLimit,
  notifyQuotaChanged,
  rememberDeep,
  rememberQuestion,
  type ClientError,
} from "@/lib/client/api";
import { readSave } from "@/lib/client/save";
import type { MaterialReading } from "@/lib/materials/limits";
import type { PiiFinding } from "@/lib/pii";
import type { CategoryKey } from "@/lib/procedure/categories";
import { LimitNotice } from "../LimitNotice";
import { Modal, PrimaryButton, SecondaryButton } from "../Modal";

type Pending =
  | { kind: "none" }
  | {
      kind: "consent";
      text: string;
      deep: boolean;
      categories: string[];
      onCreated?: (id: string) => void;
      materials?: MaterialReading[];
    }
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
  if (err.code === "VALIDATION_ERROR") return "질문은 50,000자까지 적을 수 있어요.";
  if (err.code === "RATE_LIMITED")
    return "이 네트워크에서 질문을 많이 했어요. 24시간 안에 분석할 수 있는 횟수가 정해져 있어요. 잠시 뒤에 다시 와 주세요.";
  return `${err.message}${err.requestId ? ` (오류 번호 ${err.requestId})` : ""}`;
}

export function useAsk(
  opts: {
    parentInquiryId?: string;
    category?: CategoryKey | null;
    /**
     * 질문이 준비되면(저장·가린 문장 확인 뒤) 결과 화면으로 가는 대신 부른다 — 분야별 비서 대화(DEC-057)가
     * 같은 화면에서 이어서 분석할 때 쓴다. maskedText는 서버가 돌려준 마스킹본
     */
    onReady?: (id: string, maskedText: string) => void;
  } = {},
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>({ kind: "none" });

  const go = (id: string, maskedText: string) => {
    notifyQuotaChanged();
    if (opts.onReady) opts.onReady(id, maskedText);
    else router.push(`/inquiries/${id}`);
  };

  /**
   * onCreated: 질문이 저장된 직후(결과 화면으로 가기 전) 불린다 — 서류 분석이 당사자 목록을 이 탭에 남길 때 쓴다 (F-015).
   * materials: 질문과 함께 보낼 첨부 자료 판독 정리 (F-017, DEC-058). 서버가 다시 거른 뒤 질문 행에 저장한다.
   */
  async function send(
    text: string,
    sensitiveConsent = false,
    deep = false,
    onCreated?: (id: string) => void,
    materials?: MaterialReading[],
  ) {
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
      // 로그인 사용자가 "내 기록에 남기기"를 켜 두었을 때만 (DEC-039). 서버가 비로그인 요청에서는 무시한다
      ...(readSave() && { save: true }),
      ...(materials && materials.length > 0 && { materials }),
    });
    setBusy(false);
    if (!r.ok) {
      if (r.error.code === "CONSENT_REQUIRED") {
        const cats = r.error.details?.categories;
        setPending({
          kind: "consent",
          text,
          deep,
          categories: Array.isArray(cats) ? cats : [],
          onCreated,
          materials,
        });
      } else if (r.error.code === "LOGIN_REQUIRED" || isUserDailyLimit(r.error)) {
        notifyQuotaChanged();
        setPending({ kind: "login" });
      } else {
        setError(askErrorText(r.error));
      }
      return;
    }
    rememberQuestion(r.data.id, r.data.maskedText, opts.parentInquiryId, opts.category);
    // 100자를 넘는 질문은 서버가 DeepSearch로 분석한다(DEC-062) — 화면도 DeepSearch 진행 표시를 쓰게 같이 남긴다
    if (deep || isLongQuestion(r.data.maskedText)) rememberDeep(r.data.id);
    onCreated?.(r.data.id);
    if (r.data.piiConfirmationRequired) {
      setPending({
        kind: "pii",
        id: r.data.id,
        findings: r.data.piiFindings,
        maskedText: r.data.maskedText,
      });
      return;
    }
    go(r.data.id, r.data.maskedText);
  }

  async function acceptMasked(id: string, maskedText: string) {
    setBusy(true);
    const r = await confirmPii(id);
    setBusy(false);
    if (!r.ok) {
      setPending({ kind: "none" });
      setError(askErrorText(r.error));
      return;
    }
    setPending({ kind: "none" });
    go(id, maskedText);
  }

  const close = () => setPending({ kind: "none" });

  const modals =
    pending.kind === "login" ? (
      <LimitNotice onClose={close} />
    ) : pending.kind === "consent" ? (
      <ConsentModal
        categories={pending.categories}
        busy={busy}
        onAccept={() => {
          const { text, deep, onCreated, materials } = pending;
          close();
          void send(text, true, deep, onCreated, materials);
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
          <PrimaryButton
            disabled={busy}
            onClick={() => void acceptMasked(pending.id, pending.maskedText)}
          >
            이대로 분석하기
          </PrimaryButton>
          <SecondaryButton onClick={close}>내용 고치기</SecondaryButton>
        </div>
      </Modal>
    ) : null;

  return { busy, error, setError, send, modals, showLimit: () => setPending({ kind: "login" }) };
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
        처리하고 저장해요. 동의하면 가린 문장으로 법제처 법령·판례 검색도 해요. 동의하지 않으면
        아무것도 저장하지 않아요.
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
