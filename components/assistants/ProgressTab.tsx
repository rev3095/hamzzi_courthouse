"use client";
// 전문 에이전트 '진행 과정' 탭 (F-018 + F-014 절차 안내, 2026-11-26 사용자 요청).
// 그 에이전트가 다루는 분야(agents.ts sections)의 절차 타임라인을 한 줄 흐름 + 표로 보여 준다.
// 일반 질문 결과의 절차 타임라인과 같은 고정 문안(lib/procedure의 TRACKS·LIFE_TRACKS)을 그대로 쓴다 — 모델을 부르지 않고,
// 기간·비용 숫자와 결과 판정이 없다(절대 규칙 2·3, 문안 검사는 lib/procedure/policy.test.ts). 난이도는 DEC-002의 라벨만 쓴다.
// '이 단계 물어보기'는 그 단계의 고정 질문을 대화 탭 질문창에 넣기만 한다(보내기는 사용자가 누른다).
import { useState } from "react";
import type { Assistant } from "@/lib/assistants/agents";
import { LIFE_TRACKS, type LifeTrackKey } from "@/lib/procedure/life-tracks";
import {
  DIFFICULTY_LABEL,
  PROCEDURE_NOTICE,
  TRACKS,
  type ProcedureStep,
  type TrackKey,
} from "@/lib/procedure/steps";

type AnyTrack = {
  key: string;
  title: string;
  steps: ProcedureStep[];
  recommended: string;
  reason: string;
  note?: string;
};

function tracksOf(a: Assistant): AnyTrack[] {
  return a.sections
    .map((s): AnyTrack | undefined =>
      s in TRACKS ? TRACKS[s as TrackKey] : LIFE_TRACKS[s as LifeTrackKey],
    )
    .filter((t): t is AnyTrack => t !== undefined);
}

export function ProgressTab({ a, onAsk }: { a: Assistant; onAsk: (question: string) => void }) {
  const tracks = tracksOf(a);
  const [at, setAt] = useState(0);
  const track = tracks[at];
  if (!track) return null;

  return (
    <section aria-labelledby={`hza-progress-${a.id}`} className="mt-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id={`hza-progress-${a.id}`} className="hza-title text-[20px] font-bold">
          진행 과정
        </h2>
        <span className="hza-notice mt-0">{PROCEDURE_NOTICE}</span>
      </div>
      <p className="hza-muted mt-2 max-w-[640px] text-[15px] leading-[1.75]">
        분야를 고르면 보통 어떤 순서로 진행하는지 볼 수 있어요. 사건마다 순서와 필요한 단계가 다를
        수 있어요.
      </p>

      {tracks.length > 1 && (
        <div role="radiogroup" aria-label="분야 고르기" className="mt-5 flex flex-wrap gap-2">
          {tracks.map((t, i) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={i === at}
              onClick={() => setAt(i)}
              className="hza-pick"
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* 한 줄 흐름 */}
      <ol className="hza-card hza-flow mt-5" aria-label={`${track.title} 흐름`}>
        {track.steps.map((s, i) => (
          <li key={s.key}>
            <span className="hza-step-no" aria-hidden="true">
              {i + 1}
            </span>
            <span className="text-[14px] leading-snug font-semibold">{s.label}</span>
          </li>
        ))}
      </ol>

      {/* 단계 표: 좁은 화면에서는 단계마다 한 묶음으로 쌓인다 */}
      <div className="hza-card mt-4 overflow-hidden">
        <table className="hza-table">
          <caption className="sr-only">{track.title} 단계별 준비할 것과 주의할 점</caption>
          <thead>
            <tr>
              <th scope="col">단계</th>
              <th scope="col">준비할 것</th>
              <th scope="col">주의할 점</th>
            </tr>
          </thead>
          <tbody>
            {track.steps.map((s, i) => (
              <tr key={s.key}>
                <th scope="row">
                  <span className="flex items-start gap-2.5">
                    <span className="hza-step-no" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] leading-snug font-bold">{s.label}</span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        <span className="hza-badge">{DIFFICULTY_LABEL[s.difficulty]}</span>
                        {s.key === track.recommended && (
                          <span className="hza-case-kind">먼저 살펴볼 단계</span>
                        )}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="hza-link mt-3 block min-h-9 text-left text-[13px] font-semibold"
                    onClick={() => onAsk(s.question)}
                  >
                    이 단계 물어보기
                  </button>
                </th>
                <td data-label="준비할 것">
                  <ul>
                    {s.prepare.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </td>
                <td data-label="주의할 점">
                  <ul>
                    {s.cautions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  {s.links.length > 0 && (
                    <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                      {s.links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hza-link"
                        >
                          {l.label}
                        </a>
                      ))}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hza-muted mt-4 space-y-1.5 text-[14px] leading-[1.75]">
        {/* 분야만 고른 화면이라 질문을 분류한 뒤에 쓰는 문장(track.reason)은 싣지 않는다 */}
        <p>
          &apos;먼저 살펴볼 단계&apos;는 규칙에 따라 고른 안내이며 사건 결과를 판단한 것이 아니에요.
        </p>
        {track.note && <p>{track.note}</p>}
      </div>
    </section>
  );
}
