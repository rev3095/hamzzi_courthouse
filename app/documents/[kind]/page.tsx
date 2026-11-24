// 문서 작성 안내 (내용증명·임차권등기명령·지급명령·소장, DEC-022·025). 결과 화면 '바로 가기'·타임라인 단계 '서식 작성하기'가 여기로 온다.
// 설문·편집·내보내기와 AI 대리 작성(초안 도우미)은 DEC-055로 게이트 없이 모두에게 열려 있다 (무료).
// 결과 화면에서 ?from=<질문 번호>로 오면 초안 도우미(DEC-023)로 칸을 채울 수 있다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DocumentStudio } from "@/components/documents/DocumentStudio";
import { DOCUMENT_KINDS, DOCUMENT_SPECS, isDocumentKind } from "@/lib/documents/policy";
import type { DocumentKind } from "@/lib/procedure/steps";
import { PROCEDURE_NOTICE } from "@/lib/procedure/steps";

export const metadata: Metadata = {
  title: "문서 작성 · 햄찌법원",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return DOCUMENT_KINDS.map((kind) => ({ kind }));
}

export default async function DocumentPage({
  params,
  searchParams,
}: PageProps<"/documents/[kind]">) {
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
            <DocTitle title={spec.title} />
            <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
              {PROCEDURE_NOTICE}
            </span>
          </div>
          <p className="text-muted mt-2 text-[15px] leading-relaxed">{spec.intro}</p>

          <Suspense fallback={null}>
            <StudioArea kind={kind} searchParams={searchParams} />
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
              공식 서식·안내
            </h2>
            <p className="text-muted mt-1 text-[13px] leading-relaxed">
              햄찌법원 양식은 아래 공식 서식의 항목 순서를 따라 만든 참고용 양식이에요. 공식 서식은
              기관 사이트에서 이름으로 찾아 내려받을 수 있어요.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {spec.officialForms.map((f) => (
                <li key={f.name} className="text-[15px] leading-relaxed">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link underline-offset-2 hover:underline"
                  >
                    {f.name}
                  </a>
                  <span className="text-muted text-[13px]"> · {f.source}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted mt-3 text-[13px]">근거: {spec.basis.join(" · ")}</p>
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
            햄찌법원이 무료로 대신 작성해 드리는 문서예요. 내기 전에 내용을 한 번 더 읽어 보시고,
            궁금한 점은 햄찌법원 상담으로 이어서 물어보세요.
          </p>
        </article>
      </div>
    </main>
  );
}

function DocTitle({ title }: { title: string }) {
  return <h1 className="font-display text-ink text-[26px] font-bold">{title} 작성</h1>;
}

/** 결과 화면에서 온 질문 번호 (?from=). 초안 도우미(DEC-023)가 서버에서 소유권을 다시 확인한다 */
async function StudioArea({
  kind,
  searchParams,
}: {
  kind: DocumentKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const from = (await searchParams).from;
  const inquiryId = typeof from === "string" && /^[0-9a-f-]{36}$/i.test(from) ? from : null;
  return <DocumentStudio kind={kind} inquiryId={inquiryId} draftEnabled preview={false} />;
}
