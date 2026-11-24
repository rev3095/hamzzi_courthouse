"use client";
// 내 세션 불러오기 (DEC-039·056): 남겨 둔 질문(GET /me/inquiries)과 사건 진행의 사건(GET /matters)을 한 목록으로.
// 마이페이지의 사이드바 목록과 본문 목록이 같은 값을 쓴다. 질문은 가린 문장(마스킹본), 사건은 사건 이름만 온다.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyInquiries, rememberQuestion } from "@/lib/client/api";
import { listMatters } from "@/lib/client/matters";
import { matterHref, mergeSessions, type SessionItem } from "@/lib/client/sessions";

export type SessionsState =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error" }
  | { kind: "ready"; items: SessionItem[]; mattersFailed: boolean };

export function useMySessions(enabled = true): SessionsState {
  const [state, setState] = useState<SessionsState>({ kind: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void Promise.all([getMyInquiries(), listMatters()]).then(([qs, ms]) => {
      if (!live) return;
      if (!qs.ok) {
        setState({ kind: qs.error.code === "UNAUTHENTICATED" ? "login" : "error" });
        return;
      }
      const questions = Array.isArray(qs.data) ? qs.data : [];
      const matters = ms.ok && Array.isArray(ms.data?.items) ? ms.data.items : [];
      setState({ kind: "ready", items: mergeSessions(questions, matters), mattersFailed: !ms.ok });
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return state;
}

/** 세션 하나 열기: 질문은 결과 화면(가린 문장을 이 탭에 건넨다), 사건은 사건 진행 화면 */
export function useOpenSession() {
  const router = useRouter();
  return (item: SessionItem) => {
    if (item.kind === "question") {
      rememberQuestion(item.question.id, item.question.maskedText);
      router.push(`/inquiries/${item.question.id}`);
    } else router.push(matterHref(item.matter.id));
  };
}
