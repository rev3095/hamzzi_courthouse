// 서류 분석 예시 화면 /casefile/examples/[id] (F-015, DEC-052). 직접 쓴 가상 서류를 실제 서류 분석과 같은 길로 미리 분석해 둔
// 결과(lib/casefile/examples.json, 인용 검증 통과 문단만)를 빌드 때 정적으로 렌더링한다 — Claude·법제처·DB·질문 횟수 차감 없음.
// 결과 형식(AI 고지·사건 구조도·쟁점별 근거·검증 탭·법제처 출처)은 실제 결과 화면과 같은 ResultPanel을 쓴다 (절대 규칙 1·6).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseFileExampleView } from "@/components/casefile/CaseFileExampleView";
import { ResultPanel } from "@/components/result/ResultPanel";
import {
  CASEFILE_EXAMPLE_NOTE,
  casefileExampleById,
  casefileExamples,
  casefileReplayResult,
} from "@/lib/casefile/examples";

export const metadata: Metadata = { title: "서류 분석 예시 · 햄찌법원" };

export function generateStaticParams() {
  return casefileExamples().map((e) => ({ id: e.id }));
}

export default async function CaseFileExamplePage({
  params,
}: PageProps<"/casefile/examples/[id]">) {
  const { id } = await params;
  const example = casefileExampleById(id);
  if (!example) notFound();
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
        <p className="text-muted mb-4 text-sm">
          <Link href="/casefile#examples" className="text-link underline">
            서류 분석 예시 목록
          </Link>{" "}
          · {example.title}
        </p>
        <section
          aria-label="예시 안내"
          className="rounded-card border-note-line bg-note mb-4 border px-5 py-4"
        >
          <p className="text-ink text-[15px] font-semibold">
            서류 분석 예시 · 질문 횟수에 포함되지 않아요
          </p>
          <p className="text-muted mt-1 text-sm leading-relaxed">{CASEFILE_EXAMPLE_NOTE}</p>
        </section>
        <CaseFileExampleView example={example} />
        <ResultPanel
          result={casefileReplayResult(example)}
          question={example.question}
          category={null}
          askHref="/casefile"
          followUp={null}
        />
      </div>
    </main>
  );
}
