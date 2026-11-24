"use client";
// 질문창에 붙인 사진을 "자료로 첨부해 질문하기"(F-017, DEC-058)로 잇는다. 홈 질문창·DeepSearch·결과 화면 심층 질문이 함께 쓴다.
// 사진이 붙어 있으면 자료 첨부 창을 열고, 확인한 자료 정리는 질문과 함께 일반 질문 보내기(useAsk.send)로 간다:
// 민감정보 동의는 창에서 이미 받았으므로 함께 보낸다.
// 홈 질문창은 같은 사진으로 서류 분석(F-015)도 할 수 있어 먼저 어느 쪽인지 고르게 한다(AttachChoice).
import { useState } from "react";
import type { MaterialReading } from "@/lib/materials/limits";
import { Modal, SecondaryButton } from "../Modal";
import { MaterialsFlow } from "./MaterialsFlow";
import type { Attachments } from "./useAttachments";

type Send = (
  text: string,
  sensitiveConsent?: boolean,
  deep?: boolean,
  onCreated?: (id: string) => void,
  materials?: MaterialReading[],
) => Promise<void>;

export function useMaterialsAsk(ask: {
  attach: Attachments;
  send: Send;
  busy: boolean;
  error: string | null;
  blocked: boolean;
  showLimit: () => void;
}) {
  const [open, setOpen] = useState<{ question: string; deep: boolean } | null>(null);

  /** 사진이 붙어 있으면 자료 첨부 창을 연다. 열었으면 true */
  const start = (text: string, deep = false): boolean => {
    if (ask.attach.items.length === 0) return false;
    if (ask.blocked) ask.showLimit();
    else setOpen({ question: text, deep });
    return true;
  };
  const close = () => setOpen(null);

  const flow = open ? (
    <MaterialsFlow
      images={ask.attach.items}
      question={open.question}
      mode="ask"
      deep={open.deep}
      busy={ask.busy}
      error={ask.error}
      onClose={close}
      onLimit={() => {
        close();
        ask.showLimit();
      }}
      onSend={(text, materials) => {
        void ask.send(
          text,
          true,
          open.deep,
          () => {
            // 질문이 저장된 뒤: 사진을 비운다 (사진은 이 화면 메모리에만 있었다)
            ask.attach.clear();
            close();
          },
          materials,
        );
      }}
    />
  ) : null;

  return { start, flow };
}

/** 홈 질문창에서 사진을 붙이고 보낼 때: 서류 분석인지, 자료로 첨부해 질문하는지 고른다 */
export function AttachChoice({
  count,
  onCaseFile,
  onMaterials,
  onClose,
}: {
  count: number;
  onCaseFile: () => void;
  onMaterials: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`사진 ${count}장을 어떻게 쓸까요?`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onMaterials}
          className="rounded-card border-gold-line bg-cream hover:border-gold border px-4 py-3 text-left"
        >
          <span className="text-ink block text-[16px] font-bold">자료로 첨부해 질문하기</span>
          <span className="text-muted mt-0.5 block text-[14px] leading-relaxed">
            대화 캡처·영수증·현장 사진 같은 자료가 무엇인지 정리하고, 그 내용을 넣어 질문에 답해요.
            결과에서 자료별로 챙겨 둘 점을 함께 보여 줘요.
          </span>
        </button>
        <button
          type="button"
          onClick={onCaseFile}
          className="rounded-card border-line hover:border-gold border bg-white px-4 py-3 text-left"
        >
          <span className="text-ink block text-[16px] font-bold">서류 분석</span>
          <span className="text-muted mt-0.5 block text-[14px] leading-relaxed">
            내용증명·소장·고소장처럼 받은 서류를 읽어 사건 개요와 서류에 적힌 당사자를 정리하고,
            쟁점별로 분석해요.
          </span>
        </button>
      </div>
      <p className="text-muted mt-3 text-[13px]">
        어느 쪽이든 사진은 동의한 뒤에만 보내고 저장하지 않아요. 분석은 질문 1번으로 세요.
      </p>
      <div className="mt-4 flex flex-col">
        <SecondaryButton onClick={onClose}>취소</SecondaryButton>
      </div>
    </Modal>
  );
}
