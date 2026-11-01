// S-08 정책 · 출처 표기 (/privacy · /terms · /sources). 문구는 초안이며 법무·법제처 이용조건 확인 후 확정한다 (P10).
import Link from "next/link";
import type { ReactNode } from "react";

const PAGES = [
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
  { href: "/sources", label: "출처 표기" },
] as const;

export function PolicyPage({
  current,
  title,
  draft = true,
  children,
}: {
  current: (typeof PAGES)[number]["href"];
  title: string;
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[760px] flex-1 px-4 py-10">
      <p className="text-muted text-[13px]">정책</p>
      <nav aria-label="정책 문서" className="mt-2 flex flex-wrap gap-2">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.href === current ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
              p.href === current ? "border-ink bg-ink text-white" : "border-line text-ink bg-white"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <h1 className="font-display text-ink mt-8 text-[28px] font-bold">{title}</h1>
      {draft && (
        <p className="rounded-card border-note-line bg-note text-warn-text mt-3 border px-4 py-3 text-sm leading-relaxed">
          초안 · 법무 검토 전입니다. 데모 기간에 쓰는 임시 문서이며, 검토 후 내용이 바뀔 수 있어요.
        </p>
      )}
      <div className="policy text-ink mt-6 flex flex-col gap-6 text-[15px] leading-[1.8]">
        {children}
      </div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-ink text-lg font-bold">{title}</h2>
      <div className="text-muted mt-2 flex flex-col gap-2">{children}</div>
    </section>
  );
}
