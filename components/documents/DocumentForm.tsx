"use client";
// 문서 작성 폼 (DEC-022). legal_documents 게이트가 승인됐을 때만 서버가 이 폼을 그린다.
// 입력은 브라우저에 저장하지 않고, 서버도 저장하지 않는다. 결과는 .txt로 내려받는다.
import { useId, useState } from "react";
import type { DocumentSpec } from "@/lib/documents/policy";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; text: string; filename: string; notice: string }
  | { kind: "error"; message: string };

export function DocumentForm({ spec }: { spec: DocumentSpec }) {
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit() {
    setState({ kind: "busy" });
    const res = await fetch(`/api/v1/documents/${spec.kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok && body?.data) {
      setState({ kind: "done", ...body.data });
      return;
    }
    const code = body?.error?.code;
    setState({
      kind: "error",
      message:
        code === "VALIDATION_ERROR"
          ? "비어 있거나 너무 긴 칸이 있어요. 칸을 확인해 주세요."
          : code === "FEATURE_GATED"
            ? "법률 검토 후 열릴 기능이에요."
            : "문서를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    });
  }

  function download(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label={`${spec.title} 작성`} className="mt-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        {spec.fields.map((f) => {
          const id = `${baseId}-${f.key}`;
          const common = {
            id,
            value: values[f.key] ?? "",
            maxLength: f.max,
            required: !f.optional,
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
              </label>
              {f.hint && <p className="text-muted text-[13px]">{f.hint}</p>}
              <div className="mt-1">
                {f.multiline ? <textarea rows={5} {...common} /> : <input {...common} />}
              </div>
            </div>
          );
        })}
        <button
          type="submit"
          disabled={state.kind === "busy"}
          className="rounded-button bg-ink min-h-11 self-start px-5 text-[15px] font-semibold text-white disabled:opacity-60"
        >
          양식 채우기
        </button>
      </form>
      {state.kind === "error" && (
        <p role="alert" className="text-warn-text mt-3 text-sm">
          {state.message}
        </p>
      )}
      {state.kind === "done" && (
        <div className="rounded-card border-line mt-5 border p-4">
          <p className="bg-ink w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold text-white">
            {state.notice}
          </p>
          <pre className="text-ink mt-3 text-sm leading-relaxed whitespace-pre-wrap">
            {state.text}
          </pre>
          <button
            type="button"
            onClick={() => download(state.text, state.filename)}
            className="rounded-button border-line text-ink mt-3 min-h-11 border bg-white px-4 text-[15px]"
          >
            {state.filename} 내려받기
          </button>
        </div>
      )}
    </section>
  );
}
