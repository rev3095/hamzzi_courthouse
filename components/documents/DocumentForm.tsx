"use client";
// 문서 작성 폼 (DEC-022·023). legal_documents 게이트가 승인됐을 때만 서버가 이 폼을 그린다.
// 1회용: 입력값은 이 화면의 메모리에만 있다 — 쿠키·localStorage·서버 어디에도 저장하지 않고, 새로고침하면 사라진다.
// 양식 채우기는 브라우저 안에서 한다(이름·주소·금액이 서버로 가지 않는다). 서버에는 질문 번호만 보내 초안 칸을 받는다.
import { useId, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import {
  DOCUMENT_NOTICE,
  DRAFT_NOTICE,
  fillDocument,
  parseDocumentInput,
  type DocumentSpec,
} from "@/lib/documents/policy";

type Doc = { text: string; filename: string };
type DraftState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; aiUsed: boolean; notice: string | null; missing: string[]; filled: string[] }
  | { kind: "error"; message: string };

const NO_AI: Record<string, string> = {
  free_mode: "지금은 AI 문장 정리가 꺼져 있어 정해진 칸만 채웠어요.",
  daily_limit: "오늘 AI 정리 횟수를 다 써서 정해진 칸만 채웠어요.",
  cost_cap: "사연이 길어 AI 정리를 하지 못하고 정해진 칸만 채웠어요.",
  model_failed: "AI 정리를 하지 못해 정해진 칸만 채웠어요.",
  no_facts: "사연에서 옮겨 적을 사실을 찾지 못해 정해진 칸만 채웠어요.",
};

export function DocumentForm({
  spec,
  inquiryId,
}: {
  spec: DocumentSpec;
  inquiryId: string | null;
}) {
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" });
  const [doc, setDoc] = useState<Doc | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  /** 서버가 준 AI 고지(AI_NOTICE). AI 문장이 칸에 들어갔을 때만 */
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const aiUsed = aiFields.size > 0;

  async function requestDraft() {
    if (!inquiryId) return;
    setDraft({ kind: "busy" });
    const res = await fetch(`/api/v1/documents/${spec.kind}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inquiryId }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok || !body?.data) {
      const code = body?.error?.code;
      setDraft({
        kind: "error",
        message:
          code === "FEATURE_GATED"
            ? "법률 검토 후 열릴 기능이에요."
            : code === "RATE_LIMITED"
              ? "요청이 많아요. 잠시 후 다시 시도해 주세요."
              : code === "FORBIDDEN" || code === "NOT_FOUND" || code === "INVALID_STATE"
                ? "이 질문으로는 초안을 만들 수 없어요. 칸을 직접 채워 주세요."
                : "초안을 만들지 못했어요. 칸을 직접 채워 주세요.",
      });
      return;
    }
    const data = body.data as {
      suggestions: Record<string, string>;
      missing: string[];
      ai: { used: boolean; reason?: string };
      notice: string | null;
    };
    // 사용자가 이미 적은 칸은 덮어쓰지 않는다
    const filled = Object.keys(data.suggestions).filter((k) => !values[k]?.trim());
    setValues((v) => {
      const next = { ...v };
      for (const k of filled) next[k] = data.suggestions[k];
      return next;
    });
    if (data.ai.used && filled.some((k) => k === "claimCause" || k === "facts")) {
      setAiNotice(data.notice);
      setAiFields((s) => {
        const next = new Set(s);
        for (const k of filled) if (k === "claimCause" || k === "facts") next.add(k);
        return next;
      });
    }
    setDraft({
      kind: "done",
      aiUsed: data.ai.used,
      notice: data.notice ?? (data.ai.reason ? (NO_AI[data.ai.reason] ?? null) : null),
      missing: data.missing,
      filled,
    });
  }

  function fill() {
    setFormError(null);
    try {
      const input = parseDocumentInput(spec.kind, values);
      setDoc(fillDocument(spec.kind, input));
    } catch (e) {
      setDoc(null);
      setFormError(
        e instanceof ApiError
          ? "비어 있거나 너무 긴 칸이 있어요. 칸을 확인해 주세요."
          : "양식을 채우지 못했어요.",
      );
    }
  }

  function download(d: Doc) {
    const url = URL.createObjectURL(new Blob([d.text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = d.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function claimAimFromAmount() {
    const won = amount.replace(/[^\d,]/g, "");
    if (!won) return;
    setValues((v) => ({
      ...v,
      claimAim: `피고는 원고에게 금 ${won}원을 지급하라.\n소송비용은 피고가 부담한다.\n라는 판결을 구합니다.`,
    }));
  }

  return (
    <section aria-label={`${spec.title} 작성`} className="mt-6">
      <p className="rounded-card border-line bg-cream text-ink border px-4 py-3 text-sm leading-relaxed">
        입력한 내용은 이 화면에만 있고 어디에도 저장되지 않아요. 새로고침하거나 화면을 나가면
        사라져요. 이름·주소·금액은 서버로 보내지 않고 이 브라우저 안에서만 양식에 채워요.
      </p>

      {inquiryId && (
        <div className="rounded-card border-line mt-4 border bg-white px-4 py-4">
          <p className="text-ink text-[15px] font-semibold">질문 내용으로 초안 채우기</p>
          <p className="text-muted mt-1 text-[13px] leading-relaxed">
            남기신 질문(개인정보를 가린 문장)으로{" "}
            {spec.kind === "complaint" ? "사건명·청구원인·입증방법" : "제목·있었던 일"} 칸을 채워요.
            이름·주소·금액은 직접 적어 주세요. 비어 있는 칸만 채우고, 적어 둔 칸은 그대로 둬요.
          </p>
          <button
            type="button"
            onClick={() => void requestDraft()}
            disabled={draft.kind === "busy"}
            className="rounded-button bg-ink mt-3 min-h-11 px-5 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {draft.kind === "busy" ? "초안을 만드는 중…" : "초안 채우기"}
          </button>
          {draft.kind === "error" && (
            <p role="alert" className="text-warn-text mt-2 text-sm">
              {draft.message}
            </p>
          )}
          {draft.kind === "done" && (
            <div role="status" className="mt-3 text-sm leading-relaxed">
              {draft.aiUsed && (
                <p className="flex flex-wrap gap-1.5">
                  <span className="bg-ink rounded-[6px] px-2 py-0.5 text-xs font-semibold text-white">
                    {draft.notice}
                  </span>
                  <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                    {DRAFT_NOTICE}
                  </span>
                </p>
              )}
              {!draft.aiUsed && draft.notice && <p className="text-muted">{draft.notice}</p>}
              {draft.filled.length === 0 && (
                <p className="text-muted mt-1">채울 수 있는 빈 칸이 없었어요.</p>
              )}
              {draft.missing.length > 0 && (
                <div className="mt-2">
                  <p className="text-ink font-semibold">더 적으면 좋은 내용</p>
                  <ul className="text-ink mt-1 list-disc pl-5">
                    {draft.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-muted mt-2 text-[13px]">
                채운 문장은 사실과 맞는지 꼭 확인하고 고쳐 쓰세요.
              </p>
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          fill();
        }}
        className="mt-5 flex flex-col gap-4"
        autoComplete="off"
      >
        {spec.fields.map((f) => {
          const id = `${baseId}-${f.key}`;
          const common = {
            id,
            value: values[f.key] ?? "",
            maxLength: f.max,
            required: !f.optional,
            autoComplete: "off",
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value })),
            className:
              "rounded-button border-line text-ink w-full border bg-white px-3 py-2.5 text-[15px] outline-none focus:border-ink",
          };
          return (
            <div key={f.key}>
              <label htmlFor={id} className="text-ink text-sm font-semibold">
                {f.label}
                {f.optional && <span className="text-muted font-normal"> (선택)</span>}
                {aiFields.has(f.key) && (
                  <span className="bg-cream text-label ml-2 rounded-[6px] px-1.5 py-0.5 text-xs font-semibold">
                    AI 초안 · 확인 필요
                  </span>
                )}
              </label>
              {f.hint && <p className="text-muted text-[13px]">{f.hint}</p>}
              {f.key === "claimAim" && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label htmlFor={`${id}-amount`} className="text-muted text-[13px]">
                    청구 금액(원)
                  </label>
                  <input
                    id={`${id}-amount`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={amount}
                    maxLength={20}
                    onChange={(e) => setAmount(e.target.value)}
                    className="rounded-button border-line text-ink w-40 border bg-white px-3 py-1.5 text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={claimAimFromAmount}
                    className="rounded-button border-line text-ink min-h-9 border bg-white px-3 text-[13px]"
                  >
                    기본 문장 넣기
                  </button>
                </div>
              )}
              <div className="mt-1">
                {f.multiline ? <textarea rows={5} {...common} /> : <input {...common} />}
              </div>
            </div>
          );
        })}
        <button
          type="submit"
          className="rounded-button bg-ink min-h-11 self-start px-5 text-[15px] font-semibold text-white"
        >
          양식 채우기
        </button>
      </form>
      {formError && (
        <p role="alert" className="text-warn-text mt-3 text-sm">
          {formError}
        </p>
      )}
      {doc && (
        <div className="rounded-card border-line mt-5 border p-4">
          <p className="flex flex-wrap gap-1.5">
            {aiUsed ? (
              <>
                {aiNotice && (
                  <span className="bg-ink rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
                    {aiNotice}
                  </span>
                )}
                <span className="bg-cream text-label rounded-[6px] px-2.5 py-1 text-xs font-semibold">
                  {DRAFT_NOTICE}
                </span>
              </>
            ) : (
              <span className="bg-ink rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
                {DOCUMENT_NOTICE}
              </span>
            )}
          </p>
          <pre className="text-ink mt-3 text-sm leading-relaxed whitespace-pre-wrap">
            {doc.text}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => download(doc)}
              className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[15px]"
            >
              {doc.filename} 내려받기
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(doc.text)}
              className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[15px]"
            >
              복사하기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
