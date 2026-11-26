// 빠른 답 먼저 (DEC-064): 완성된 답을 기다리는 동안 로딩 화면 위쪽에 보이는 짧은 요약. 저장하지 않고 결과가 오면 사라진다.
import type { QuickPreview } from "@/lib/ai/quick-policy";
import { QUICK_NOTICE } from "@/lib/ai/quick-policy";
import { AI_NOTICE } from "@/lib/api/respond";

export function QuickPreviewCard({ preview }: { preview: QuickPreview }) {
  return (
    <section
      aria-label="먼저 보는 요약"
      data-testid="quick-preview"
      className="rounded-card border-line bg-cream mt-5 border px-5 py-4"
    >
      <p className="text-label text-[13px] font-semibold">먼저 보는 요약</p>
      <p className="text-ink mt-1 text-[17px] leading-[1.75]">{preview.summary}</p>
      {preview.checks.length > 0 && (
        <div className="mt-3">
          <p className="text-ink text-[14px] font-semibold">먼저 확인할 것</p>
          <ul className="mt-1 list-disc pl-5 text-[15px] leading-relaxed">
            {preview.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {preview.nextSteps.length > 0 && (
        <div className="mt-3">
          <p className="text-ink text-[14px] font-semibold">지금 해 둘 일</p>
          <ul className="mt-1 list-disc pl-5 text-[15px] leading-relaxed">
            {preview.nextSteps.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-muted mt-3 text-[12px]">
        {AI_NOTICE} · {QUICK_NOTICE}
      </p>
    </section>
  );
}
