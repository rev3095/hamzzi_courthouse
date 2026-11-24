"use client";
// 전문 에이전트 '아카이브' 탭 (F-018, DEC-057): 가상 사연으로 미리 만든 질답 세트(원고 7 : 피고 3).
// 한 세트 = 지금 상황·절차 단계 → 사건 구조 시각자료 → 민사 관점·형사 관점(검증된 문단) → 필요한 증거 → 서류 정리 단계 → 근거 답변 전체.
// 처음에는 요약만 보이고 '더보기'로 펼친다. '이 질문으로 체험하기'는 같은 질문을 대화로 보내고, 서버는 저장된 답을 재생한다(비용·횟수 0).
// 자료는 GET /api/v1/assistants/{id}/archive로 탭을 열 때 받는다(브라우저 묶음에 넣지 않는다).
import { useEffect, useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import type { AssistantId } from "@/lib/assistants/agents";
import type { ArchiveItem } from "@/lib/assistants/archive";
import { DOC_STAGE_LABEL, SIDE_LABEL, type ArchiveSide } from "@/lib/assistants/archive-scenarios";
import type { CheckedPoint, DemoAnalysisResult } from "@/lib/citations/policy";
import { call } from "@/lib/client/api";
import { sourceRef } from "@/components/result/labels";
import { DeepMapView } from "@/components/result/DeepMapView";

type Filter = "all" | ArchiveSide;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "plaintiff", label: "원고 쪽" },
  { key: "defendant", label: "피고 쪽" },
];

export function ArchiveTab({
  assistant,
  onTry,
}: {
  assistant: AssistantId;
  onTry: (question: string) => void;
}) {
  const [items, setItems] = useState<ArchiveItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    void call<{ items: ArchiveItem[] }>(`/api/v1/assistants/${assistant}/archive`).then((r) => {
      if (!alive) return;
      if (r.ok) setItems(r.data.items);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [assistant]);

  const shown = (items ?? []).filter((i) => filter === "all" || i.side === filter);

  return (
    <section aria-labelledby={`hza-archive-${assistant}`} className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={`hza-archive-${assistant}`}
            className="hza-title font-display text-[26px] font-bold"
          >
            아카이브
          </h2>
          <p className="hza-muted mt-1 max-w-[720px] text-[14px] leading-relaxed">
            가상 사연으로 미리 만든 질답 세트예요. 원고 쪽(청구·고소하는 쪽)과 피고 쪽(서류를 받은
            쪽)을 나눠, 지금 상황과 단계·민사와 형사 관점·필요한 증거·서류 정리 순서까지 담았어요.
            &apos;체험하기&apos;를 누르면 같은 질문으로 대화를 시작해요(질문 횟수에 들어가지
            않아요).
          </p>
          <p className="hza-notice">{AI_NOTICE} · 가상 사연으로 미리 만든 답변</p>
        </div>
        <div role="radiogroup" aria-label="입장 고르기" className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={filter === f.key}
              onClick={() => setFilter(f.key)}
              className="hza-tab min-h-10 px-4 text-[14px]"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {items === null && !failed && <p className="hza-muted mt-6">아카이브를 불러오는 중이에요…</p>}
      {failed && (
        <p className="hza-muted mt-6">아카이브를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
      )}
      {items !== null && shown.length === 0 && (
        <p className="hza-muted mt-6">아직 준비된 세트가 없어요.</p>
      )}

      <ul className="mt-6 space-y-5">
        {shown.map((item) => (
          <ArchiveCard key={item.id} item={item} onTry={onTry} />
        ))}
      </ul>
    </section>
  );
}

function ArchiveCard({ item, onTry }: { item: ArchiveItem; onTry: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const [allAnswer, setAllAnswer] = useState(false);
  const r = item.result;
  return (
    <li className="hza-card p-5 sm:p-6">
      <div className="flex flex-wrap gap-2">
        <span
          className="hza-case-kind"
          data-kind={item.side === "plaintiff" ? "precedent" : "fictional"}
        >
          {SIDE_LABEL[item.side]}
        </span>
        <span className="hza-badge">{DOC_STAGE_LABEL[item.stage]}</span>
        <span className="hza-badge">가상 사연</span>
        {/* 접힌 상태에서도 AI가 쓴 정리(지금 상황)가 보이므로 고지를 카드 머리에 단다 (절대 규칙 6) */}
        <span className="hza-notice mt-0">{AI_NOTICE}</span>
      </div>
      <h3 className="mt-3 text-[18px] leading-snug font-bold">{item.title}</h3>
      <p className={`hza-muted mt-2 text-[15px] leading-relaxed ${open ? "" : "line-clamp-3"}`}>
        “{item.question}”
      </p>
      {item.situation && (
        <p className={`mt-3 text-[15px] leading-relaxed ${open ? "" : "line-clamp-2"}`}>
          <span className="hza-accent-text font-bold">지금 상황 · </span>
          {item.situation}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="hza-chip font-semibold"
        >
          {open ? "접기" : "더보기 · 단계·시각자료·민사/형사·증거"}
        </button>
        <button
          type="button"
          className="hza-btn min-h-10 text-[14px]"
          onClick={() => onTry(item.question)}
        >
          이 질문으로 체험하기
        </button>
      </div>

      {open && (
        <div className="mt-6 space-y-7">
          {(item.steps.now || item.steps.next.length > 0) && (
            <Block title="절차상 지금 단계">
              {item.steps.now && (
                <p className="rounded-[10px] border border-[var(--hza-line)] px-4 py-3 text-[15px] leading-relaxed">
                  <span className="hza-accent-text font-bold">지금 · </span>
                  {item.steps.now}
                </p>
              )}
              {item.steps.next.length > 0 && (
                <ol className="mt-3 space-y-2">
                  {item.steps.next.map((s, i) => (
                    <li key={s} className="flex gap-3 text-[15px] leading-relaxed">
                      <span
                        aria-hidden="true"
                        className="hza-emblem mt-0.5 size-6 shrink-0 text-[12px] font-bold"
                      >
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Block>
          )}

          {r.deep && (
            <Block title="사건 구조 시각자료">
              <div className="text-ink rounded-[12px] bg-white p-2 sm:p-3">
                <DeepMapView result={r} />
              </div>
            </Block>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <SidePoints title="민사 관점" side={item.civil} result={r} />
            <SidePoints title="형사 관점" side={item.criminal} result={r} />
          </div>

          {item.evidence.length > 0 && (
            <Block title="필요한 증거">
              <ul className="space-y-2">
                {item.evidence.map((e) => (
                  <li
                    key={e.item}
                    className="flex flex-col gap-1 rounded-[10px] border border-[var(--hza-line)] px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <span className="hza-badge w-fit shrink-0">{e.status}</span>
                    <span className="text-[15px] leading-relaxed">
                      <span className="font-semibold">{e.item}</span>
                      <span className="hza-muted"> — {e.why}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {item.document.steps.length > 0 && (
            <Block title={item.document.title || "서류 정리 순서"}>
              <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">
                {item.document.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </Block>
          )}

          {r.answer.points.length > 0 && (
            <Block title="근거 답변">
              <Points
                points={allAnswer ? r.answer.points : r.answer.points.slice(0, 3)}
                result={r}
              />
              {r.answer.points.length > 3 && (
                <button
                  type="button"
                  onClick={() => setAllAnswer((v) => !v)}
                  className="hza-link mt-2 min-h-9 text-[14px]"
                >
                  {allAnswer ? "접기" : `근거 답변 ${r.answer.points.length - 3}개 더보기`}
                </button>
              )}
            </Block>
          )}

          <p className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="hza-notice mt-0">{r.aiNotice}</span>
            <span className="hza-muted">
              가상 사연으로 미리 만든 답변이에요 · 내 사건도 같은 결과가 나온다는 뜻이 아니에요 ·
              판단은 법원·수사기관이 해요
            </span>
          </p>
        </div>
      )}
    </li>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="hza-accent-text mb-2 text-[13px] font-bold tracking-[0.06em]">{title}</h4>
      {children}
    </div>
  );
}

function SidePoints({
  title,
  side,
  result,
}: {
  title: string;
  side: ArchiveItem["civil"];
  result: DemoAnalysisResult;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--hza-line)] p-4">
      <h4 className="hza-accent-text mb-2 text-[14px] font-bold">{title}</h4>
      {side.points.length > 0 ? (
        <Points points={side.points} result={result} />
      ) : (
        <p className="hza-muted text-[14px] leading-relaxed">
          {side.note ?? "이번 자료에서는 이 관점의 근거를 찾지 못했어요."}
        </p>
      )}
    </div>
  );
}

function Points({ points, result }: { points: CheckedPoint[]; result: DemoAnalysisResult }) {
  return (
    <ol>
      {points.map((p, i) => {
        // 법제처 근거 없이 모델이 쓴 문단(DEC-055)은 결과 화면처럼 출처 상자 없이 문단만 보인다
        if (p.check === "model")
          return (
            <li key={i} className="hza-point">
              <p>{p.text}</p>
            </li>
          );
        const ref = sourceRef(p.source, result);
        return (
          <li key={i} className="hza-point text-[15px] leading-relaxed">
            <p>{p.text}</p>
            <p className="hza-source">
              <span>출처 · {ref.label}</span>
              <span className="hza-badge">{p.check === "verified" ? "검증됨" : "확인 필요"}</span>
              {ref.url && (
                <a href={ref.url} target="_blank" rel="noreferrer" className="hza-link">
                  원문
                </a>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
