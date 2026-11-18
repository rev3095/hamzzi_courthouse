"use client";
// 내 질문 기록 (DEC-039): 로그인 사용자가 남기기로 한 질문 목록. 누르면 그 답변을 다시 보고 이어서 물어볼 수 있다.
// 목록에는 가린 문장(마스킹본)만 온다. 원문은 어디에도 저장되지 않는다 (DEC-006).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyInquiries, rememberQuestion, type SavedInquiry } from "@/lib/client/api";

type State =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error" }
  | { kind: "ready"; items: SavedInquiry[] };

const STATUS: Record<string, string> = {
  analyzed: "답변 완료",
  failed: "분석 실패",
  draft: "분석 전",
  need_info: "분석 전",
};

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

export function MyInquiries() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void getMyInquiries().then((r) => {
      if (!live) return;
      if (r.ok) setState({ kind: "ready", items: r.data });
      else setState({ kind: r.error.code === "UNAUTHENTICATED" ? "login" : "error" });
    });
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === "loading") return <p className="text-muted mt-6 text-[15px]">불러오는 중…</p>;

  if (state.kind === "login") {
    return (
      <p className="text-muted mt-6 text-[15px] leading-relaxed">
        로그인하면 남겨 둔 질문과 답변을 다시 볼 수 있어요.
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p role="alert" className="text-warn-text mt-6 text-[15px]">
        기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  if (state.items.length === 0) {
    return (
      <p className="text-muted mt-6 text-[15px] leading-relaxed">
        아직 남겨 둔 질문이 없어요. 질문창 아래 &lsquo;내 기록에 남기기&rsquo;를 켜고 물어보면
        여기에 모여요.
      </p>
    );
  }

  return (
    <ul className="mt-6 flex flex-col gap-3">
      {state.items.map((q) => (
        <li key={q.id}>
          <button
            type="button"
            onClick={() => {
              // 결과 화면이 질문 문장을 보여 줄 수 있게 가린 문장을 이 탭에 건넨다
              rememberQuestion(q.id, q.maskedText);
              router.push(`/inquiries/${q.id}`);
            }}
            className="rounded-card border-line hover:border-gold w-full border bg-white px-4 py-3.5 text-left"
          >
            <span className="text-muted flex flex-wrap items-center gap-x-2 text-[13px]">
              {dateOf(q.createdAt)}
              <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                {STATUS[q.status] ?? q.status}
              </span>
              {q.followup && <span>이어 묻기</span>}
            </span>
            <span className="text-ink mt-1.5 line-clamp-2 block text-[15px] leading-relaxed">
              {q.maskedText}
            </span>
            <span className="text-link mt-1.5 block text-[13px] font-semibold">
              답변 보기 · 이어서 묻기
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
