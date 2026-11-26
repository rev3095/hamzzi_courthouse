"use client";
// 전문 에이전트 '진행 과정' 탭 (F-018 + F-014 절차 안내, 2026-11-26 사용자 요청).
// 일반 질문 결과와 **같은 절차 타임라인 부품**(components/result/ProcedureTimeline)을 쓴다:
//   번호 마일스톤 → 커서를 올리거나 누르면 그 단계의 준비할 것·주의할 점·공식 창구 → '이 단계 서식 작성하기'(/documents/{kind},
//   설문으로 칸을 채우면 서식이 완성되고 한글·워드·PDF로 내려받는다, DEC-022·055) → '이 단계 질문하기'.
// 분야는 그 에이전트의 sections에서 고르고, 문안은 lib/procedure의 TRACKS·LIFE_TRACKS 고정 문안이다 — 모델을 부르지 않고
// 기간·비용 숫자와 결과 판정이 없다(절대 규칙 2·3, 문안 검사는 lib/procedure/policy.test.ts).
// 이 탭에서 대화한 질문이 있으면 그 번호를 서식 화면에 넘겨(?from=) 사연으로 초안을 채우는 도우미(DEC-023)를 쓸 수 있게 한다.
// 서식은 공식 서식이 준비된 단계에만 붙는다 — 서식이 없는 단계에 다른 분야의 서식을 대신 잇지 않는다.
import Link from "next/link";
import { useState } from "react";
import { ProcedureTimeline } from "@/components/result/ProcedureTimeline";
import type { Assistant } from "@/lib/assistants/agents";
import { LIFE_TRACKS, type LifeTrackKey } from "@/lib/procedure/life-tracks";
import {
  DIFFICULTY_LABEL,
  PROCEDURE_NOTICE,
  TRACKS,
  type ProcedureStep,
  type TrackKey,
} from "@/lib/procedure/steps";
import { loadThread } from "./AssistantChat";

type AnyTrack = {
  key: string;
  section: string;
  title: string;
  steps: ProcedureStep[];
  recommended: string;
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
  // 이 탭(브라우저)에서 이 에이전트와 나눈 마지막 질문 번호 — 서식 화면의 초안 도우미로 넘긴다. 없으면 설문만 쓴다
  const [inquiryId] = useState(() => loadThread(a.id).at(-1)?.id);
  const track = tracks[at];
  if (!track) return null;
  const withForm = track.steps.filter((s) => s.document);
  const from = inquiryId ? `?from=${encodeURIComponent(inquiryId)}` : "";

  return (
    <section aria-label="진행 과정" className="mt-8">
      <p className="hza-muted max-w-[660px] text-[15px] leading-[1.75]">
        분야를 고르고 단계에 커서를 올리거나 눌러 보세요. 준비할 것과 주의할 점, 서식 작성으로
        이어져요. 사건마다 순서와 필요한 단계가 다를 수 있어요.
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

      {/* 마일스톤 타임라인 (일반 답변과 같은 부품). 분야를 바꾸면 열려 있던 팝업을 닫게 key를 준다 */}
      <div className="hza-card hza-timeline mt-5 px-4 pt-5 pb-6 sm:px-6">
        <ProcedureTimeline
          key={track.key}
          section={track.section}
          title={track.title}
          steps={track.steps}
          recommendedKey={track.recommended}
          onAskStep={onAsk}
          inquiryId={inquiryId}
        />
        <p className="hza-muted mt-5 text-[13px] leading-[1.75]">
          진하게 표시한 단계는 규칙에 따라 고른 &apos;먼저 살펴볼 단계&apos;이며 사건 결과를 판단한
          것이 아니에요.
        </p>
        {track.note && <p className="hza-muted mt-1 text-[13px] leading-[1.75]">{track.note}</p>}
      </div>

      {/* 서식 작성: 공식 서식이 준비된 단계만 */}
      <div className="mt-8">
        <h3 className="hza-title text-[17px] font-bold">서식 작성</h3>
        {withForm.length > 0 ? (
          <>
            <p className="hza-muted mt-1.5 text-[14px] leading-[1.75]">
              {inquiryId
                ? "설문에 답하면 서식 칸이 채워져요. 이 에이전트와 나눈 마지막 질문의 사연으로 초안을 채우는 AI 도우미도 쓸 수 있어요."
                : "설문에 답하면 서식 칸이 채워져요. 대화 탭에서 먼저 질문하면 그 사연으로 초안을 채우는 AI 도우미도 쓸 수 있어요."}{" "}
              완성한 서식은 한글·워드·PDF로 내려받아요.
            </p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {withForm.map((s) => (
                <li key={s.key}>
                  <Link
                    href={`/documents/${s.document}${from}`}
                    className="hza-chip flex h-full w-full items-center justify-between gap-3"
                  >
                    <span className="font-semibold">
                      <span className="hza-step-no mr-2.5" aria-hidden="true">
                        {track.steps.indexOf(s) + 1}
                      </span>
                      {s.label} 서식 쓰기
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hza-muted mt-1.5 text-[14px] leading-[1.75]">
            이 분야는 여기서 바로 쓸 수 있는 서식이 아직 없어요. 각 단계를 열면 나오는 공식 창구에서
            양식과 접수 방법을 확인할 수 있어요.
          </p>
        )}
      </div>

      {/* 같은 내용을 표로 */}
      <details className="hza-card hza-fold mt-8 px-5 sm:px-6">
        <summary>표로 한눈에 보기</summary>
        <div className="-mx-5 border-t border-[var(--hza-line)] sm:-mx-6">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hza-muted py-4 text-[13px]">{PROCEDURE_NOTICE}</p>
      </details>
    </section>
  );
}
