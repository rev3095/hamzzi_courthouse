// 기능 가이드 (DEC-051): 지금 배포된 기능만 소개한다. 고정 문안은 lib/about/content.ts FEATURES
import type { Metadata } from "next";
import Link from "next/link";
import { AboutShell } from "@/components/about/AboutShell";
import { FEATURES, FEATURES_PENDING } from "@/lib/about/content";

export const metadata: Metadata = { title: "기능 가이드 · 햄찌법원" };

export default function FeaturesPage() {
  return (
    <AboutShell
      current="/about/features"
      title="기능 가이드"
      lead="햄찌법원에서 지금 쓸 수 있는 기능이에요. 모든 기능은 무료예요."
    >
      <nav aria-label="기능 목록" className="flex flex-wrap gap-1.5">
        {FEATURES.map((f) => (
          <a
            key={f.id}
            href={`#${f.id}`}
            className="border-line text-ink hover:border-gold flex min-h-9 items-center rounded-full border bg-white px-3 text-[13px]"
          >
            {f.title}
          </a>
        ))}
      </nav>
      <ul className="flex flex-col gap-4">
        {FEATURES.map((f) => (
          <li
            key={f.id}
            id={f.id}
            className="rounded-card border-line scroll-mt-24 border bg-white p-5"
          >
            <h2 className="font-display text-ink text-lg font-bold">{f.title}</h2>
            <p className="text-gold mt-0.5 text-[13px] font-semibold">{f.summary}</p>
            <div className="text-muted mt-2 flex flex-col gap-2">
              {f.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
            {f.link && (
              <Link
                href={f.link.href}
                className="text-link mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2"
              >
                {f.link.label} →
              </Link>
            )}
          </li>
        ))}
      </ul>
      <section>
        <h2 className="font-display text-ink text-lg font-bold">준비 중</h2>
        <ul className="text-muted mt-2 flex flex-col gap-1.5">
          {FEATURES_PENDING.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </AboutShell>
  );
}
