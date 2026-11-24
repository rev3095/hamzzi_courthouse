"use client";
// 문의 남기기 양식 (DEC-051). POST /api/v1/contact로 보내면 서버가 개인정보를 가린 본문만 개발자 메일로 보낸다.
// 메일 발송이 꺼져 있거나 실패하면 서버가 돌려준 가린 제목·본문으로 메일 앱 열기(mailto)를 보여 준다.
// 적는 중인 내용은 브라우저에 저장하지 않는다. 확인창(confirm)을 쓰지 않는다.
import { useId, useState, type FormEvent } from "react";
import { call } from "@/lib/client/api";
import {
  CONTACT_LIMITS,
  CONTACT_NOTICE,
  CONTACT_TOPICS,
  contactMailto,
  developerEmail,
  type ContactResult,
  type ContactTopic,
} from "@/lib/contact/policy";

type View =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; maskedCount: number }
  | { kind: "fallback"; href: string; failed: boolean; maskedCount: number }
  | { kind: "error"; message: string };

const REASONS: Record<string, string> = {
  empty: "문의 내용을 적어 주세요.",
  too_short: `문의 내용을 ${CONTACT_LIMITS.bodyMin}자 이상 적어 주세요.`,
  too_long: `문의 내용은 ${CONTACT_LIMITS.bodyMax}자까지 적을 수 있어요.`,
  invalid_email: "답장 받을 이메일 주소를 다시 확인해 주세요.",
  unknown_topic: "문의 종류를 다시 골라 주세요.",
  sensitive:
    "건강·범죄경력처럼 민감한 내용으로 보이는 부분이 있어요. 그 부분을 빼고 다시 보내 주세요.",
  contact_hourly: "문의를 너무 자주 보냈어요. 잠시 뒤에 다시 보내 주세요.",
};

const masked = (n: number) => (n > 0 ? ` 개인정보로 보이는 부분 ${n}곳은 가려서 보냈어요.` : "");

export function ContactForm() {
  const id = useId();
  const [topic, setTopic] = useState<ContactTopic>("service");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [website, setWebsite] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (view.kind === "sending") return;
    setView({ kind: "sending" });
    const res = await call<ContactResult>("/api/v1/contact", {
      method: "POST",
      body: JSON.stringify({ topic, body, replyTo: replyTo.trim() || undefined, website }),
    });
    if (!res.ok) {
      const reason = String(res.error.details?.reason ?? "");
      setView({
        kind: "error",
        message:
          REASONS[reason] ??
          (res.error.code === "EMPTY_INPUT"
            ? REASONS.empty
            : "보내지 못했어요. 잠시 뒤 다시 시도해 주세요."),
      });
      return;
    }
    const r = res.data;
    if (r.status === "sent") {
      setBody("");
      setReplyTo("");
      setView({ kind: "sent", maskedCount: r.maskedCount });
      return;
    }
    setView({
      kind: "fallback",
      href: contactMailto(r.fallback.subject, r.fallback.body),
      failed: r.status === "send_failed",
      maskedCount: r.maskedCount,
    });
  }

  const sending = view.kind === "sending";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="rounded-card border-note-line bg-note text-warn-text border px-4 py-3 text-sm leading-relaxed">
        {CONTACT_NOTICE}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-ink text-sm font-semibold">문의 종류</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CONTACT_TOPICS) as ContactTopic[]).map((t) => (
            <label
              key={t}
              className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm ${
                topic === t ? "border-ink bg-ink text-white" : "border-line text-ink bg-white"
              }`}
            >
              <input
                type="radio"
                name={`${id}-topic`}
                value={t}
                checked={topic === t}
                onChange={() => setTopic(t)}
                className="sr-only"
              />
              {CONTACT_TOPICS[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-ink text-sm font-semibold">
          문의 내용
        </label>
        <textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={CONTACT_LIMITS.bodyMax}
          rows={6}
          required
          placeholder="서비스 이용 중 궁금한 점, 오류, 제안을 적어 주세요. 사건 내용이나 개인정보는 적지 말아 주세요."
          className="rounded-card border-line text-ink focus:border-gold border bg-white px-4 py-3 text-[15px] leading-relaxed outline-none"
        />
        <span className="text-muted self-end text-[12px]">
          {body.length}/{CONTACT_LIMITS.bodyMax}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reply`} className="text-ink text-sm font-semibold">
          답장 받을 이메일 <span className="text-muted font-normal">(선택)</span>
        </label>
        <input
          id={`${id}-reply`}
          aria-describedby={`${id}-reply-note`}
          type="email"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          maxLength={CONTACT_LIMITS.replyMax}
          autoComplete="email"
          className="rounded-card border-line text-ink focus:border-gold min-h-11 border bg-white px-4 text-[15px] outline-none"
        />
        <span id={`${id}-reply-note`} className="text-muted text-[12px]">
          적으시면 답장을 위해 개발자 메일로만 전달하고, 햄찌법원에 저장하지 않아요.
        </span>
      </div>

      {/* 자동 입력(봇) 막기: 사람에게는 보이지 않는 칸 */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          웹사이트
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={sending}
        className="rounded-button bg-ink min-h-11 self-start px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {sending ? "보내는 중…" : "문의 보내기"}
      </button>

      <div aria-live="polite" className="text-sm leading-relaxed">
        {view.kind === "sent" && (
          <p className="rounded-card border-honey-line bg-honey text-ink border px-4 py-3">
            문의를 보냈어요. 고맙습니다!{masked(view.maskedCount)}
          </p>
        )}
        {view.kind === "fallback" && (
          <div className="rounded-card border-line flex flex-col gap-2 border bg-white px-4 py-3">
            <p className="text-ink">
              {view.failed
                ? "지금은 사이트에서 바로 보내지 못했어요."
                : "지금은 사이트에서 바로 보내는 기능이 꺼져 있어요."}{" "}
              아래 버튼으로 메일 앱을 열어 보내 주세요. 개인정보로 보이는 부분은 가린 내용으로 채워
              둘게요.
            </p>
            <a
              href={view.href}
              className="rounded-button bg-ink inline-flex min-h-11 items-center self-start px-4 text-sm font-semibold text-white"
            >
              메일 앱으로 보내기
            </a>
            <p className="text-muted text-[12px]">
              메일 앱이 열리지 않으면 {developerEmail()} 로 보내 주세요.
            </p>
          </div>
        )}
        {view.kind === "error" && (
          <p role="alert" className="text-warn-text">
            {view.message}
          </p>
        )}
      </div>
    </form>
  );
}

/** 이메일 주소는 누를 때 합쳐서 보여 준다 (페이지를 긁는 봇 대비, 안내 챗봇과 같은 방식) */
export function EmailReveal() {
  const [shown, setShown] = useState(false);
  if (!shown)
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-sm font-semibold"
      >
        이메일 보기
      </button>
    );
  return (
    <a
      href={`mailto:${developerEmail()}`}
      className="text-link font-semibold break-all underline underline-offset-2"
    >
      {developerEmail()}
    </a>
  );
}
