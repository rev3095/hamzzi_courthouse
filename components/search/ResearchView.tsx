"use client";
// 판례 리서치 /research (DEC-029 제안). 기존 /search와 같은 API를 쓰는 업무용 화면: 검색 → 목록 → 옆 미리보기 → 보관함.
// 목록에서 고른 자료의 요지를 화면을 떠나지 않고 읽고, 법원·기간·정렬로 걸러 보고, 담아 둔 자료의 인용 표기를 복사한다.
// 법제처가 준 값만 보여 주고 거르기·정렬만 한다 — 관련도 점수·유불리 판단을 만들지 않는다 (PRD 8.3, 절대 규칙 2).
// 검색어는 주소에 두지 않는다. 결과 화면·검색 화면에서 넘어올 때도 이 기기(sessionStorage)로만 건넨다 (F-007).
// 판례 아카이브(DEC-054): 위쪽 전환으로 검색(/search)과 오가고, 보관함은 검색 화면과 같다.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getCaseDetail,
  getDecision,
  getOrdinance,
  searchAdminRules,
  searchCases,
  searchCasesPage,
  searchDecisions,
  searchLaws,
  searchOrdinances,
  type ApiResult,
  type CaseFilterInput,
  type CaseRef,
  type ClientError,
} from "@/lib/client/api";
import { MAX_CASE_PAGE, isCourtName } from "@/lib/search/case-filter";
import { directTarget } from "@/lib/search/explore";
import { highlightTerms } from "@/lib/search/highlight";
import { dotDate } from "../result/labels";
import {
  Highlighted,
  OriginalLink,
  SearchCredit,
  SearchNotice,
  recallSearch,
  rememberSearch,
  searchErrorText,
} from "./parts";
import { ArchiveSwitch } from "./ArchiveSwitch";
import { AskArchive } from "./AskArchive";
import { KindTabs } from "./KindTabs";
import { clearPins, usePins, useRecent } from "./recent";
import { PAGE_TITLE } from "@/components/ui/styles";
import {
  DATE_WORD,
  KIND_LIST,
  LABEL,
  canPin,
  isKind,
  isPinned,
  togglePin,
  type Kind,
  type Row,
} from "./rows";

export { citationLine, type Row } from "./rows";

const KINDS = KIND_LIST;

type Sort = "source" | "newest" | "oldest";

/** 목록 거르기·정렬 (순수). 날짜가 없는 행은 기간 거르기에서 빠지고 정렬에서는 뒤로 간다 */
export function refine(
  rows: Row[],
  f: { orgs: string[]; from: string; to: string; sort: Sort },
): Row[] {
  const out = rows.filter((r) => {
    if (f.orgs.length > 0 && !(r.org && f.orgs.includes(r.org))) return false;
    const y = r.date?.slice(0, 4) ?? "";
    if (f.from && !(y && y >= f.from)) return false;
    if (f.to && !(y && y <= f.to)) return false;
    return true;
  });
  if (f.sort === "source") return out;
  const sign = f.sort === "newest" ? -1 : 1;
  return [...out].sort((a, b) => {
    if (!a.date || !b.date) return Number(!a.date) - Number(!b.date);
    return a.date < b.date ? -sign : a.date > b.date ? sign : 0;
  });
}

/** 판례 탭의 법제처 거르기·쪽 (개선안 A) */
type Paging = { total: number; page: number; pageSize: number; filter: CaseFilterInput };
type Found = { rows: Row[]; notice: string; note: string; paging?: Paging };

const caseRow = (c: CaseRef): Row => ({
  kind: "cases",
  id: c.id,
  href: `/cases/${c.id}?from=search`,
  title: c.caseName || c.caseNo,
  org: c.court,
  date: c.decidedAt,
  refNo: c.caseNo,
  sourceUrl: c.sourceUrl,
  caseType: c.caseType ?? null,
});

async function run(kind: Kind, q: string, filter: CaseFilterInput = {}): Promise<ApiResult<Found>> {
  // 판례(사건번호 바로 가기가 아니면): 법제처가 법원·기간·정렬을 걸러 준 한 쪽과 전체 건수를 받는다
  if (kind === "cases" && directTarget(q)?.kind !== "case") {
    const r = await searchCasesPage(q, filter);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        notice: r.data.notice,
        note: r.data.searchScopeNote,
        rows: r.data.items.map(caseRow),
        paging: {
          total: r.data.totalCount,
          page: r.data.page,
          pageSize: r.data.pageSize,
          filter,
        },
      },
    };
  }
  if (kind === "cases") {
    const r = await searchCases(q);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        notice: r.data.notice,
        note: r.data.searchScopeNote,
        rows: r.data.items.map((c) => ({
          kind,
          id: c.id,
          href: `/cases/${c.id}?from=search`,
          title: c.caseName || c.caseNo,
          org: c.court,
          date: c.decidedAt,
          refNo: c.caseNo,
          sourceUrl: c.sourceUrl,
        })),
      },
    };
  }
  if (kind === "laws") {
    const r = await searchLaws(q);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        notice: r.data.notice,
        note: r.data.searchScopeNote,
        rows: r.data.items.map((l) => ({
          kind,
          id: l.id,
          href: `/laws/${encodeURIComponent(l.name)}`,
          title: l.name,
          org: l.agency,
          date: l.effectiveFrom,
          refNo: l.kind,
          sourceUrl: l.sourceUrl,
        })),
      },
    };
  }
  if (kind === "ordinances") {
    const r = await searchOrdinances(q);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        notice: r.data.notice,
        note: r.data.searchScopeNote,
        rows: r.data.items.map((o) => ({
          kind,
          id: o.id,
          href: `/ordinances/${o.id}`,
          title: o.name,
          org: o.region,
          date: o.effectiveFrom,
          refNo: o.kind,
          sourceUrl: o.sourceUrl,
        })),
      },
    };
  }
  if (kind === "admin_rules") {
    const r = await searchAdminRules(q);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        notice: r.data.notice,
        note: r.data.searchScopeNote,
        rows: r.data.items.map((a) => ({
          kind,
          id: a.id,
          href: null,
          title: a.name,
          org: a.agency,
          date: a.effectiveFrom,
          refNo: a.kind,
          sourceUrl: a.sourceUrl,
        })),
      },
    };
  }
  const r = await searchDecisions(kind, q);
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      notice: r.data.notice,
      note: r.data.searchScopeNote,
      rows: r.data.items.map((d) => ({
        kind,
        id: d.id,
        // 법제처가 본문 조회를 주지 않는 종류(국세청 해석)는 목록만
        href: d.hasDetail ? `/decisions/${d.domain}/${d.id}?from=search` : null,
        title: d.title,
        org: d.agency,
        date: d.decidedAt,
        refNo: d.refNo,
        sourceUrl: d.sourceUrl,
      })),
    },
  };
}

type PreviewData = {
  sections: { section: string; text: string }[];
  statutes: { raw: string; id: string | null }[];
};

async function loadPreview(row: Row): Promise<ApiResult<PreviewData>> {
  if (row.kind === "cases") {
    const r = await getCaseDetail(row.id);
    return r.ok
      ? { ok: true, data: { sections: r.data.sections, statutes: r.data.citedStatutes } }
      : r;
  }
  if (row.kind === "ordinances") {
    const r = await getOrdinance(row.id);
    return r.ok
      ? {
          ok: true,
          data: {
            sections: r.data.articles.slice(0, 6).map((a) => ({
              section: [a.articleNo, a.title && `(${a.title})`].filter(Boolean).join(" ") || "조문",
              text: a.text,
            })),
            statutes: [],
          },
        }
      : r;
  }
  if (row.kind === "laws" || row.kind === "admin_rules" || !row.href)
    return { ok: true, data: { sections: [], statutes: [] } };
  const r = await getDecision(row.kind, row.id);
  return r.ok ? { ok: true, data: { sections: r.data.sections, statutes: [] } } : r;
}

const KEY_SECTIONS = new Set(["판시사항", "판결요지", "결정요지", "회답", "재결요지", "주문"]);
const metaLine = (r: Row) =>
  [r.org, r.date && `${DATE_WORD[r.kind]} ${dotDate(r.date)}`, r.refNo].filter(Boolean).join(" · ");

function Preview({ row, terms }: { row: Row; terms: string[] }) {
  const [state, setState] = useState<{ id: string; r: ApiResult<PreviewData> } | null>(null);
  const key = `${row.kind}:${row.id}`;
  useEffect(() => {
    let alive = true;
    void loadPreview(row).then((r) => alive && setState({ id: key, r }));
    return () => {
      alive = false;
    };
    // 고른 자료가 바뀔 때만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const r = state?.id === key ? state.r : null;
  const pins = usePins();
  const pinned = isPinned(pins, row);

  return (
    <article aria-label="미리보기" className="flex flex-col gap-4">
      <header>
        <p className="text-gold text-xs font-bold tracking-wide">{LABEL[row.kind]}</p>
        <h2 className="font-display text-ink mt-1 text-[19px] leading-snug font-bold">
          <Highlighted text={row.title} terms={terms} />
        </h2>
        {metaLine(row) && <p className="text-label mt-1 text-[13px]">{metaLine(row)}</p>}
      </header>
      <div className="flex flex-wrap gap-2">
        {row.href && (
          <Link
            href={row.href}
            className="bg-ink rounded-button flex min-h-11 items-center px-4 text-sm font-semibold text-white"
          >
            전체 보기
          </Link>
        )}
        {canPin(row) && (
          <button
            type="button"
            aria-pressed={pinned}
            onClick={() => togglePin(pins, row)}
            className={`rounded-button flex min-h-11 items-center border px-4 text-sm font-semibold ${
              pinned ? "border-gold bg-honey text-ink" : "border-line text-ink bg-white"
            }`}
          >
            {pinned ? "보관함에서 빼기" : "보관함에 담기"}
          </button>
        )}
        {row.sourceUrl && <OriginalLink url={row.sourceUrl} />}
      </div>
      {!r && (
        <p aria-live="polite" className="text-muted text-sm">
          법제처에서 요지를 불러오고 있어요…
        </p>
      )}
      {r && !r.ok && (
        <p role="alert" className="text-warn-text text-sm">
          {searchErrorText(r.error)}
        </p>
      )}
      {r?.ok && r.data.sections.length === 0 && (
        <p className="text-muted text-sm">
          {row.kind === "laws"
            ? "‘전체 보기’에서 조문 전문과 3단 비교·신구 대조·개정 연혁을 볼 수 있어요."
            : "이 자료는 요지 항목이 없어요. 법제처 원문에서 확인해 주세요."}
        </p>
      )}
      {r?.ok &&
        r.data.sections.map((s) => (
          <section
            key={s.section}
            className={
              KEY_SECTIONS.has(s.section)
                ? "border-honey-line bg-honey border-l-gold rounded-[8px] border border-l-4 px-4 py-3"
                : ""
            }
          >
            <h3 className="text-ink text-sm font-bold">{s.section}</h3>
            <p className="text-ink mt-1 text-sm leading-[1.8] whitespace-pre-line">
              <Highlighted text={s.text} terms={terms} />
            </p>
          </section>
        ))}
      {r?.ok && r.data.statutes.length > 0 && (
        <section>
          <h3 className="text-ink text-sm font-bold">참조조문</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {r.data.statutes.map((s) => (
              <li key={s.id ?? s.raw}>
                {s.id ? (
                  <Link
                    href={`/statutes/${encodeURIComponent(s.id)}${row.date ? `?asOf=${row.date}` : ""}`}
                    className="border-line text-ink hover:border-gold flex min-h-9 items-center rounded-full border bg-white px-3 text-[13px]"
                  >
                    {s.raw}
                  </Link>
                ) : (
                  <span className="bg-soft text-muted flex min-h-9 items-center rounded-full px-3 text-[13px]">
                    {s.raw}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Shelf() {
  const pins = usePins();
  const recent = useRecent();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pins.map((p) => p.sub).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const list = "mt-2 grid gap-1";
  const item =
    "hover:bg-soft flex min-h-11 flex-col justify-center rounded-[8px] px-2 py-1.5 text-left";
  return (
    <div className="grid gap-6">
      <section aria-label="보관함">
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <h2 className="text-ink text-sm font-bold">보관함 {pins.length}</h2>
          {pins.length > 0 && (
            <span className="flex gap-1 whitespace-nowrap">
              {/* 폴더·메모·내보내기 (DEC-075 ⓒ) */}
              <Link
                href="/research/shelf"
                className="text-link flex min-h-11 items-center px-1 text-[13px] font-semibold underline-offset-2 hover:underline"
              >
                정리하기
              </Link>
              <button
                type="button"
                onClick={() => void copy()}
                className="text-link min-h-11 px-1 text-[13px] underline-offset-2 hover:underline"
              >
                {copied ? "복사했어요" : "인용 표기 복사"}
              </button>
              <button
                type="button"
                onClick={clearPins}
                className="text-muted min-h-11 px-1 text-[13px] underline-offset-2 hover:underline"
              >
                비우기
              </button>
            </span>
          )}
        </div>
        {pins.length === 0 ? (
          <p className="text-muted mt-1 text-[13px] leading-relaxed">
            미리보기에서 &lsquo;보관함에 담기&rsquo;를 누르면 여기에 모여요. 이 기기에만 저장돼요.
          </p>
        ) : (
          <ul className={list}>
            {pins.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className={item}>
                  <span className="text-ink text-[13px] font-semibold">{p.title}</span>
                  <span className="text-muted text-[12px]">
                    {p.folder ? `${p.folder} · ` : ""}
                    {p.sub}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {recent.length > 0 && (
        <section aria-label="최근 본 자료">
          <h2 className="text-ink text-sm font-bold">최근 본 자료</h2>
          <ul className={list}>
            {recent.slice(0, 6).map((p) => (
              <li key={p.href}>
                <Link href={p.href} className={item}>
                  <span className="text-ink text-[13px] font-semibold">{p.title}</span>
                  <span className="text-muted text-[12px]">
                    {[p.kind, p.sub].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; q: string; data: Found }
  | { kind: "error"; error: ClientError };

const panel = "border-line rounded-[12px] border bg-white";
const fieldLabel = "text-label text-xs font-bold tracking-wide";
const input =
  "border-line text-ink min-h-11 w-full rounded-[8px] border bg-white px-3 text-sm outline-none focus:border-gold";

export function ResearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Kind>("cases");
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [selected, setSelected] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<Sort>("source");
  // 판례 탭 (개선안 A): 법원은 법제처로 다시 찾고, 사건 종류는 받아 온 목록 안에서 거른다
  const [court, setCourt] = useState("");
  const [caseSort, setCaseSort] = useState<NonNullable<CaseFilterInput["sort"]>>("source");
  const [caseTypes, setCaseTypes] = useState<string[]>([]);
  const [more, setMore] = useState<"idle" | "loading" | ClientError>("idle");
  const listRef = useRef<HTMLUListElement>(null);
  const previewRef = useRef<HTMLElement>(null);

  const submit = async (kind: Kind = tab, value: string = text, filter: CaseFilterInput = {}) => {
    const q = value.trim();
    if (!q) {
      setState({ kind: "error", error: { code: "EMPTY_INPUT", message: "" } });
      return;
    }
    const direct = directTarget(q);
    if (direct?.kind === "statute") {
      router.push(`/statutes/${encodeURIComponent(direct.id)}`);
      return;
    }
    const target = direct?.kind === "case" ? "cases" : kind;
    if (target !== tab) setTab(target);
    setState({ kind: "loading" });
    setOrgs([]);
    setCaseTypes([]);
    setMore("idle");
    const r = await run(target, q, target === "cases" ? filter : {});
    if (!r.ok) {
      setState({ kind: "error", error: r.error });
      return;
    }
    rememberSearch(q);
    setState({ kind: "done", q, data: r.data });
    setSelected(r.data.rows[0] ? `${r.data.rows[0].kind}:${r.data.rows[0].id}` : null);
  };

  // 결과 화면의 '판례 더 찾아보기'(?from=result)나 검색 화면의 전환(?from=search, DEC-054)에서 오면
  // 이 기기에 건네 둔 검색어로 바로 찾는다. 주소에는 자료 종류만 있고 검색어는 없다 (F-007)
  const handoff = params.get("from");
  const handoffKind = params.get("kind");
  useEffect(() => {
    if (handoff !== "result" && handoff !== "search") return;
    const q = recallSearch();
    if (!q) return;
    const kind: Kind = isKind(handoffKind) ? handoffKind : "cases";
    // 새로고침 때 다시 찾지 않게 전환 표시를 주소에서 지운다
    window.history.replaceState(window.history.state, "", "/research");
    queueMicrotask(() => {
      setText(q);
      setTab(kind);
      void submit(kind, q);
    });
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  const rows = useMemo(() => (state.kind === "done" ? state.data.rows : []), [state]);
  const terms = state.kind === "done" ? highlightTerms(state.q) : [];
  const orgOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) if (r.org) count.set(r.org, (count.get(r.org) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);
  const paging = state.kind === "done" ? state.data.paging : undefined;
  // 법제처가 거른 판례 쪽은 법원·기간·정렬을 다시 걸지 않고 사건 종류만 거른다
  const shown = useMemo(
    () =>
      paging
        ? rows.filter(
            (r) => caseTypes.length === 0 || (r.caseType && caseTypes.includes(r.caseType)),
          )
        : refine(rows, { orgs, from, to, sort }),
    [paging, rows, caseTypes, orgs, from, to, sort],
  );
  const caseTypeOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows) if (r.caseType) count.set(r.caseType, (count.get(r.caseType) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const courtOptions = useMemo(
    () =>
      [...new Set(["대법원", ...(court ? [court] : []), ...orgOptions.map(([n]) => n)])].filter(
        isCourtName,
      ),
    [orgOptions, court],
  );
  const caseFilter = (): CaseFilterInput => ({
    court: court || null,
    fromYear: from.length === 4 ? from : null,
    toYear: to.length === 4 ? to : null,
    sort: caseSort,
  });
  const applyCaseFilter = () => {
    if (state.kind === "done") void submit("cases", state.q, caseFilter());
  };
  const loadMore = async () => {
    if (state.kind !== "done" || !paging) return;
    setMore("loading");
    const r = await run("cases", state.q, { ...paging.filter, page: paging.page + 1 });
    if (!r.ok) {
      setMore(r.error);
      return;
    }
    setMore("idle");
    const seen = new Set(state.data.rows.map((x) => x.id));
    setState({
      kind: "done",
      q: state.q,
      data: {
        ...state.data,
        rows: [...state.data.rows, ...r.data.rows.filter((x) => !seen.has(x.id))],
        paging: r.data.paging,
      },
    });
  };
  const current =
    shown.find((r) => `${r.kind}:${r.id}` === selected) ?? (shown.length > 0 ? shown[0] : null);

  const move = (step: number) => {
    if (!current) return;
    const i = shown.indexOf(current) + step;
    if (i < 0 || i >= shown.length) return;
    setSelected(`${shown[i].kind}:${shown[i].id}`);
    listRef.current?.querySelectorAll<HTMLElement>("[data-row]")[i]?.focus();
  };

  return (
    // 묶음 화면 (2026-11-24 사용자 요청): 화면 좌우 끝까지 칠하던 검정 띠·회색 바탕을 없애고,
    // /search처럼 사이트 기본 바탕 위에 같은 폭의 패널로 담는다. 머리 패널의 색·톤(ink·honey·gold)은 그대로.
    <div className="flex-1">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 lg:pt-12">
        <section
          aria-label="판례 리서치 검색"
          className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className={PAGE_TITLE}>판례 리서치</h1>
            <div className="flex flex-wrap items-center gap-3">
              {/* 질문창 (DEC-070): 미리보기 중인 판례가 있으면 그 판례를 근거에 넣을 수 있다 */}
              <AskArchive
                focus={
                  current?.kind === "cases"
                    ? { id: current.id, title: metaLine(current) || current.title }
                    : null
                }
              />
              <ArchiveSwitch current="research" searched={state.kind === "done"} kind={tab} />
            </div>
          </div>
          <p className="text-muted mt-2 text-sm">
            법제처 자료를 찾고, 옆에서 요지를 읽고, 필요한 자료를 보관함에 모아요. 검색은 질문
            횟수와 따로 세요.
          </p>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(tab, text, tab === "cases" ? caseFilter() : {});
            }}
            className="mt-5 flex max-w-[860px] gap-2"
          >
            <label htmlFor="research-q" className="sr-only">
              리서치 검색어
            </label>
            <input
              id="research-q"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={100}
              placeholder="예: 임대차 보증금 반환 · 민법 750조 · 2023다12345"
              className="text-ink border-line focus:border-ink rounded-button min-h-12 w-full border bg-white px-4 text-[15px] outline-none"
            />
            <button
              type="submit"
              disabled={state.kind === "loading"}
              className="bg-ink rounded-button min-h-12 shrink-0 px-6 text-[15px] font-bold text-white disabled:opacity-60"
            >
              검색
            </button>
          </form>
          <div className="mt-4">
            {/* 종류 탭: 모바일은 주요 5개 + 묶음별 '더 보기', 데스크톱은 전체 (시안 A) */}
            <KindTabs
              kinds={KINDS}
              value={tab}
              label="자료 종류"
              onChange={(k) => {
                setTab(k);
                if (text.trim() && state.kind !== "idle") void submit(k);
              }}
            />
          </div>
        </section>
      </div>

      <div className="mx-auto grid w-full max-w-[1320px] gap-4 px-4 py-5 lg:grid-cols-[250px_minmax(0,1fr)_minmax(0,430px)]">
        <aside className={`${panel} h-fit p-4`} aria-label="거르기">
          {tab === "cases" ? (
            // 판례 (개선안 A): 법원·기간·정렬은 법제처에서 다시 찾고, 사건 종류는 받아 온 목록 안에서 거른다
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyCaseFilter();
              }}
            >
              <p className={fieldLabel}>정렬</p>
              <select
                aria-label="정렬"
                value={caseSort}
                onChange={(e) => setCaseSort(e.target.value as typeof caseSort)}
                className={`${input} mt-1.5`}
              >
                <option value="source">법제처 검색 순서</option>
                <option value="newest">선고일 최신순</option>
                <option value="oldest">선고일 오래된순</option>
                <option value="name">사건명 가나다순</option>
              </select>
              <p className={`${fieldLabel} mt-4`}>선고 연도</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  aria-label="시작 연도"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2015"
                  value={from}
                  onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))}
                  className={input}
                />
                <span className="text-muted">~</span>
                <input
                  aria-label="끝 연도"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2026"
                  value={to}
                  onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))}
                  className={input}
                />
              </div>
              <p className={`${fieldLabel} mt-4`}>법원</p>
              <select
                aria-label="법원"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                className={`${input} mt-1.5`}
              >
                <option value="">모든 법원</option>
                {courtOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={state.kind !== "done"}
                className="bg-ink rounded-button mt-3 min-h-11 w-full text-sm font-semibold text-white disabled:opacity-50"
              >
                법제처에서 다시 찾기
              </button>
              {caseTypeOptions.length > 1 && (
                <>
                  <p className={`${fieldLabel} mt-4`}>사건 종류</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {caseTypeOptions.map(([name, n]) => {
                      const on = caseTypes.includes(name);
                      return (
                        <li key={name}>
                          <button
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setCaseTypes((p) => (on ? p.filter((x) => x !== name) : [...p, name]))
                            }
                            className={`flex min-h-9 items-center rounded-full border px-3 text-[13px] ${
                              on
                                ? "border-gold bg-honey text-ink font-semibold"
                                : "border-line text-ink bg-white"
                            }`}
                          >
                            {name} <span className="text-muted ml-1">{n}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <p className="text-muted mt-4 text-[12px] leading-relaxed">
                법원·연도·정렬은 법제처에서 다시 찾아요. 사건 종류는 불러온 목록 안에서 거르고,
                법제처 사건 종류가 없으면 사건번호 부호로 나눠요. 관련도 순위는 매기지 않아요.
              </p>
            </form>
          ) : (
            <>
              <p className={fieldLabel}>정렬</p>
              <select
                aria-label="정렬"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className={`${input} mt-1.5`}
              >
                <option value="source">법제처 검색 순서</option>
                <option value="newest">날짜 최신순</option>
                <option value="oldest">날짜 오래된순</option>
              </select>
              <p className={`${fieldLabel} mt-4`}>기간 (연도)</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  aria-label="시작 연도"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2015"
                  value={from}
                  onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))}
                  className={input}
                />
                <span className="text-muted">~</span>
                <input
                  aria-label="끝 연도"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="2026"
                  value={to}
                  onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))}
                  className={input}
                />
              </div>
              {orgOptions.length > 1 && (
                <>
                  <p className={`${fieldLabel} mt-4`}>기관</p>
                  <ul className="mt-1.5 grid gap-0.5">
                    {orgOptions.map(([name, n]) => (
                      <li key={name}>
                        <label className="text-ink flex min-h-9 items-center gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={orgs.includes(name)}
                            onChange={() =>
                              setOrgs((p) =>
                                p.includes(name) ? p.filter((x) => x !== name) : [...p, name],
                              )
                            }
                          />
                          <span className="flex-1">{name}</span>
                          <span className="text-muted">{n}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="text-muted mt-4 text-[12px] leading-relaxed">
                거르기와 정렬은 이번에 가져온 목록 안에서만 해요. 관련도 순위는 매기지 않아요.
              </p>
            </>
          )}
          <div className="border-line mt-4 border-t pt-4">
            <Shelf />
          </div>
        </aside>

        <section aria-label="검색 결과" className={`${panel} min-h-[320px] overflow-hidden`}>
          <div className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3">
            <h2 className="text-ink text-sm font-bold">
              {state.kind === "done" ? (
                <>
                  &lsquo;{state.q}&rsquo; {LABEL[tab]}
                </>
              ) : (
                LABEL[tab]
              )}
            </h2>
            {state.kind === "done" && (
              <span data-testid="research-count" className="text-gold text-sm font-bold">
                {paging
                  ? `전체 ${paging.total.toLocaleString("ko-KR")}건 중 ${
                      shown.length === rows.length
                        ? `${rows.length}건`
                        : `${shown.length}/${rows.length}건`
                    }`
                  : shown.length === rows.length
                    ? `${rows.length}건`
                    : `${shown.length}/${rows.length}건`}
              </span>
            )}
            {state.kind === "done" && <SearchNotice notice={state.data.notice} />}
          </div>
          {state.kind === "idle" && (
            <div className="text-muted grid gap-1.5 px-4 py-6 text-sm leading-relaxed">
              <p className="text-ink font-semibold">이렇게 써 보세요</p>
              <p>· 핵심 낱말 두세 개로 검색하고, 목록을 누르면 오른쪽에서 요지를 바로 읽어요.</p>
              <p>· &lsquo;민법 750조&rsquo;나 사건번호를 적으면 그 조문·판례로 바로 가요.</p>
              <p>· 목록에서 ↑ ↓ 키로 옮겨 다닐 수 있어요.</p>
              <p>· 이름·전화번호 같은 개인정보는 검색어에 넣지 말아 주세요.</p>
            </div>
          )}
          {state.kind === "loading" && (
            <ul aria-hidden="true" className="grid gap-px">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="bg-soft h-[68px] animate-pulse" />
              ))}
            </ul>
          )}
          {state.kind === "error" && (
            <p role="alert" className="text-warn-text px-4 py-6 text-sm">
              {searchErrorText(state.error)}
            </p>
          )}
          {state.kind === "done" && shown.length === 0 && (
            <p className="text-ink px-4 py-6 text-sm">
              {rows.length === 0
                ? "찾은 자료가 없어요. 다른 말로 바꿔 검색해 보세요."
                : "거르기 조건에 맞는 자료가 없어요. 조건을 풀어 보세요."}
            </p>
          )}
          {state.kind === "done" && shown.length > 0 && (
            <ul ref={listRef}>
              {shown.map((r) => {
                const on = current === r;
                return (
                  <li key={`${r.kind}:${r.id}`} className="border-line border-b last:border-b-0">
                    <button
                      type="button"
                      data-row
                      aria-current={on || undefined}
                      onClick={() => {
                        setSelected(`${r.kind}:${r.id}`);
                        // 좁은 화면(lg 미만)은 미리보기가 목록 맨 아래에 있어 보이지 않는다 (DEC-067):
                        // 상세 화면이 있으면 그리로 가고, 없으면 미리보기로 내려간다
                        if (window.matchMedia?.("(max-width: 1023.98px)").matches) {
                          if (r.href) router.push(r.href);
                          else
                            requestAnimationFrame(() =>
                              previewRef.current?.scrollIntoView({ block: "start" }),
                            );
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          move(1);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          move(-1);
                        }
                      }}
                      className={`flex w-full flex-col gap-1 border-l-4 px-4 py-3 text-left ${
                        on ? "border-l-gold bg-honey" : "hover:bg-soft border-l-transparent"
                      }`}
                    >
                      <span className="text-ink text-[15px] leading-snug font-semibold">
                        <Highlighted text={r.title} terms={terms} />
                      </span>
                      {metaLine(r) && <span className="text-label text-[13px]">{metaLine(r)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {paging &&
            paging.page * paging.pageSize < paging.total &&
            paging.page < MAX_CASE_PAGE && (
              <div className="border-line flex flex-wrap items-center gap-3 border-t px-4 py-3">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={more === "loading"}
                  className="rounded-button border-line text-ink min-h-11 border bg-white px-4 text-sm font-semibold disabled:opacity-60"
                >
                  {more === "loading" ? "불러오는 중…" : "더 보기"}
                </button>
                {typeof more === "object" && (
                  <span role="alert" className="text-warn-text text-[13px]">
                    {searchErrorText(more)}
                  </span>
                )}
              </div>
            )}
          {state.kind === "done" && state.data.note && (
            <p className="text-muted border-line border-t px-4 py-3 text-[12px] leading-relaxed">
              {state.data.note}
            </p>
          )}
        </section>

        <aside
          ref={previewRef}
          aria-label="미리보기"
          className={`${panel} h-fit scroll-mt-20 p-5 lg:sticky lg:top-[86px]`}
        >
          {current ? (
            <Preview row={current} terms={terms} />
          ) : (
            <p className="text-muted text-sm leading-relaxed">
              목록에서 자료를 고르면 여기에 요지가 나와요.
            </p>
          )}
        </aside>
      </div>
      <div className="mx-auto w-full max-w-[1320px] px-4 pb-8">
        <SearchCredit />
      </div>
    </div>
  );
}
