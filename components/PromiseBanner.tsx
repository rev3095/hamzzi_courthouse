// 햄찌 판사의 약속 (Figma 05 "약속 배너", 브랜드 가이드 1장)
import { HamzziBadge } from "./HamzziJudge";

const PROMISES = [
  "판례 근거 없이 말하지 않아요. 모든 답에 출처를 달아요.",
  "“무조건 이겨요” 같은 결과 단정은 하지 않아요.",
  "개인정보는 가려서 다뤄요.",
];

export function PromiseBanner() {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-2 pb-16 lg:pb-20">
      <div className="border-honey-line bg-honey flex flex-col gap-6 rounded-[20px] border px-6 py-8 lg:flex-row lg:items-center lg:gap-10 lg:px-10">
        <div className="flex items-center gap-3.5 lg:w-[260px] lg:shrink-0">
          <HamzziBadge size={64} />
          <div>
            <h2 className="font-display text-ink text-[22px] font-bold">햄찌 판사의 약속</h2>
            <p className="text-muted text-sm">귀엽지만, 답은 진지하게.</p>
          </div>
        </div>
        <ul className="grid flex-1 gap-2.5 lg:grid-cols-3">
          {PROMISES.map((p) => (
            <li
              key={p}
              className="rounded-card text-ink flex gap-2.5 bg-white px-4 py-3.5 text-[15px] leading-relaxed"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              >
                <path
                  d="M3 10.5L8 15L17 5"
                  stroke="var(--sage)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
