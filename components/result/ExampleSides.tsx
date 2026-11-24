"use client";
// 예시 답변의 쪽 탭 (2026-11-25): 같은 사건을 원고·피고(민사), 고소인·피의자(형사) 쪽으로 나눠 미리 분석해 둔 답변과
// 문서 작성 절차·초안을 보인다. 화면 질문은 짧은 요약이고, 답변은 접어 둔 자세한 상황으로 만들었다.
// 모든 내용은 빌드에 들어간 저장 결과다 — Claude 호출·질문 횟수 차감 없음.
import { useState } from "react";
import { ResultPanel } from "@/components/result/ResultPanel";
import { AI_NOTICE } from "@/lib/api/respond";
import type { ExampleGuide, ExampleSide } from "@/lib/demo/policy";
import { CHECK_NOTICE, DRAFT_NOTICE } from "@/lib/documents/fields";
import type { CategoryKey } from "@/lib/procedure/categories";

const OWNER = { self: "혼자 가능", expert: "전문가 권장" } as const;

export function ExampleSides({
  sides,
  category,
  askHref,
}: {
  sides: ExampleSide[];
  category: CategoryKey | null;
  askHref: string;
}) {
  const [at, setAt] = useState(0);
  const side = sides[at] ?? sides[0];
  return (
    <div>
      {sides.length > 1 && (
        <div role="tablist" aria-label="누구 쪽 답변인지" className="mb-4 flex flex-wrap gap-2">
          {sides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === at}
              onClick={() => setAt(i)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                i === at ? "border-ink bg-ink text-white" : "border-line text-ink bg-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <details className="rounded-card border-line mb-4 border bg-white px-5 py-3">
        <summary className="text-ink cursor-pointer text-sm font-semibold">
          이 예시의 자세한 상황 보기 (답변은 이 상황으로 만들었어요)
        </summary>
        <p className="text-muted mt-3 text-xs">{AI_NOTICE} · AI가 지어낸 가상 사연</p>
        <p className="text-muted mt-1 text-sm leading-relaxed whitespace-pre-line">
          {side.context}
        </p>
      </details>
      <ResultPanel
        key={side.key}
        result={side.result}
        question={side.question}
        category={category}
        askHref={askHref}
        followUp={null}
      />
      {side.guide && <GuideView guide={side.guide} />}
    </div>
  );
}

function GuideView({ guide }: { guide: ExampleGuide }) {
  return (
    <section
      aria-label="문서 작성 절차"
      className="rounded-card border-line mt-6 border bg-white px-5 py-5"
    >
      <p className="text-muted text-xs">
        {AI_NOTICE} · {DRAFT_NOTICE}
      </p>
      <h2 className="text-ink mt-1 text-lg font-bold">문서 작성 절차</h2>
      <ol className="mt-3 space-y-3">
        {guide.procedure.map((s, i) => (
          <li key={i} className="border-line rounded-lg border px-4 py-3">
            <p className="text-ink text-[15px] font-semibold">
              {i + 1}. {s.title}{" "}
              <span className="bg-soft text-label ml-1 rounded-full px-2 py-0.5 text-xs font-medium">
                {OWNER[s.owner]}
              </span>
            </p>
            <p className="text-muted mt-1 text-sm leading-relaxed">{s.detail}</p>
          </li>
        ))}
      </ol>
      <details className="mt-5" open>
        <summary className="text-ink cursor-pointer text-[15px] font-semibold">
          {guide.document.name} 초안
          {guide.document.basis ? (
            <span className="text-muted ml-2 text-xs font-normal">
              따른 서식: {guide.document.basis}
            </span>
          ) : null}
        </summary>
        <div className="bg-cream border-line mt-3 rounded-lg border px-5 py-4">
          {guide.document.sections.map((sec, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <h3 className="text-ink text-sm font-bold">{sec.heading}</h3>
              {sec.paragraphs.map((p, j) => (
                <p key={j} className="text-ink mt-1 text-sm leading-relaxed whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </div>
      </details>
      {guide.checklist.length > 0 && (
        <div className="mt-5">
          <h3 className="text-ink text-[15px] font-semibold">내기 전에 직접 확인할 것</h3>
          <ul className="text-muted mt-2 list-disc space-y-1 pl-5 text-sm">
            {guide.checklist.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-muted mt-4 text-xs leading-relaxed">{CHECK_NOTICE}</p>
    </section>
  );
}
