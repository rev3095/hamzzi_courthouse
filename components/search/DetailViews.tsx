"use client";
// 판례 상세 /cases/[id] (F-003 AC3) · 조문 /statutes/[id] (F-004). 법제처에서 가져온 내용만 보여 준다.
// 없으면 "찾을 수 없음" — 대체 내용을 만들지 않는다 (API.md 3절 NOT_FOUND).
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCaseDetail,
  getStatute,
  type ApiResult,
  type CaseDetailView,
  type StatuteView,
} from "@/lib/client/api";
import { dotDate } from "../result/labels";
import { OriginalLink, SearchCredit, SearchNotice, searchErrorText } from "./parts";

function useLoad<T>(key: string, load: () => Promise<ApiResult<T>>) {
  const [state, setState] = useState<{ key: string; r: ApiResult<T> } | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((r) => alive && setState({ key, r }));
    return () => {
      alive = false;
    };
    // key가 바뀔 때만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.r : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 lg:py-12">
      <Link href="/search" className="text-link text-sm underline-offset-2 hover:underline">
        ← 판례 검색
      </Link>
      <article className="rounded-panel border-line mt-4 border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
        {children}
      </article>
      <SearchCredit />
    </div>
  );
}

export function CaseRoute() {
  const { id } = useParams<{ id: string }>();
  const r = useLoad(id, () => getCaseDetail(id));
  if (!r)
    return (
      <Shell>
        <p aria-live="polite" className="text-muted">
          법제처에서 판례를 불러오고 있어요…
        </p>
      </Shell>
    );
  if (!r.ok)
    return (
      <Shell>
        <p role="alert" className="text-warn-text">
          {searchErrorText(r.error)}
        </p>
      </Shell>
    );
  const c: CaseDetailView = r.data;
  return (
    <Shell>
      <SearchNotice notice={c.notice} />
      <h1 className="font-display text-ink mt-4 text-[24px] leading-snug font-bold">
        {c.caseName || c.caseNo}
      </h1>
      <p className="text-muted mt-1 text-sm">
        {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
      </p>
      {c.fromBody && (
        <p className="bg-soft text-muted mt-3 w-fit rounded-[6px] px-2 py-0.5 text-xs">
          판시사항·요지가 없어 개인정보를 가린 본문 일부를 보여 드려요
        </p>
      )}
      {c.sections.map((s) => (
        <section key={s.section} className="mt-6">
          <h2 className="font-display text-ink text-lg font-bold">{s.section}</h2>
          <p className="text-ink mt-2 text-[15px] leading-[1.8] whitespace-pre-line">{s.text}</p>
        </section>
      ))}
      {c.citedStatutes.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-ink text-lg font-bold">참조조문</h2>
          <p className="text-muted mt-1 text-[13px]">
            누르면 법제처 현행 조문과, 선고일에 그 조문이 시행 중이었는지를 함께 보여 드려요.
            구법·부칙 표기는 현행 조문과 다를 수 있어 링크를 달지 않았어요.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {c.citedStatutes.map((s) => (
              <li key={s.id ?? s.raw}>
                {s.id ? (
                  <Link
                    href={`/statutes/${encodeURIComponent(s.id)}${c.decidedAt ? `?asOf=${c.decidedAt}` : ""}`}
                    className="border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm"
                  >
                    {s.raw}
                  </Link>
                ) : (
                  <span className="bg-soft text-muted flex min-h-11 items-center rounded-full px-4 text-sm">
                    {s.raw}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-4">
        <OriginalLink url={c.sourceUrl} label="법제처에서 판결 원문 보기 →" />
      </div>
    </Shell>
  );
}

export function StatuteRoute() {
  const { id } = useParams<{ id: string }>();
  // 판례 상세에서 오면 ?asOf=선고일 — 판결 당시 시행 여부를 처음부터 함께 보여 준다 (F-004 AC1)
  const fromCase = useSearchParams().get("asOf") ?? "";
  const [asOf, setAsOf] = useState(fromCase);
  const [applied, setApplied] = useState(fromCase);
  const r = useLoad(`${id}|${applied}`, () =>
    getStatute(decodeURIComponent(id), applied || undefined),
  );
  if (!r)
    return (
      <Shell>
        <p aria-live="polite" className="text-muted">
          법제처에서 조문을 불러오고 있어요…
        </p>
      </Shell>
    );
  if (!r.ok)
    return (
      <Shell>
        <p role="alert" className="text-warn-text">
          {searchErrorText(r.error)}
        </p>
      </Shell>
    );
  const s: StatuteView = r.data;
  return (
    <Shell>
      <SearchNotice notice={s.notice} />
      <h1 className="font-display text-ink mt-4 text-[24px] leading-snug font-bold">
        {s.lawName} {s.articleNo}
        {s.articleTitle && ` (${s.articleTitle})`}
      </h1>
      <p className="text-muted mt-1 text-sm">
        {s.effectiveFrom && `시행 ${dotDate(s.effectiveFrom)} · `}
        {s.isCurrent ? "현재 시행 중" : "시행 예정"}
      </p>
      <p className="text-ink mt-5 text-[15px] leading-[1.8] whitespace-pre-line">{s.body}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(asOf);
        }}
        className="rounded-card bg-soft mt-6 flex flex-wrap items-end gap-2 p-4"
      >
        <label className="text-muted flex flex-col text-[13px]">
          이 날짜에 시행 중이던 조문인지 보기
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-button border-line text-ink mt-1 min-h-11 border bg-white px-3 text-[15px]"
          />
        </label>
        <button
          type="submit"
          className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-sm"
        >
          확인
        </button>
      </form>
      {s.asOf && (
        <p className="text-muted mt-3 text-sm leading-relaxed">
          {s.versionAtDate
            ? `${dotDate(s.asOf)}에도 위 조문이 시행 중이었어요 (시행 ${dotDate(s.effectiveFrom)}).`
            : s.asOfNote}
        </p>
      )}
      <div className="mt-4">
        <OriginalLink url={s.sourceUrl} />
      </div>
    </Shell>
  );
}
