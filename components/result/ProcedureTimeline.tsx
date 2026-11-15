"use client";
// 절차 타임라인 (F-014 데모 축소판, DEC-021). Figma D+ "절차 타임라인"(번호 노드 가로 직선)을 따르되
// 노드 아래 예상 기간 대신 난이도 라벨을 쓴다 (절대 규칙 3, DEC-002).
// 마일스톤 팝업: 마우스 호버·키보드 포커스·탭으로 열린다. Esc로 닫고 포커스는 노드로 돌아간다.
import { useEffect, useId, useRef, useState } from "react";
import { difficultyLabel } from "@/lib/procedure/policy";
import {
  DIFFICULTY_LABEL,
  PROCEDURE_NOTICE,
  type Difficulty,
  type ProcedureStep,
} from "@/lib/procedure/steps";

const CHIP: Record<Difficulty, string> = {
  self: "lg:bg-success-bg lg:text-success-text",
  depends: "lg:bg-soft lg:text-muted",
  expert: "lg:bg-cream lg:text-warn-text",
};
const DOT: Record<Difficulty, string> = {
  self: "bg-success-text",
  depends: "bg-muted/50",
  expert: "bg-warn-text",
};

type Open = { index: number; pinned: boolean } | null;

export function ProcedureTimeline({
  steps,
  recommendedKey,
  onAskStep,
}: {
  steps: ProcedureStep[];
  recommendedKey: string;
  onAskStep?: (question: string) => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const baseId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Esc·닫기로 노드에 포커스를 돌려줄 때는 다시 열지 않는다
  const returningFocus = useRef(false);

  // 바깥을 누르면 닫는다 (탭으로 연 팝업)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (focusNode: boolean) => {
    const i = open?.index;
    setOpen(null);
    if (focusNode && i !== undefined) {
      returningFocus.current = true;
      nodeRefs.current[i]?.focus();
      returningFocus.current = false;
    }
  };

  return (
    <section aria-labelledby={`${baseId}-title`} className="mt-7">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${baseId}-title`} className="font-display text-ink text-[19px] font-bold">
          절차 타임라인
        </h2>
        <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
          {PROCEDURE_NOTICE}
        </span>
      </div>
      <p className="text-muted mt-1 text-[13px]">
        단계에 마우스를 올리거나 눌러 보면 준비할 것과 주의할 점이 나와요.
      </p>

      <ol ref={listRef} className="relative mt-5 flex" aria-label="민사 절차 단계">
        {steps.map((s, i) => {
          const isOpen = open?.index === i;
          const recommended = s.key === recommendedKey;
          const popId = `${baseId}-pop-${i}`;
          const align =
            i <= 1
              ? "lg:left-0"
              : i >= steps.length - 2
                ? "lg:right-0"
                : "lg:left-1/2 lg:-translate-x-1/2";
          return (
            <li
              key={s.key}
              className="flex min-w-0 flex-1 basis-0 flex-col items-center lg:relative"
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse" && !open?.pinned)
                  setOpen({ index: i, pinned: false });
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse" && open?.index === i && !open.pinned) setOpen(null);
              }}
              onBlur={(e) => {
                if (
                  !e.currentTarget.contains(e.relatedTarget as Node | null) &&
                  open?.index === i
                ) {
                  setOpen(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && isOpen) {
                  e.stopPropagation();
                  close(true);
                }
              }}
            >
              {/* 노드 사이 직선 */}
              <span
                aria-hidden="true"
                className="relative flex h-7 w-full items-center justify-center"
              >
                {i > 0 && <span className="bg-gold-line absolute top-1/2 left-0 h-px w-1/2" />}
                {i < steps.length - 1 && (
                  <span className="bg-gold-line absolute top-1/2 right-0 h-px w-1/2" />
                )}
              </span>
              <button
                ref={(el) => {
                  nodeRefs.current[i] = el;
                }}
                type="button"
                aria-expanded={isOpen}
                aria-controls={popId}
                aria-describedby={isOpen ? popId : undefined}
                onFocus={() => {
                  if (returningFocus.current) return;
                  setOpen((o) => (o?.index === i ? o : { index: i, pinned: true }));
                }}
                onClick={() => setOpen({ index: i, pinned: true })}
                className="group -mt-7 flex min-h-11 w-full flex-col items-center gap-1.5 px-0.5 text-center"
              >
                <span
                  className={`relative z-[1] flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${
                    recommended
                      ? "border-ink bg-ink text-white"
                      : "border-gold text-gold group-hover:bg-honey bg-white"
                  } ${isOpen ? "ring-gold-line ring-4" : ""}`}
                >
                  {i + 1}
                </span>
                <span className="text-ink text-[11px] leading-tight font-semibold [overflow-wrap:anywhere] break-keep lg:text-sm lg:leading-snug">
                  {s.label}
                </span>
                {/* 좁은 화면은 색 점 + 범례, 넓은 화면은 라벨. 라벨 글자는 화면 읽기 프로그램에 항상 남긴다 */}
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full lg:hidden ${DOT[s.difficulty]}`}
                />
                <span
                  className={`sr-only lg:not-sr-only lg:rounded-[6px] lg:px-1.5 lg:py-0.5 lg:text-xs ${CHIP[s.difficulty]}`}
                >
                  {difficultyLabel(s)}
                </span>
                {recommended && <span className="sr-only">(먼저 추천하는 단계)</span>}
              </button>

              <div
                id={popId}
                role="group"
                aria-label={`${s.label} 준비할 것과 주의할 점`}
                hidden={!isOpen}
                className={`rounded-card border-line absolute top-full right-0 left-0 z-10 mt-2 border bg-white p-4 text-left shadow-[0_8px_24px_rgba(26,34,51,0.12)] lg:right-auto lg:w-[300px] ${align}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-ink text-base font-bold">
                    {i + 1}. {s.label}
                  </p>
                  <span className="text-muted shrink-0 text-xs">{difficultyLabel(s)}</span>
                </div>
                <p className="text-ink mt-3 text-[13px] font-semibold">준비할 것</p>
                <ul className="text-ink mt-1 list-disc pl-5 text-sm leading-relaxed">
                  {s.prepare.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="text-ink mt-3 text-[13px] font-semibold">주의할 점</p>
                <ul className="text-muted mt-1 list-disc pl-5 text-sm leading-relaxed">
                  {s.cautions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-x-3">
                  {s.links.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-link inline-flex min-h-11 items-center text-[13px] underline-offset-2 hover:underline"
                    >
                      {l.label} →
                    </a>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {onAskStep && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(null);
                        onAskStep(s.question);
                      }}
                      className="rounded-button bg-ink min-h-11 px-3.5 text-sm font-semibold text-white"
                    >
                      이 단계 질문하기
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => close(true)}
                    className="text-muted min-h-11 px-2 text-sm"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p
        aria-hidden="true"
        className="text-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] lg:hidden"
      >
        {(["self", "depends", "expert"] as const).map((d) => (
          <span key={d} className="inline-flex items-center gap-1">
            <span className={`size-2 rounded-full ${DOT[d]}`} />
            {DIFFICULTY_LABEL[d]}
          </span>
        ))}
      </p>
    </section>
  );
}
