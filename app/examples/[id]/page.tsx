// 예시 답변 화면 /examples/[id] (DEC-028, S-04 재사용). 예시 질문(lib/demo/examples.json, P9 평가에서 인용 검증을 통과한
// 미리 만든 분석)을 질문 생성·분석 API 없이 빌드 때 정적으로 렌더링한다 — Claude 호출·DB 저장·질문 횟수 차감이 없다.
// 결과 형식(AI 고지·타임라인·근거·검증 탭·법제처 출처)은 실제 결과 화면과 같은 ResultPanel을 쓴다 (절대 규칙 1·6).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExampleSides } from "@/components/result/ExampleSides";
import { ResultPanel } from "@/components/result/ResultPanel";
import {
  EXAMPLE_PAGE_NOTE,
  EXAMPLE_SIDES_NOTE,
  demoExamples,
  exampleBySlug,
  exampleCategory,
  exampleSlug,
  replayResult,
} from "@/lib/demo/policy";
import { CATEGORIES } from "@/lib/procedure/categories";

export const metadata: Metadata = { title: "예시 답변 · 햄찌법원" };

export function generateStaticParams() {
  return demoExamples().map((e) => ({ id: exampleSlug(e.id) }));
}

export default async function ExamplePage({ params }: PageProps<"/examples/[id]">) {
  const { id } = await params;
  const example = exampleBySlug(id);
  if (!example) notFound();
  const result = replayResult(example);
  const category = exampleCategory(example.id);
  const askHref = category ? `/?category=${category}#ask` : "/#ask";
  return (
    <main className="bg-bg flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
        <p className="text-muted mb-4 text-sm">
          <Link href="/#examples" className="text-link underline">
            예시 답변 목록
          </Link>{" "}
          · {category ? CATEGORIES[category].label : "예시"}
        </p>
        <section
          aria-label="예시 답변 안내"
          className="rounded-card border-note-line bg-note mb-4 border px-5 py-4"
        >
          <p className="text-ink text-[15px] font-semibold">
            예시 답변 · 질문 횟수에 포함되지 않아요
          </p>
          <p className="text-muted mt-1 text-sm leading-relaxed">
            {example.sides?.length ? EXAMPLE_SIDES_NOTE : EXAMPLE_PAGE_NOTE}
          </p>
        </section>
        {example.sides?.length ? (
          <ExampleSides
            sides={example.sides.map((s) => ({
              ...s,
              result: replayResult({ ...example, result: s.result }),
            }))}
            category={category}
            askHref={askHref}
          />
        ) : (
          <ResultPanel
            result={result}
            question={example.question}
            category={category}
            askHref={askHref}
            followUp={null}
          />
        )}
      </div>
    </main>
  );
}
