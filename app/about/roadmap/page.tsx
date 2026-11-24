// 향후 계획 (DEC-051): 발표 유인물(2026-11-20) 가운데 단계·일정만. 가격·협업 기관 이름·경쟁 서비스·매출 목표는 싣지 않는다.
// 고정 문안은 lib/about/content.ts. 승패·가능성 표현과 확정 표현을 쓰지 않는다 (절대 규칙 2).
import type { Metadata } from "next";
import { AboutBlock, AboutShell, StepRow } from "@/components/about/AboutShell";
import {
  CASE_DB,
  ENGINE_KEEPS,
  ENGINE_STEPS,
  NOT_CHARGED,
  ROADMAP_CHECKS,
  ROADMAP_LEAD,
  ROADMAP_NOTICE,
  SCHEDULE,
  SERVICE_STEPS,
} from "@/lib/about/content";

export const metadata: Metadata = { title: "향후 계획 · 햄찌법원" };

export default function RoadmapPage() {
  return (
    <AboutShell current="/about/roadmap" title="향후 계획" lead={ROADMAP_LEAD}>
      <p className="rounded-card border-note-line bg-note text-warn-text border px-4 py-3 text-sm leading-relaxed">
        {ROADMAP_NOTICE}
      </p>

      <section>
        <h2 className="font-display text-ink text-lg font-bold">외부 AI 모델에서 자체 엔진으로</h2>
        <StepRow steps={ENGINE_STEPS} />
        <h3 className="text-ink mt-5 text-[15px] font-bold">단계가 바뀌어도 그대로 가져가는 것</h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {ENGINE_KEEPS.map((k) => (
            <li key={k.title} className="rounded-card border-line border bg-white px-4 py-3">
              <strong className="text-ink block text-sm">{k.title}</strong>
              <span className="text-muted text-[13px]">{k.lines[0]}</span>
            </li>
          ))}
        </ul>
      </section>

      <AboutBlock section={CASE_DB} />

      <section>
        <h2 className="font-display text-ink text-lg font-bold">서비스를 넓히는 순서</h2>
        <StepRow steps={SERVICE_STEPS} />
        <p className="rounded-card bg-cream text-ink mt-3 px-4 py-3 text-sm leading-relaxed">
          <strong>받지 않는 돈</strong> · {NOT_CHARGED}
        </p>
      </section>

      <section>
        <h2 className="font-display text-ink text-lg font-bold">일정</h2>
        <div className="mt-3 flex flex-col gap-3">
          {SCHEDULE.map((t) => (
            <div
              key={t.track}
              className="rounded-card border-line flex flex-col gap-2 border bg-white p-4 sm:flex-row sm:gap-4"
            >
              <strong className="text-ink w-32 shrink-0 text-sm">{t.track}</strong>
              <ol className="flex flex-1 flex-wrap gap-2">
                {t.items.map((i) => (
                  <li
                    key={i.when + i.what}
                    className="border-line bg-bg flex flex-col rounded-[10px] border px-3 py-1.5"
                  >
                    <span className="text-gold text-[11px] font-bold">{i.when}</span>
                    <span className="text-ink text-[13px]">{i.what}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {ROADMAP_CHECKS.map((c) => (
          <div key={c.title} className="rounded-card border-line border bg-white p-4">
            <p className="text-gold text-[12px] font-bold">{c.title}</p>
            <p className="text-ink mt-1 text-sm leading-relaxed font-semibold">{c.lines[0]}</p>
          </div>
        ))}
      </section>
    </AboutShell>
  );
}
