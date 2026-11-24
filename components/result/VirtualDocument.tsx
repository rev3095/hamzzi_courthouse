// 가상 문서 (DEC-062): 예시 질문 결과에 붙는 문서 초안 한 장. 종이 모양으로 보이고, 내 사건은 문서 작성 화면으로 보낸다.
import Link from "next/link";
import { AI_NOTICE } from "@/lib/api/respond";
import { VIRTUAL_DOC_NOTICE, parseVirtualDoc } from "@/lib/documents/virtual";

export function VirtualDocument({ doc: raw }: { doc: unknown }) {
  const doc = parseVirtualDoc(raw);
  if (!doc) return null;
  return (
    <section aria-labelledby="virtual-doc-title" className="mt-6">
      <h3 id="virtual-doc-title" className="text-ink text-[15px] font-bold">
        가상 문서 · {doc.formTitle}
      </h3>
      <p className="text-muted text-[13px] leading-relaxed">
        {AI_NOTICE} · {VIRTUAL_DOC_NOTICE}
      </p>
      <div className="border-line mt-3 rounded-[6px] border bg-white px-5 py-6 shadow-[0_2px_10px_rgba(26,34,51,0.06)] sm:px-8">
        <p className="text-muted text-right text-[11px] tracking-[0.2em]">가상 문서 · 예시</p>
        <p className="font-display text-ink mt-2 text-center text-[20px] font-bold">{doc.title}</p>
        <div className="mt-5 flex flex-col gap-4">
          {doc.sections.map((s, i) => (
            <div key={i}>
              <p className="text-ink text-[14px] font-bold">{s.heading}</p>
              <p className="text-ink mt-1 text-[14px] leading-[1.8] whitespace-pre-line">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2">
        <Link
          href={`/documents/${doc.kind}`}
          className="text-link text-sm font-semibold underline-offset-2 hover:underline"
        >
          내 사실로 {doc.formTitle} 쓰기 →
        </Link>
      </p>
    </section>
  );
}
