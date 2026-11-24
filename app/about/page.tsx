// 소개 (DEC-051): 왜 만들었는지, 정보 '정리' 도구라는 점, 지키는 원칙. 고정 문안은 lib/about/content.ts
import type { Metadata } from "next";
import Link from "next/link";
import { AboutBlock, AboutShell } from "@/components/about/AboutShell";
import { HamzziJudge } from "@/components/HamzziJudge";
import { INTRO, INTRO_LEAD } from "@/lib/about/content";

export const metadata: Metadata = { title: "소개 · 햄찌법원" };

export default function AboutPage() {
  return (
    <AboutShell current="/about" title="법률 정보를 정리해 드리는 무료 도구" lead={INTRO_LEAD}>
      <div className="flex justify-center">
        <HamzziJudge size={150} interactive={false} />
      </div>
      {INTRO.map((s) => (
        <AboutBlock key={s.title} section={s} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/about/features"
          className="rounded-button bg-ink flex min-h-11 items-center px-4 text-sm font-semibold text-white"
        >
          기능 가이드 보기
        </Link>
        <Link
          href="/about/developer#contact"
          className="rounded-button border-line text-ink flex min-h-11 items-center border bg-white px-4 text-sm font-semibold"
        >
          문의 남기기
        </Link>
      </div>
    </AboutShell>
  );
}
