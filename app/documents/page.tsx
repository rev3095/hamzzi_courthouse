// 문서 작성 목록 (DEC-067, UI·UX 개정 PR 1): 주 메뉴 '문서 작성'이 여기로 온다. 전에는 결과 화면에서만 서식에 들어갈 수 있었다.
// 서식 20종을 분야별로 묶어 보이고(lib/documents/catalog), 받은 서류가 있으면 서류 분석(/casefile)으로 잇는다.
// AI를 부르지 않는 정적 목록이다. 작성·내보내기는 각 서식 화면(/documents/[kind])에서 한다(DEC-022·055, 게이트 없음).
import type { Metadata } from "next";
import Link from "next/link";
import { DOCUMENT_GROUPS } from "@/lib/documents/catalog";
import { CHECK_NOTICE, DOCUMENT_SPECS } from "@/lib/documents/policy";

export const metadata: Metadata = { title: "문서 작성 · 햄찌법원" };

export default function DocumentsPage() {
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
        <h1 className="font-display text-ink text-[30px] font-bold lg:text-[38px]">문서 작성</h1>
        <p className="text-muted mt-2 max-w-[720px] text-[15px] leading-relaxed">
          내용증명·소장·고소장 같은 서류를 질문에 답하며 채우고, 한글(HWPX)·워드·PDF로 내려받아요.
          모두 무료이고, 적은 내용은 저장하지 않아요.
        </p>

        <Link
          href="/casefile"
          className="rounded-panel border-line hover:border-gold mt-6 flex flex-wrap items-center justify-between gap-3 border bg-white px-5 py-4"
        >
          <span>
            <span className="text-ink block text-[17px] font-bold">받은 서류가 있나요?</span>
            <span className="text-muted mt-0.5 block text-[14px] leading-relaxed">
              소장·지급명령·내용증명을 올리면 서류 내용과 지금 해 볼 일을 정리해 드려요.
            </span>
          </span>
          <span className="bg-ink rounded-button flex min-h-11 items-center px-4 text-[15px] font-bold text-white">
            서류 분석하기
          </span>
        </Link>

        {DOCUMENT_GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`doc-${g.id}`} className="mt-10">
            <h2 id={`doc-${g.id}`} className="font-display text-ink text-[21px] font-bold">
              {g.label}
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.kinds.map((kind) => {
                const spec = DOCUMENT_SPECS[kind];
                return (
                  <li key={kind}>
                    <Link
                      href={`/documents/${kind}`}
                      className="rounded-card border-line hover:border-ink flex h-full flex-col border bg-white px-4 py-3.5"
                    >
                      <span className="text-ink text-[16px] font-bold">{spec.title}</span>
                      <span className="text-muted mt-1 line-clamp-3 text-[14px] leading-relaxed">
                        {spec.intro}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <p className="border-line text-muted mt-10 border-t pt-4 text-[13px] leading-relaxed">
          {CHECK_NOTICE}
        </p>
      </div>
    </main>
  );
}
