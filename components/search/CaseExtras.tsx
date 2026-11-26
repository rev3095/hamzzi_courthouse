"use client";
// 판례 상세 보강 (DEC-075 ⓑ): 보관함 담기 · 인용 표기 형식 골라 복사 · 참조판례 바로 가기 · 같은 조문이 나오는 판례.
// 모두 법제처가 준 값만 쓰고 AI를 부르지 않는다. 관련도·유불리 판단 없음 (PRD 8.3, 절대 규칙 2).
// 참조판례·같은 조문 판례는 누를 때만 법제처에 한 번 묻는다 (상세 화면을 열 때 늘어나는 호출 없음).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getStatuteCases,
  searchCases,
  type CaseDetailView,
  type CaseRef,
  type ClientError,
} from "@/lib/client/api";
import { caseNumbersIn } from "@/lib/citations/patterns";
import { CITATION_STYLES, caseCitation, type CitationStyle } from "@/lib/search/case-refs";
import { dotDate } from "../result/labels";
import { searchErrorText } from "./parts";
import { usePins } from "./recent";
import { isPinned, togglePin, type Row } from "./rows";

const chip =
  "border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm";

/** 보관함 담기 + 인용 표기 형식 골라 복사 */
export function CaseActions({ c }: { c: CaseDetailView }) {
  const pins = usePins();
  const row: Row = {
    kind: "cases",
    id: c.id,
    href: `/cases/${c.id}`,
    title: c.caseName || c.caseNo,
    org: c.court,
    date: c.decidedAt,
    refNo: c.caseNo,
    sourceUrl: c.sourceUrl,
  };
  const pinned = isPinned(pins, row);
  const [style, setStyle] = useState<CitationStyle>("standard");
  const [copied, setCopied] = useState(false);
  const text = caseCitation({ ...c, decisionType: c.decisionType ?? null }, style);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section aria-label="인용·보관" className="rounded-card bg-soft mt-5 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={pinned}
          onClick={() => togglePin(pins, row)}
          className={`rounded-button inline-flex min-h-11 items-center border px-4 text-sm font-semibold ${
            pinned ? "border-gold bg-honey text-ink" : "border-line text-ink bg-white"
          }`}
        >
          {pinned ? "보관함에서 빼기" : "보관함에 담기"}
        </button>
        <label className="text-muted flex items-center gap-2 text-[13px]">
          인용 표기
          <select
            aria-label="인용 표기 형식"
            value={style}
            onChange={(e) => setStyle(e.target.value as CitationStyle)}
            className="border-line text-ink min-h-11 rounded-[8px] border bg-white px-2 text-sm"
          >
            {CITATION_STYLES.map((s) => (
              <option key={s.style} value={s.style}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-link min-h-11 px-1 text-sm font-semibold underline-offset-2 hover:underline"
        >
          {copied ? "복사했어요" : "복사"}
        </button>
      </div>
      <p className="text-ink text-[14px]" data-testid="citation-preview">
        {text}
      </p>
      <p className="text-muted text-[12px]">
        법제처가 준 법원·선고일·사건번호·판결 유형·사건명을 이어 붙였어요. 제출하실 곳의 표기 방식을
        한 번 더 확인해 주세요.
      </p>
    </section>
  );
}

/** 참조판례: 누르면 그 사건번호로 법제처에서 찾아 상세로 간다 */
export function CitedCases({ items }: { items: { label: string; caseNo: string }[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ caseNo: string; msg: string } | null>(null);
  if (items.length === 0) return null;
  const open = async (caseNo: string) => {
    setState({ caseNo, msg: "법제처에서 찾고 있어요…" });
    const r = await searchCases(caseNo);
    if (!r.ok) {
      setState({ caseNo, msg: searchErrorText(r.error) });
      return;
    }
    // 법제처 사건번호가 "2009다12345, 12352"처럼 병합 표기일 수 있어 펼쳐서 비교한다
    const hit = r.data.items.find((x) => caseNumbersIn(x.caseNo).includes(caseNo));
    if (hit) router.push(`/cases/${hit.id}`);
    else
      setState({
        caseNo,
        msg: "법제처에서 이 사건번호의 판례를 찾지 못했어요. 공개되지 않은 판결일 수 있어요.",
      });
  };
  return (
    <section className="mt-6" aria-label="참조판례">
      <h2 className="font-display text-ink text-lg font-bold">참조판례</h2>
      <p className="text-muted mt-1 text-[13px]">
        이 판례가 참조한 판례예요(법제처 참조판례 항목). 누르면 그 판례를 법제처에서 찾아 열어요.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((c) => (
          <li key={c.caseNo}>
            <button type="button" onClick={() => void open(c.caseNo)} className={chip}>
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      {state && (
        <p aria-live="polite" className="text-muted mt-2 text-[13px]">
          {state.caseNo} · {state.msg}
        </p>
      )}
    </section>
  );
}

type Load = {
  id: string;
  r: { ok: true; items: CaseRef[]; note: string } | { ok: false; error: ClientError };
};

/** 같은 조문이 나오는 판례: 참조조문 하나를 고르면 그 조문이 본문에 나오는 판례를 법제처에서 찾는다 */
export function SameStatuteCases({
  selfId,
  statutes,
}: {
  selfId: string;
  statutes: { raw: string; id: string | null }[];
}) {
  const linked = statutes.filter((s): s is { raw: string; id: string } => !!s.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [load, setLoad] = useState<Load | null>(null);
  if (linked.length === 0) return null;
  const pick = async (id: string) => {
    setPicked(id);
    setLoad(null);
    const r = await getStatuteCases(id);
    setLoad({
      id,
      r: r.ok
        ? {
            ok: true,
            items: (r.data.items ?? []).filter((c) => c.id !== selfId),
            note: r.data.searchScopeNote,
          }
        : { ok: false, error: r.error },
    });
  };
  const shown = load && load.id === picked ? load.r : null;
  return (
    <section className="mt-6" aria-label="같은 조문이 나오는 판례">
      <h2 className="font-display text-ink text-lg font-bold">같은 조문이 나오는 판례</h2>
      <p className="text-muted mt-1 text-[13px]">
        참조조문을 고르면 그 조문이 본문에 나오는 다른 판례를 법제처에서 찾아요. 비슷하다는 판단이
        아니라 같은 조문이 적혀 있다는 뜻이에요.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {linked.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={picked === s.id}
              onClick={() => void pick(s.id)}
              className={`${chip} ${picked === s.id ? "border-gold bg-cream font-semibold" : ""}`}
            >
              {s.raw}
            </button>
          </li>
        ))}
      </ul>
      {picked && !shown && (
        <p aria-live="polite" className="text-muted mt-3 text-sm">
          법제처에서 판례를 찾고 있어요…
        </p>
      )}
      {shown && !shown.ok && (
        <p role="alert" className="text-warn-text mt-3 text-sm">
          {searchErrorText(shown.error)}
        </p>
      )}
      {shown?.ok && (
        <>
          <p className="text-muted mt-3 text-[12px] leading-relaxed">{shown.note}</p>
          {shown.items.length === 0 ? (
            <p className="text-muted mt-2 text-sm">다른 판례를 찾지 못했어요.</p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {shown.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/cases/${c.id}`}
                    className="rounded-card border-line hover:border-gold flex min-h-11 flex-col justify-center border bg-white px-4 py-2.5"
                  >
                    <span className="text-ink text-sm font-semibold">{c.caseName || c.caseNo}</span>
                    <span className="text-muted text-[12px]">
                      {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
