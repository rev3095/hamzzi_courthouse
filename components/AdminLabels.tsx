"use client";
// 관리자 모드: AI 절차 분류 라벨 검토 (DEC-037). 승인한 것만 사용자 화면에 나간다.
// 라벨에는 질문 문장이 없다 — 낱말·절차 이름·단계 문구만 보인다.
import { useCallback, useEffect, useState } from "react";
import type { LabelStatus, ProcedureLabel } from "@/lib/procedure/labels";
import { DIFFICULTY_LABEL } from "@/lib/procedure/steps";
import { useQuota } from "./useQuota";

const STATUS_TEXT: Record<LabelStatus, string> = {
  pending: "검토 전",
  approved: "사용 중",
  rejected: "거절",
};

export function AdminLabels() {
  const quota = useQuota();
  const [labels, setLabels] = useState<ProcedureLabel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/procedure-labels").catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok && Array.isArray(body?.data)) {
      setLabels(body.data);
      setFailed(false);
    } else setFailed(true);
  }, []);

  useEffect(() => {
    if (!quota?.admin) return;
    let live = true;
    void (async () => {
      const res = await fetch("/api/v1/admin/procedure-labels").catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!live) return;
      if (res?.ok && Array.isArray(body?.data)) setLabels(body.data);
      else setFailed(true);
    })();
    return () => {
      live = false;
    };
  }, [quota?.admin]);

  if (!quota?.admin) return null;

  async function review(id: string, status: LabelStatus) {
    setBusy(id);
    await fetch(`/api/v1/admin/procedure-labels/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    await load();
  }

  return (
    <section className="border-line mt-8 border-t pt-6">
      <h2 className="text-ink text-[17px] font-bold">AI 절차 분류 라벨</h2>
      <p className="text-muted mt-1 text-[13px] leading-relaxed">
        규칙이 절차를 정하지 못한 질문을 AI가 분류한 결과예요. 같은 낱말의 질문이 다시 오면 AI를
        부르지 않고 이 라벨을 써요. 새로 만든 단계는 승인해야 사용자에게 보여요.
      </p>
      {failed && (
        <p role="alert" className="text-warn-text mt-3 text-sm">
          라벨을 불러오지 못했어요. DB 마이그레이션이 적용됐는지 확인해 주세요.
        </p>
      )}
      {labels?.length === 0 && <p className="text-muted mt-3 text-sm">아직 라벨이 없어요.</p>}
      <ul className="mt-3 flex flex-col gap-3">
        {labels?.map((l) => (
          <li key={l.id} className="rounded-card border-line border px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <strong className="text-ink text-[15px]">{l.title}</strong>
              <span className="bg-cream text-label rounded-[6px] px-2 py-0.5 text-xs font-semibold">
                {STATUS_TEXT[l.status]}
              </span>
              <span className="text-muted text-xs">사용 {l.hits}회</span>
            </div>
            <p className="text-muted mt-1 text-[13px]">
              낱말: {l.keywords.join(" · ")}
              {l.track && ` → 기존 절차(${l.track})`}
            </p>
            {l.steps && l.steps.length > 0 && (
              <ol className="text-ink mt-2 list-decimal pl-5 text-[13px] leading-relaxed">
                {l.steps.map((s) => (
                  <li key={s.label}>
                    {s.label} <span className="text-muted">({DIFFICULTY_LABEL[s.difficulty]})</span>
                    {[...s.prepare, ...s.cautions].map((t) => (
                      <span key={t} className="text-muted block">
                        {t}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-3 flex gap-2">
              {l.status !== "approved" && (l.track || (l.steps?.length ?? 0) > 0) && (
                <button
                  type="button"
                  disabled={busy === l.id}
                  onClick={() => void review(l.id, "approved")}
                  className="rounded-button bg-ink min-h-11 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  승인
                </button>
              )}
              {l.status !== "rejected" && (
                <button
                  type="button"
                  disabled={busy === l.id}
                  onClick={() => void review(l.id, "rejected")}
                  className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-sm disabled:opacity-60"
                >
                  거절
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
