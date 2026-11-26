// 소개 메뉴 공통 틀 (DEC-051): 소개 · 기능 가이드 · 향후 계획 · 개발자·문의.
// Figma에 없는 화면이라 정책 페이지(PolicyPage)와 같은 구조·브랜드 토큰(ink·honey·line)을 따른다.
// 라우트 훅을 쓰지 않고 current를 받아 표시한다 (cacheComponents).
import Link from "next/link";
import type { ReactNode } from "react";
import { ABOUT_NOTICE, ABOUT_PAGES, type AboutHref, type AboutSection } from "@/lib/about/content";
import { PAGE_TITLE } from "@/components/ui/styles";

export function AboutShell({
  current,
  title,
  lead,
  children,
}: {
  current: AboutHref;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[860px] flex-1 px-4 py-10">
      <p className="text-muted text-[13px]">햄찌법원</p>
      <nav aria-label="햄찌법원 소개" className="mt-2 flex flex-wrap gap-2">
        {ABOUT_PAGES.map((p) => (
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
      <h1 className={`${PAGE_TITLE} mt-8`}>{title}</h1>
      {lead && <p className="text-ink mt-3 text-[17px] leading-relaxed">{lead}</p>}
      <div className="text-ink mt-8 flex flex-col gap-10 text-[15px] leading-[1.8]">{children}</div>
      <p className="text-muted border-line mt-12 border-t pt-4 text-[12px]">{ABOUT_NOTICE}</p>
    </main>
  );
}

export function AboutBlock({ section, children }: { section: AboutSection; children?: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-ink text-lg font-bold">{section.title}</h2>
      <div className="text-muted mt-2 flex flex-col gap-2">
        {section.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {section.list && (
          <ul className="flex flex-col gap-1.5 pl-1">
            {section.list.map((item) => {
              const [head, ...rest] = item.split(": ");
              return (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-gold">
                    •
                  </span>
                  <span>
                    {rest.length > 0 ? (
                      <>
                        <strong className="text-ink font-semibold">{head}</strong>:{" "}
                        {rest.join(": ")}
                      </>
                    ) : (
                      item
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {children}
      </div>
    </section>
  );
}

/** 단계 카드 줄 (향후 계획). 지금 단계는 꿀색으로 표시 */
export function StepRow({
  steps,
}: {
  steps: { tag: string; title: string; body: string; current?: true }[];
}) {
  return (
    <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s) => (
        <li
          key={s.title}
          className={`rounded-card flex flex-col gap-1 border p-4 ${
            s.current ? "border-honey-line bg-honey" : "border-line bg-white"
          }`}
        >
          <span className="text-gold text-[12px] font-bold">{s.tag}</span>
          <strong className="text-ink text-[15px] leading-snug">{s.title}</strong>
          <span className="text-muted text-[13px] leading-relaxed">{s.body}</span>
        </li>
      ))}
    </ol>
  );
}
