"use client";
// 조문 시점 비교·개정 이력 (DEC-072 ⓔ): 두 날짜에 시행 중이던 같은 번호 조문을 줄 단위로 나란히 보고,
// 법제처 조문 개정 이력에서 날짜를 골라 그 개정 전후를 바로 비교한다. 법제처 값만 쓰고 AI·영향 판단 없음.
// 개정 이력은 누를 때만 법제처에 묻는다.
import { useState } from "react";
import {
  compareStatute,
  getStatuteHistory,
  type ArticleRevisionView,
  type ClientError,
  type StatuteCompareView,
} from "@/lib/client/api";
import { dayBefore } from "@/lib/search/article-time";
import { dotDate } from "../result/labels";
import { searchErrorText } from "./parts";

const field = "rounded-button border-line text-ink mt-1 min-h-11 border bg-white px-3 text-[15px]";
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

type Res<T> = { ok: true; data: T } | { ok: false; error: ClientError };

function Diff({ c }: { c: StatuteCompareView }) {
  if (!c.diff) return null;
  if (c.same)
    return (
      <p className="text-muted mt-3 text-sm">
        법제처 자료 기준으로 두 날짜의 조문 글은 같아요
        {c.sameVersion ? " (같은 시행 버전)" : ""}.
      </p>
    );
  return (
    <div className="mt-3 text-[15px] leading-[1.8] whitespace-pre-line">
      <p className="text-muted mb-2 text-sm">
        줄 그은 부분은 앞 날짜에만 있던 내용, 바탕색이 있는 부분은 뒤 날짜에 들어온 내용이에요.
      </p>
      {c.diff.map((p, i) =>
        p.type === "same" ? (
          <p key={i} className="text-ink">
            {p.text}
          </p>
        ) : p.type === "removed" ? (
          <p key={i} className="text-muted line-through">
            <span className="sr-only">앞 날짜에만 있던 내용: </span>
            {p.text}
          </p>
        ) : (
          <p key={i} className="bg-cream text-ink rounded-[4px] px-1">
            <span className="sr-only">뒤 날짜에 들어온 내용: </span>
            {p.text}
          </p>
        ),
      )}
    </div>
  );
}

function SideNote({ side }: { side: StatuteCompareView["from"] }) {
  const v = side.version;
  return (
    <p className="text-muted text-[13px] leading-relaxed">
      <span className="text-ink font-semibold">{dotDate(side.date)}</span>{" "}
      {side.found
        ? [
            side.articleTitle && `(${side.articleTitle})`,
            v?.effectiveFrom && `시행 ${dotDate(v.effectiveFrom)}`,
            v?.revisionType,
          ]
            .filter(Boolean)
            .join(" · ")
        : side.note}
    </p>
  );
}

export function StatuteTime({ id, initialFrom }: { id: string; initialFrom?: string }) {
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(todayKst());
  const [cmp, setCmp] = useState<Res<StatuteCompareView> | "loading" | null>(null);
  const [hist, setHist] = useState<Res<{ items: ArticleRevisionView[] }> | "loading" | null>(null);

  const run = async (a: string, b: string) => {
    setFrom(a);
    setTo(b);
    setCmp("loading");
    setCmp(await compareStatute(id, a, b));
  };
  const loadHistory = async () => {
    setHist("loading");
    setHist(await getStatuteHistory(id));
  };

  return (
    <section className="border-line mt-8 border-t pt-6" aria-label="조문 시점 비교">
      <h2 className="font-display text-ink text-lg font-bold">두 날짜의 조문 비교</h2>
      <p className="text-muted mt-1 text-[13px] leading-relaxed">
        두 날짜에 시행 중이던 이 조문을 법제처 연혁에서 가져와 줄 단위로 비교해요. 개정 이력에서
        날짜를 골라도 돼요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (from && to) void run(from, to);
        }}
        className="rounded-card bg-soft mt-3 flex flex-wrap items-end gap-2 p-4"
      >
        <label className="text-muted flex flex-col text-[13px]">
          앞 날짜
          <input
            type="date"
            aria-label="앞 날짜"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={field}
          />
        </label>
        <label className="text-muted flex flex-col text-[13px]">
          뒤 날짜
          <input
            type="date"
            aria-label="뒤 날짜"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={field}
          />
        </label>
        <button
          type="submit"
          disabled={!from || !to || from >= to || cmp === "loading"}
          className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-sm disabled:opacity-50"
        >
          비교
        </button>
      </form>
      {from && to && from >= to && (
        <p className="text-muted mt-2 text-[13px]">앞 날짜가 뒤 날짜보다 빨라야 해요.</p>
      )}
      {cmp === "loading" && (
        <p aria-live="polite" className="text-muted mt-3 text-sm">
          법제처 연혁에서 두 날짜의 조문을 불러오고 있어요…
        </p>
      )}
      {cmp && cmp !== "loading" && !cmp.ok && (
        <p role="alert" className="text-warn-text mt-3 text-sm">
          {searchErrorText(cmp.error)}
        </p>
      )}
      {cmp && cmp !== "loading" && cmp.ok && (
        <div className="mt-3" data-testid="compare-result">
          <SideNote side={cmp.data.from} />
          <SideNote side={cmp.data.to} />
          <Diff c={cmp.data} />
        </div>
      )}

      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-ink text-base font-bold">이 조문의 개정 이력</h3>
          {hist === null && (
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="text-link min-h-11 text-sm font-semibold underline-offset-2 hover:underline"
            >
              법제처에서 불러오기
            </button>
          )}
        </div>
        {hist === "loading" && (
          <p aria-live="polite" className="text-muted mt-2 text-sm">
            법제처에서 개정 이력을 불러오고 있어요…
          </p>
        )}
        {hist && hist !== "loading" && !hist.ok && (
          <p role="alert" className="text-warn-text mt-2 text-sm">
            {searchErrorText(hist.error)}
          </p>
        )}
        {hist && hist !== "loading" && hist.ok && (
          <>
            {hist.data.items.length === 0 ? (
              <p className="text-muted mt-2 text-sm">
                법제처에서 이 조문의 개정 이력을 찾지 못했어요.
              </p>
            ) : (
              <ol className="mt-2 grid gap-2" aria-label="개정 이력">
                {hist.data.items.map((r, i) => (
                  <li
                    key={`${r.mst}-${r.effectiveFrom}-${i}`}
                    className="border-line flex flex-wrap items-center justify-between gap-2 rounded-[8px] border bg-white px-4 py-2.5"
                  >
                    <span className="text-ink text-sm">
                      <span className="font-semibold">
                        {r.effectiveFrom ? `시행 ${dotDate(r.effectiveFrom)}` : "시행일 없음"}
                      </span>
                      <span className="text-muted">
                        {" "}
                        {[
                          r.revisionType,
                          r.changeReason,
                          r.promulgatedAt && `공포 ${dotDate(r.promulgatedAt)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {r.effectiveFrom && (
                      <button
                        type="button"
                        onClick={() => void run(dayBefore(r.effectiveFrom!), r.effectiveFrom!)}
                        className="text-link min-h-11 text-sm underline-offset-2 hover:underline"
                      >
                        이 개정 전후 비교
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <p className="text-muted mt-2 text-[12px]">
              법제처 조문 개정 이력의 날짜·개정 구분·변경 사유를 그대로 옮겼어요.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
