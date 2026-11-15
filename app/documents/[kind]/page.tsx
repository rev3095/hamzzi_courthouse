// 문서 작성 안내 (내용증명·소장, DEC-022). 결과 화면의 '○○ 바로 가기'가 여기로 온다.
// 작성 요령·공식 양식 링크는 미리 렌더링하고, 작성 폼은 legal_documents 게이트가 승인됐을 때만 보인다 (절대 규칙 5).
// 게이트 확인은 요청 때 서버에서 한다 — 클라이언트 플래그로 열지 않는다. 조회에 실패하면 닫힌 것으로 본다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { DOCUMENT_KINDS, DOCUMENT_SPECS, isDocumentKind } from "@/lib/documents/policy";
import type { DocumentKind } from "@/lib/procedure/steps";
import { PROCEDURE_NOTICE } from "@/lib/procedure/steps";
import { isOpen } from "@/lib/gate/policy";
import { getGate } from "@/lib/gate/store";

export const metadata: Metadata = {
  title: "문서 작성 안내 · 햄찌법원",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return DOCUMENT_KINDS.map((kind) => ({ kind }));
}

export default async function DocumentPage({ params }: PageProps<"/documents/[kind]">) {
  const { kind } = await params;
  if (!isDocumentKind(kind)) notFound();
  const spec = DOCUMENT_SPECS[kind];
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[880px] px-4 py-8 lg:py-12">
        <article className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
          <p className="text-muted text-sm">
            <Link href="/" className="text-link underline">
              홈
            </Link>{" "}
            · 절차 안내 · {spec.stepLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-ink text-[26px] font-bold">{spec.title} 작성 안내</h1>
            <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
              {PROCEDURE_NOTICE}
            </span>
          </div>
          <p className="text-muted mt-2 text-[15px] leading-relaxed">{spec.intro}</p>

          <Suspense fallback={<GatedNotice />}>
            <GateArea kind={kind} />
          </Suspense>

          <section aria-labelledby="tips-title" className="mt-8">
            <h2 id="tips-title" className="font-display text-ink text-[19px] font-bold">
              작성 요령
            </h2>
            <ul className="text-ink mt-3 list-disc pl-5 text-[15px] leading-relaxed">
              {spec.tips.map((t) => (
                <li key={t} className="mt-1">
                  {t}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="forms-title" className="mt-8">
            <h2 id="forms-title" className="font-display text-ink text-[19px] font-bold">
              공식 양식·안내
            </h2>
            <ul className="mt-2 flex flex-col">
              {spec.links.map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link inline-flex min-h-11 items-center text-[15px] underline-offset-2 hover:underline"
                  >
                    {l.label} →
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <p className="border-line text-muted mt-8 border-t pt-4 text-[13px] leading-relaxed">
            햄찌법원은 법률 정보를 제공할 뿐 법률 자문을 하지 않습니다. 문서를 보내거나 내기 전에는
            변호사·법무사 또는 대한법률구조공단 상담을 권해요.
          </p>
        </article>
      </div>
    </main>
  );
}

async function GateArea({ kind }: { kind: DocumentKind }) {
  await connection();
  const open = await getGate("legal_documents")
    .then(isOpen)
    .catch(() => false);
  return open ? <DocumentForm spec={DOCUMENT_SPECS[kind]} /> : <GatedNotice />;
}

function GatedNotice() {
  return (
    <section
      aria-label="문서 자동 작성"
      className="rounded-card border-note-line bg-note mt-6 border px-5 py-4"
    >
      <p className="text-ink text-[15px] font-semibold">법률 검토 후 열릴 기능이에요</p>
      <p className="text-muted mt-1 text-sm leading-relaxed">
        입력한 내용으로 문서를 채워 내려받는 기능은 법률 검토를 마친 뒤에 열어요. 지금은 아래 작성
        요령과 공식 양식을 참고해 주세요.
      </p>
    </section>
  );
}
