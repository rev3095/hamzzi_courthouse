"use client";
// 문서 작성 팝업 (네이티브 <dialog>, 모달). 열리면 포커스가 안으로 들어가고 Esc·닫기로 닫힌다.
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  label,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`rounded-panel border-line text-ink m-auto w-[calc(100%-32px)] border bg-white p-0 backdrop:bg-black/40 ${wide ? "max-w-[720px]" : "max-w-[520px]"}`}
    >
      {open && children}
    </dialog>
  );
}
