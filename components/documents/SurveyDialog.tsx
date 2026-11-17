"use client";
// 설문형 서식 입력 팝업 (DEC-025). 한 화면에 한두 칸, 이전·다음, 진행 표시, 칸마다 쉬운 설명·예시.
// 입력값은 부모 화면의 메모리에만 있다 — 쿠키·localStorage·서버에 저장하지 않는다.
import { useId, useState, type ReactNode } from "react";
import { formatWon } from "@/lib/documents/fill";
import {
  DOCUMENT_SPECS,
  invalidFields,
  isActive,
  type Field,
  type DocumentInput,
} from "@/lib/documents/policy";
import type { DocumentKind } from "@/lib/procedure/steps";
import { Modal } from "./Modal";

const inputClass =
  "rounded-button border-line text-ink focus:border-ink w-full border bg-white px-3 py-2.5 text-[15px] outline-none";

export function SurveyDialog({
  open,
  kind,
  values,
  onChange,
  page,
  onPage,
  onComplete,
  onClose,
  aiFields,
  top,
}: {
  open: boolean;
  kind: DocumentKind;
  values: DocumentInput;
  onChange: (key: string, value: string) => void;
  page: number;
  onPage: (page: number) => void;
  onComplete: () => void;
  onClose: () => void;
  aiFields: ReadonlySet<string>;
  /** 첫 페이지 위에 보일 영역 (초안 도우미) */
  top?: ReactNode;
}) {
  const spec = DOCUMENT_SPECS[kind];
  const total = spec.pages.length;
  const current = spec.pages[Math.min(page, total - 1)];
  const [errors, setErrors] = useState<string[]>([]);
  const last = page >= total - 1;
  const fields = current.fields
    .map((k) => spec.fields.find((f) => f.key === k)!)
    .filter((f) => isActive(f, values));

  function next() {
    const bad = invalidFields(kind, current.fields, values);
    setErrors(bad);
    if (bad.length) return;
    if (last) onComplete();
    else onPage(page + 1);
  }

  return (
    <Modal open={open} onClose={onClose} label={`${spec.title} 작성`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        autoComplete="off"
        noValidate
        className="flex max-h-[85dvh] flex-col"
      >
        <header className="border-line border-b px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted text-[13px]">
              {spec.title} · {page + 1} / {total}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="text-muted min-h-9 px-2 text-sm underline-offset-2 hover:underline"
            >
              닫기
            </button>
          </div>
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={page + 1}
            aria-label="진행"
            className="bg-cream mt-2 h-1.5 overflow-hidden rounded-full"
          >
            <div
              className="bg-ink h-full rounded-full transition-[width]"
              style={{ width: `${((page + 1) / total) * 100}%` }}
            />
          </div>
          <h2 className="font-display mt-3 text-[20px] font-bold">{current.title}</h2>
          {current.help && (
            <p className="text-muted mt-1 text-[13px] leading-relaxed">{current.help}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {page === 0 && top}
          <div className="flex flex-col gap-5">
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={values[f.key] ?? ""}
                invalid={errors.includes(f.key)}
                ai={aiFields.has(f.key)}
                onChange={(v) => {
                  onChange(f.key, v);
                  if (errors.includes(f.key)) setErrors((e) => e.filter((k) => k !== f.key));
                }}
              />
            ))}
          </div>
          {errors.length > 0 && (
            <p role="alert" className="text-warn-text mt-4 text-sm">
              비어 있거나 형식이 맞지 않는 칸이 있어요. 표시된 칸을 확인해 주세요.
            </p>
          )}
        </div>

        <footer className="border-line flex items-center justify-between gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={() => {
              setErrors([]);
              onPage(page - 1);
            }}
            disabled={page === 0}
            className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-[15px] disabled:opacity-40"
          >
            이전
          </button>
          <button
            type="submit"
            className="rounded-button bg-ink min-h-11 px-5 text-[15px] font-semibold text-white"
          >
            {last ? "문서 완성하기" : "다음"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function FieldInput({
  field: f,
  value,
  invalid,
  ai,
  onChange,
}: {
  field: Field;
  value: string;
  invalid: boolean;
  ai: boolean;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const describedBy = `${id}-help`;
  const label = (
    <span className="text-ink text-[15px] font-semibold">
      {f.label}
      {f.optional && <span className="text-muted font-normal"> (선택)</span>}
      {ai && (
        <span className="bg-cream text-label ml-2 rounded-[6px] px-1.5 py-0.5 text-xs font-semibold">
          AI 초안 · 확인 필요
        </span>
      )}
    </span>
  );
  const help = (
    <div id={describedBy} className="text-muted mt-0.5 text-[13px] leading-relaxed">
      {f.help && <p>{f.help}</p>}
      {f.example && <p>예: {f.example}</p>}
    </div>
  );
  const border = invalid ? " border-warn-text" : "";

  if (f.type === "choice" || f.type === "checks") {
    const picked = new Set(value.split(",").filter(Boolean));
    return (
      <fieldset aria-describedby={describedBy} aria-invalid={invalid || undefined}>
        <legend>{label}</legend>
        {help}
        <div className="mt-2 flex flex-col gap-2">
          {f.options!.map((o) => {
            const checked = f.type === "choice" ? value === o.value : picked.has(o.value);
            return (
              <label
                key={o.value}
                className={`rounded-button border-line flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-2.5 text-[15px] ${checked ? "border-ink bg-cream" : "bg-white"}`}
              >
                <input
                  type={f.type === "choice" ? "radio" : "checkbox"}
                  name={`${id}-opt`}
                  checked={checked}
                  onChange={(e) => {
                    if (f.type === "choice") onChange(o.value);
                    else {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(o.value);
                      else next.delete(o.value);
                      onChange(
                        f
                          .options!.map((x) => x.value)
                          .filter((v) => next.has(v))
                          .join(","),
                      );
                    }
                  }}
                  className="mt-1"
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const common = {
    id,
    value,
    maxLength: f.max,
    autoComplete: "off",
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    className: inputClass + border,
  };
  // 검증을 통과할 금액일 때만 미리 보여 준다 ("10만" 같은 글을 숫자로 바꿔 보이지 않는다)
  const digits = value.normalize("NFKC").replace(/[\s,원]/g, "");
  const validMoney = /^[1-9]\d{0,14}$/.test(digits);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {help}
      <div className="mt-1.5">
        {f.type === "textarea" ? (
          <textarea rows={6} {...common} />
        ) : f.type === "date" ? (
          <input type="date" {...common} className={`${inputClass}${border} max-w-[220px]`} />
        ) : f.type === "money" ? (
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              {...common}
              className={`${inputClass}${border} max-w-[240px]`}
            />
            <span className="text-muted text-[15px]">원</span>
          </div>
        ) : f.type === "rate" ? (
          <div className="flex items-center gap-2">
            <span className="text-muted text-[15px]">연</span>
            <input
              inputMode="decimal"
              {...common}
              className={`${inputClass}${border} max-w-[120px]`}
            />
            <span className="text-muted text-[15px]">%</span>
          </div>
        ) : (
          <input {...common} />
        )}
      </div>
      {f.type === "money" && validMoney && (
        <p className="text-muted mt-1 text-[13px]">
          문서에는 금 {formatWon(digits)}원으로 들어가요.
        </p>
      )}
    </div>
  );
}
