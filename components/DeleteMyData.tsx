"use client";
// 내 기록 지우기 (PRD 9.2, DELETE /api/v1/me/data). 이 브라우저(익명 세션)의 질문·결과·피드백을 지운다.
// 감사 로그(행위·세션 ID만)가 남고, 남은 질문 수는 되살아나지 않는다 (DEC-018 제안).
import { useState } from "react";
import { deleteMyData, forgetQuestions, notifyQuotaChanged } from "@/lib/client/api";
import { Modal, PrimaryButton, SecondaryButton } from "./Modal";

export function DeleteMyData() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const r = await deleteMyData();
    setBusy(false);
    setOpen(false);
    if (!r.ok) {
      setMessage(
        r.error.code === "RATE_LIMITED"
          ? "요청이 많아요. 잠시 뒤에 다시 시도해 주세요."
          : `지우지 못했어요. 잠시 후 다시 시도해 주세요.${r.error.requestId ? ` (오류 번호 ${r.error.requestId})` : ""}`,
      );
      return;
    }
    forgetQuestions();
    notifyQuotaChanged();
    setMessage(
      r.data.status === "received"
        ? "삭제 요청을 받았어요."
        : `질문 ${r.data.deletedInquiries ?? 0}건과 그 결과를 지웠어요.`,
    );
  }

  return (
    <div id="delete" className="rounded-card border-line border bg-white p-5">
      <p className="text-ink text-[15px]">
        이 브라우저에서 보낸 질문과 결과를 지금 바로 지울 수 있어요.
      </p>
      <SecondaryButton className="mt-3" onClick={() => setOpen(true)}>
        내 기록 지우기
      </SecondaryButton>
      <p aria-live="polite" className="text-muted mt-2 text-sm">
        {message}
      </p>
      {open && (
        <Modal title="내 기록을 지울까요?" onClose={() => setOpen(false)}>
          <p className="text-muted text-[15px] leading-relaxed">
            이 브라우저에서 보낸 질문(가린 문장)과 결과·피드백을 모두 지워요. 지우면 되돌릴 수
            없어요. 남은 질문 수는 그대로예요.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <PrimaryButton disabled={busy} onClick={() => void run()}>
              지우기
            </PrimaryButton>
            <SecondaryButton onClick={() => setOpen(false)}>취소</SecondaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
