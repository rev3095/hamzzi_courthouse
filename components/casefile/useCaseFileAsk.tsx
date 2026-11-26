"use client";
// 질문창의 사진 붙이기와 서류 분석 창을 잇는다 (F-015, DEC-052). 홈 질문창과 /casefile이 함께 쓴다.
// 사진이 붙어 있으면 "물어보기"가 서류 분석 창을 열고, 확인한 사건 개요는 일반 질문 보내기(useAsk.send)로 간다:
// 민감정보 동의는 창에서 이미 받았으므로 함께 보내고, 분석은 DeepSearch 방식으로 요청한다(쟁점별 근거, DEC-041).
import { useState } from "react";
import type { CaseParty } from "@/lib/casefile/limits";
import { rememberParties } from "@/lib/client/casefile";
import { useAttachments, type Attachments } from "../ask/useAttachments";
import { CaseFileFlow } from "./CaseFileFlow";

type Send = (
  text: string,
  sensitiveConsent?: boolean,
  deep?: boolean,
  onCreated?: (id: string) => void,
) => Promise<void>;

export function useCaseFileAsk(ask: {
  send: Send;
  busy: boolean;
  /** 질문 보내기 오류 문장 — 창이 열려 있는 동안 창 안에 보인다 */
  error: string | null;
  /** 오늘 질문을 더 할 수 없는지 */
  blocked: boolean;
  showLimit: () => void;
  /** 다른 흐름(자료 첨부 F-017)과 같은 사진을 쓸 때 넘긴다. 없으면 이 훅이 따로 갖는다 */
  attach?: Attachments;
  /** 읽은 내용으로 곧바로 분석을 보낸다 (DEC-065, 홈 질문창) */
  auto?: boolean;
}) {
  const own = useAttachments();
  const attach = ask.attach ?? own;
  const [question, setQuestion] = useState<string | null>(null);

  /** 사진이 붙어 있으면 서류 분석 창을 연다. 열었으면 true */
  const start = (text: string): boolean => {
    if (attach.items.length === 0) return false;
    if (ask.blocked) ask.showLimit();
    else setQuestion(text);
    return true;
  };

  const close = () => setQuestion(null);

  const flow =
    question !== null ? (
      <CaseFileFlow
        images={attach.items}
        question={question}
        auto={ask.auto}
        busy={ask.busy}
        error={ask.error}
        onClose={close}
        onLimit={() => {
          close();
          ask.showLimit();
        }}
        onAnalyze={(text: string, parties: CaseParty[]) => {
          void ask.send(text, true, true, (id) => {
            // 질문이 저장된 뒤: 당사자 목록을 이 탭에 남기고 사진을 비운다
            rememberParties(id, parties);
            attach.clear();
            close();
          });
        }}
      />
    ) : null;

  return { attach, start, flow };
}
