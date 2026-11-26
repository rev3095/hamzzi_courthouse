"use client";
// 사진·문서 읽기 동의 화면 공통 부품 (DEC-067 UI·UX 개정 PR 3): 서류 분석(CaseFileFlow, F-015)과 자료 첨부(MaterialsFlow, F-017)가
// 따로 들고 있던 같은 모양의 동의 화면과 가린 정보 요약을 한 곳에 둔다. 안내 문장·동의 문장은 쓰는 쪽이 그대로 넘긴다
// (절대 규칙 4 예외의 동의 문구라 기능마다 다르게 적는다). 두 항목에 모두 동의해야 버튼이 눌린다.
import { useState, type ReactNode } from "react";
import type { PiiFinding } from "@/lib/pii";
import { PrimaryButton, SecondaryButton } from "../Modal";

const PII_LABEL: Record<string, string> = {
  name: "이름",
  phone: "전화번호",
  rrn: "주민등록번호",
  account: "계좌번호",
  email: "이메일",
  address: "주소",
};

/** 가린 개인정보 요약 ("이름 2 · 전화번호 1") */
export const piiSummary = (findings: Pick<PiiFinding, "type" | "count">[]) =>
  findings.map((f) => `${PII_LABEL[f.type] ?? f.type} ${f.count}`).join(" · ");

export function PhotoConsent({
  notes,
  sendLabel,
  sensitiveLabel,
  acceptLabel,
  onAccept,
  onClose,
}: {
  /** 무엇을 어디로 보내고 무엇을 남기는지 (목록 한 줄씩) */
  notes: ReactNode[];
  /** 첫째 동의: 사진·문서를 AI에게 보내 읽기 */
  sendLabel: string;
  /** 둘째 동의: 민감정보 처리 */
  sensitiveLabel: string;
  acceptLabel: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  const [send, setSend] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  return (
    <>
      <ul className="text-ink list-disc space-y-2 pl-5 text-[15px] leading-relaxed">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <label className="text-ink mt-4 flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={send}
          onChange={(e) => setSend(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        {sendLabel}
      </label>
      <label className="text-ink flex min-h-11 items-center gap-2.5 text-[15px]">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--ink)]"
        />
        {sensitiveLabel}
      </label>
      <a href="/privacy" target="_blank" className="text-link text-[13px] underline">
        자세히 보기 · 개인정보처리방침
      </a>
      <div className="mt-5 flex flex-col gap-2">
        <PrimaryButton disabled={!send || !sensitive} onClick={onAccept}>
          {acceptLabel}
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      </div>
    </>
  );
}
