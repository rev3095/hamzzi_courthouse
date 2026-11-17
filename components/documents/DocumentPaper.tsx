"use client";
// 문서 미리보기·편집기 (DEC-025). 별도 리더기·편집기 설치 없이 웹·앱 안에서 A4 종이 모양으로 보고 고친다.
// 편집은 이 화면 메모리에서만 — 저장(확정) 버튼은 서버·기기에 쓰지 않고 내보낼 내용을 확정할 뿐이다.
import { useId, useState } from "react";
import type { Block, BlockKind } from "@/lib/documents/fill";

const LOOK: Record<BlockKind, string> = {
  title: "text-center text-[20px] font-bold tracking-wide",
  heading: "text-center text-[15px] font-bold",
  center: "text-center",
  right: "text-right",
  text: "",
  blank: "",
};

export function DocumentPreview({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="border-line mx-auto w-full max-w-[640px] border bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-12">
      <div className="text-ink text-[14px] leading-[1.75]">
        {blocks.map((b, i) =>
          b.kind === "blank" ? (
            <div key={i} className="h-3" aria-hidden="true" />
          ) : (
            <p key={i} className={`break-words whitespace-pre-wrap ${LOOK[b.kind]}`}>
              {b.text}
            </p>
          ),
        )}
      </div>
    </div>
  );
}

const ALIGNS: { kind: BlockKind; label: string }[] = [
  { kind: "text", label: "왼쪽" },
  { kind: "center", label: "가운데" },
  { kind: "right", label: "오른쪽" },
];

/** 문단 단위 편집기: 고치기·새 문단·삭제·정렬 */
export function DocumentEditor({
  blocks,
  onChange,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  const baseId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const sel = selected !== null && selected < blocks.length ? selected : null;

  const update = (i: number, patch: Partial<Block>) =>
    onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  function insertAfter(i: number) {
    const next = [...blocks];
    next.splice(i + 1, 0, { kind: "text", text: "" });
    onChange(next);
    setSelected(i + 1);
    requestAnimationFrame(() => document.getElementById(`${baseId}-${i + 1}`)?.focus());
  }

  function remove(i: number) {
    onChange(blocks.filter((_, j) => j !== i));
    setSelected(null);
  }

  return (
    <div>
      <div
        role="toolbar"
        aria-label="문단 도구"
        className="border-line bg-soft sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-3 py-2"
      >
        <span className="text-muted text-[13px]">
          {sel === null ? "고칠 문단을 눌러 고르세요" : `${sel + 1}번째 문단`}
        </span>
        <button
          type="button"
          disabled={sel === null}
          onClick={() => sel !== null && insertAfter(sel)}
          className="rounded-button border-line min-h-9 border bg-white px-3 text-[13px] disabled:opacity-40"
        >
          아래에 새 문단
        </button>
        <button
          type="button"
          disabled={sel === null}
          onClick={() => sel !== null && remove(sel)}
          className="rounded-button border-line min-h-9 border bg-white px-3 text-[13px] disabled:opacity-40"
        >
          문단 삭제
        </button>
        <span className="text-muted ml-1 text-[13px]">정렬</span>
        {ALIGNS.map((a) => (
          <button
            key={a.kind}
            type="button"
            aria-pressed={sel !== null && blocks[sel].kind === a.kind}
            disabled={sel === null || ["title", "heading", "blank"].includes(blocks[sel].kind)}
            onClick={() => sel !== null && update(sel, { kind: a.kind })}
            className="rounded-button border-line aria-pressed:bg-ink min-h-9 border bg-white px-3 text-[13px] disabled:opacity-40 aria-pressed:text-white"
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="border-line mx-auto w-full max-w-[640px] border border-t-0 bg-white px-4 py-6 sm:px-10 sm:py-10">
        {blocks.length === 0 && (
          <button
            type="button"
            onClick={() => onChange([{ kind: "text", text: "" }])}
            className="text-link text-sm underline"
          >
            문단 추가하기
          </button>
        )}
        {blocks.map((b, i) => (
          <textarea
            key={i}
            id={`${baseId}-${i}`}
            aria-label={`${i + 1}번째 문단`}
            value={b.text}
            rows={Math.max(1, Math.ceil(b.text.length / 38), b.text.split("\n").length)}
            onFocus={() => setSelected(i)}
            onChange={(e) =>
              update(i, {
                text: e.target.value,
                kind: b.kind === "blank" && e.target.value ? "text" : b.kind,
              })
            }
            placeholder={b.kind === "blank" ? "(빈 줄)" : ""}
            className={`text-ink hover:border-line focus:border-gold focus:bg-honey/40 block w-full resize-none rounded-[4px] border border-transparent bg-transparent px-1 py-0.5 text-[14px] leading-[1.75] outline-none ${LOOK[b.kind]} ${b.kind === "blank" ? "placeholder:text-line" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
