"use client";
// 내 세션 (DEC-039·056): 로그인 사용자가 남기기로 한 질문과 사건 진행(F-016)의 사건을 최근 것부터 한 목록으로.
// 질문을 누르면 그 답변을 다시 보고 이어서 물어볼 수 있고, 사건을 누르면 사건 진행 화면에서 그 사건이 열린다.
// 질문은 가린 문장(마스킹본)만 온다. 원문은 어디에도 저장되지 않는다 (DEC-006). 사건은 사건 이름만 보인다.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyInquiries, rememberQuestion } from "@/lib/client/api";
import { listMatters } from "@/lib/client/matters";
import {
  SESSION_KIND_LABEL,
  matterHref,
  mergeSessions,
  type SessionItem,
} from "@/lib/client/sessions";

type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error" }
  | { kind: "ready"; items: SessionItem[]; mattersFailed: boolean };

const STATUS: Record<string, string> = {
  analyzed: "답변 완료",
  failed: "분석 실패",
  draft: "분석 전",
  need_info: "분석 전",
};

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

const tag = "bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold";
const kindTag = "border-line text-ink rounded-[6px] border px-2 py-0.5 text-xs font-semibold";
const row =
  "rounded-card border-line hover:border-gold w-full border bg-white px-4 py-3.5 text-left";

export function MySessions() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void Promise.all([getMyInquiries(), listMatters()]).then(([qs, ms]) => {
      if (!live) return;
      if (!qs.ok) {
        setState({ kind: qs.error.code === "UNAUTHENTICATED" ? "login" : "error" });
        return;
      }
      setState({
        kind: "ready",
        items: mergeSessions(qs.data, ms.ok ? ms.data.items : []),
        mattersFailed: !ms.ok,
      });
    });
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === "loading") return <p className="text-muted mt-6 text-[15px]">불러오는 중…</p>;

  if (state.kind === "login") {
    return (
      <p className="text-muted mt-6 text-[15px] leading-relaxed">
        로그인하면 남겨 둔 질문과 사건을 다시 볼 수 있어요.
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p role="alert" className="text-warn-text mt-6 text-[15px]">
        세션을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  return (
    <>
      {state.mattersFailed && (
        <p role="alert" className="text-warn-text mt-4 text-[13px]">
          사건 목록은 불러오지 못했어요. 사건 진행 화면에서 다시 볼 수 있어요.
        </p>
      )}
      {state.items.length === 0 ? (
        <p className="text-muted mt-6 text-[15px] leading-relaxed">
          아직 세션이 없어요. 질문창 아래 &lsquo;내 기록에 남기기&rsquo;를 켜고 물어보거나 사건
          진행에서 사건을 만들면 여기에 모여요.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" data-testid="my-sessions">
          {state.items.map((item) =>
            item.kind === "question" ? (
              <li key={`q:${item.question.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    // 결과 화면이 질문 문장을 보여 줄 수 있게 가린 문장을 이 탭에 건넨다
                    rememberQuestion(item.question.id, item.question.maskedText);
                    router.push(`/inquiries/${item.question.id}`);
                  }}
                  className={row}
                >
                  <span className="text-muted flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className={kindTag}>{SESSION_KIND_LABEL.question}</span>
                    {dateOf(item.at)}
                    <span className={tag}>
                      {STATUS[item.question.status] ?? item.question.status}
                    </span>
                    {item.question.followup && <span>이어 묻기</span>}
                  </span>
                  <span className="text-ink mt-1.5 line-clamp-2 block text-[15px] leading-relaxed">
                    {item.question.maskedText}
                  </span>
                  <span className="text-link mt-1.5 block text-[13px] font-semibold">
                    답변 보기 · 이어서 묻기
                  </span>
                </button>
              </li>
            ) : (
              <li key={`m:${item.matter.id}`}>
                <button
                  type="button"
                  onClick={() => router.push(matterHref(item.matter.id))}
                  className={row}
                >
                  <span className="text-muted flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className={kindTag}>{SESSION_KIND_LABEL.matter}</span>
                    {dateOf(item.at)}
                    <span className={tag}>
                      자료 {item.matter.counts.docs} · 노트 {item.matter.counts.notes}
                    </span>
                  </span>
                  <span className="text-ink mt-1.5 line-clamp-2 block text-[15px] leading-relaxed">
                    {item.matter.title}
                  </span>
                  <span className="text-link mt-1.5 block text-[13px] font-semibold">
                    사건 열기
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  );
}
