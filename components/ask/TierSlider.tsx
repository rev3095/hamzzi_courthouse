"use client";
// 답변 모드 선택 (DEC-032): 질문창 아래 3단 슬라이더. 원형 손잡이를 끌거나 단계 이름을 눌러 고른다.
// 실제 조작은 보이지 않는 range 입력이 맡는다 — 키보드(←→)·터치·화면 낭독기가 그대로 동작한다.
// 설명 문구는 답변 방식의 사실만 적는다. 정확도·유불리를 약속하지 않는다 (절대 규칙 2).
import { useId } from "react";
import { TIER_IDS, type TierId } from "@/lib/ai/models";
import { useTier, writeTier } from "@/lib/client/tier";
import { useQuota } from "../useQuota";

export const TIER_TEXT: Record<TierId, { name: string; model: string; hint: string }> = {
  light: { name: "Light", model: "Haiku", hint: "가장 빠른 모델" },
  pro: { name: "Pro", model: "Sonnet", hint: "기본 모델" },
  max: { name: "Pro Max", model: "Opus", hint: "답하기 전에 더 오래 생각하는 모델" },
};

export function TierSlider() {
  const id = useId();
  const tier = useTier();
  const quota = useQuota();
  // 서버가 무료 모드(AI 답변 꺼짐)면 고를 것이 없다
  if (quota?.ai === false) return null;

  const index = TIER_IDS.indexOf(tier);
  const text = TIER_TEXT[tier];
  // 손잡이 중심이 트랙 양 끝 안쪽에 오도록 (손잡이 지름 24px)
  const left = `calc(12px + (100% - 24px) * ${index / (TIER_IDS.length - 1)})`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 pb-1.5">
      <label htmlFor={id} className="text-muted text-[13px] font-semibold">
        답변 모드
      </label>
      <div className="w-[168px] shrink-0">
        <div className="relative h-7">
          <input
            id={id}
            type="range"
            min={0}
            max={TIER_IDS.length - 1}
            step={1}
            value={index}
            onChange={(e) => writeTier(TIER_IDS[Number(e.target.value)])}
            aria-valuetext={`${text.name} (${text.model})`}
            className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <div className="bg-line absolute top-1/2 right-3 left-3 h-1 -translate-y-1/2 rounded-full" />
          <div
            className="bg-gold absolute top-1/2 left-3 h-1 -translate-y-1/2 rounded-full transition-[width] duration-200"
            style={{ width: `calc((100% - 24px) * ${index / (TIER_IDS.length - 1)})` }}
          />
          {TIER_IDS.map((t, i) => (
            <span
              key={t}
              aria-hidden="true"
              className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white ${
                i <= index ? "border-gold" : "border-line"
              }`}
              style={{ left: `calc(12px + (100% - 24px) * ${i / (TIER_IDS.length - 1)})` }}
            />
          ))}
          <span
            aria-hidden="true"
            className="bg-ink peer-focus-visible:outline-gold absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_var(--line),0_2px_6px_rgba(26,34,51,0.25)] transition-[left] duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
            style={{ left }}
          />
        </div>
        <div className="flex justify-between">
          {TIER_IDS.map((t) => (
            <button
              key={t}
              type="button"
              tabIndex={-1}
              onClick={() => writeTier(t)}
              className={`min-h-6 px-0.5 text-[12px] ${
                t === tier ? "text-ink font-bold" : "text-muted"
              }`}
            >
              {TIER_TEXT[t].name}
            </button>
          ))}
        </div>
      </div>
      <p className="text-muted min-w-0 flex-1 text-[13px] leading-snug" aria-live="polite">
        <span className="text-ink font-semibold">{text.model}</span> · {text.hint}
        <span className="text-muted"> · 데모에서는 어느 모드든 무료예요</span>
      </p>
    </div>
  );
}
