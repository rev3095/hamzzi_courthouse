// 서류 분석 화면(/casefile)의 예제 프리셋 목록 (F-015, DEC-052). 누르면 미리 분석해 둔 예시 화면으로 바로 간다 —
// 질문 생성·판독·분석 API를 부르지 않아 질문 횟수가 줄지 않는다.
import Image from "next/image";
import Link from "next/link";
import { BASIS_LABEL, casefileExampleHref, casefileExamples } from "@/lib/casefile/examples";

export function CaseFileExampleList() {
  const list = casefileExamples();
  if (list.length === 0) return null;
  return (
    <section id="examples" aria-labelledby="hz-cf-examples" className="mt-8 scroll-mt-20">
      <h2 id="hz-cf-examples" className="text-ink text-[18px] font-bold">
        예제로 먼저 보기
      </h2>
      <p className="text-muted mt-1 text-[14px]">
        가상 서류를 실제와 같은 순서로 분석해 둔 예시예요. 누르면 바로 열리고 질문 횟수에 포함되지
        않아요.
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <li key={e.id}>
            <Link
              href={casefileExampleHref(e.id)}
              className="rounded-card border-line hover:border-ink group flex h-full flex-col overflow-hidden border bg-white transition-colors"
            >
              <div className="bg-soft relative h-36 overflow-hidden">
                <Image
                  src={e.image}
                  alt=""
                  width={e.width}
                  height={e.height}
                  sizes="(min-width: 1024px) 260px, (min-width: 640px) 45vw, 90vw"
                  className="w-full object-cover object-top opacity-90 transition-transform group-hover:scale-[1.02]"
                />
                <span className="bg-ink absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] text-white">
                  {BASIS_LABEL[e.basis]}
                </span>
              </div>
              <div className="flex flex-1 flex-col px-4 py-3">
                <p className="text-ink text-[15px] leading-snug font-semibold">{e.title}</p>
                <p className="text-muted mt-1 line-clamp-2 text-[13px] leading-relaxed">
                  {e.userQuestion}
                </p>
                <p className="text-label mt-auto pt-2 text-[12px]">
                  {e.reading.docTypes.join(" · ")} · 쟁점 {e.result.deep?.issues.length ?? 0}개 ·
                  근거 문단 {e.result.answer.points.length}개
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
