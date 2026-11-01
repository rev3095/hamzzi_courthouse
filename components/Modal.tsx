"use client";
// 가운데 모달 (와이어프레임 S-02 개인정보 확인, S-06 로그인 안내). 배경은 홈을 어둡게 덮는다.
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="bg-ink/50 fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hz-modal-title"
        tabIndex={-1}
        className="rounded-panel border-line w-full max-w-[440px] border bg-white p-6 shadow-xl outline-none"
      >
        <h2 id="hz-modal-title" className="font-display text-ink text-xl font-bold">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-button bg-ink min-h-11 px-5 text-[15px] font-semibold text-white disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-button border-line text-ink min-h-11 border bg-white px-5 text-[15px] disabled:opacity-50 ${props.className ?? ""}`}
    />
  );
}
