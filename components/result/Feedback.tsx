"use client";
// 도움이 됐나요? (S-04 와이어프레임 맨 아래, PRD 14 지표). POST /results/{id}/feedback — 결과마다 1건, 다시 누르면 덮어씀.
// 의견은 서버가 마스킹본만 저장하고, 민감정보로 보이면 의견은 저장하지 않는다.
import { useState } from "react";
import { sendFeedback } from "@/lib/client/api";

export function Feedback({ resultId }: { resultId: string }) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(h: boolean, c?: string) {
    setHelpful(h);
    setState("sending");
    const r = await sendFeedback(resultId, { helpful: h, ...(c && { comment: c }) });
    setState(r.ok ? "sent" : "error");
  }

  return (
    <section aria-labelledby="feedback-title" className="rounded-card bg-soft mt-8 px-5 py-4">
      <h2 id="feedback-title" className="text-ink text-[15px] font-semibold">
        도움이 됐나요?
      </h2>
      <div className="mt-2 flex gap-2">
        {[
          { v: true, label: "네" },
          { v: false, label: "아니요" },
        ].map(({ v, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={helpful === v}
            disabled={state === "sending"}
            onClick={() => void send(v)}
            className={`rounded-button min-h-11 border px-5 text-[15px] ${
              helpful === v ? "border-ink bg-ink text-white" : "border-line text-ink bg-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {helpful !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) void send(helpful, comment.trim());
          }}
          className="mt-3"
        >
          <label className="text-muted flex flex-col text-[13px]">
            더 알려 주실 내용 (선택, 500자 이내 · 개인정보는 빼고 적어 주세요. 건강·범죄경력처럼
            민감한 내용으로 보이는 의견은 저장하지 않아요)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              rows={2}
              className="rounded-button border-line text-ink mt-1 resize-none border bg-white px-3 py-2 text-[15px]"
            />
          </label>
          <button
            type="submit"
            disabled={state === "sending" || !comment.trim()}
            className="rounded-button border-line text-ink mt-2 min-h-11 border bg-white px-4 text-sm disabled:opacity-50"
          >
            의견 보내기
          </button>
        </form>
      )}
      <p aria-live="polite" className="text-muted mt-2 text-[13px]">
        {state === "sent" && "고마워요! 더 나은 답을 만드는 데 쓸게요."}
        {state === "error" && "보내지 못했어요. 잠시 후 다시 시도해 주세요."}
      </p>
    </section>
  );
}
