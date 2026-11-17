"use client";
// 빠른 열기 (DEC-026 제안): Ctrl/Cmd+K로 최근 본 자료와 검색 화면을 연다. 이력은 이 기기에만 있다.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "../Modal";
import { RecentList } from "./parts";
import { useRecent } from "./recent";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const recent = useRecent();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <Modal title="빠른 열기" onClose={close}>
      {/* 링크를 누르면 닫는다 */}
      <div
        onClick={(e) => (e.target as HTMLElement).closest("a") && close()}
        className="max-h-[60vh] overflow-y-auto"
      >
        <Link
          href="/search"
          className="rounded-button border-line text-ink flex min-h-11 items-center border bg-white px-4 text-sm font-semibold"
        >
          판례·법령 검색 열기 →
        </Link>
        {recent.length === 0 ? (
          <p className="text-muted mt-4 text-sm">
            아직 본 자료가 없어요. 판례나 조문을 열어 보면 여기에 모여요.
          </p>
        ) : (
          <div className="mt-4">
            <RecentList compact />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        className="rounded-button border-line text-ink mt-4 min-h-11 w-full border bg-white px-4 text-sm"
      >
        닫기
      </button>
    </Modal>
  );
}
