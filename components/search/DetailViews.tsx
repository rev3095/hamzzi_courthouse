"use client";
// 판례 상세 /cases/[id] (F-003 AC3) · 조문 /statutes/[id] (F-004) · 결정문 /decisions/[domain]/[id] (DEC-029 제안).
// 법제처에서 가져온 내용만 보여 준다. 없으면 "찾을 수 없음" — 대체 내용을 만들지 않는다 (API.md 3절 NOT_FOUND).
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getCaseDetail,
  getDecision,
  getStatuteAt,
  getStatuteCases,
  type ApiResult,
  type CaseDetailView,
  type DiffPart,
  type StatuteTimeView,
} from "@/lib/client/api";
import { DECISION_DOMAINS, isDecisionDomain } from "@/lib/search/explore";
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
import { AskArchive } from "./AskArchive";
import { CaseActions, CitedCases, SameStatuteCases } from "./CaseExtras";
import { StatuteTime } from "./StatuteTime";
import { useRecordRecent } from "./recent";

const noSubscribe = () => () => {};

/** 검색에서 왔으면(?from=search) 그 검색어 낱말. 주소에는 검색어를 두지 않고 이 기기에 둔 것만 읽는다 (F-007) */
function useSearchTerms(): string[] {
  const fromSearch = useSearchParams().get("from") === "search";
  const query = useSyncExternalStore(noSubscribe, recallSearch, () => null);
  return fromSearch ? highlightTerms(query) : [];
}

/** 요지 항목은 강조 영역으로 (글자 크기는 그대로, 바탕·왼쪽 선만) */
const KEY_SECTIONS = new Set(["판시사항", "판결요지", "결정요지", "회답", "재결요지", "주문"]);

function TermsLegend({ terms }: { terms: string[] }) {
  if (terms.length === 0) return null;
  return (
    <p className="text-muted mt-3 text-[13px]">
      <mark className="bg-honey-line text-ink rounded-[3px] px-1">검색어</mark> 표시는 검색에서 적은
      낱말이에요.
    </p>
  );
}

function Sections({
  sections,
  terms,
}: {
  sections: { section: string; text: string }[];
  terms: string[];
}) {
  return (
    <>
      {sections.map((s) => (
        <section
          key={s.section}
          className={
            KEY_SECTIONS.has(s.section)
              ? "rounded-card border-honey-line bg-honey border-l-gold mt-6 border border-l-4 px-5 py-4"
              : "mt-6"
          }
        >
          <H2>{s.section}</H2>
          <p className={BODY}>
            <Highlighted text={s.text} terms={terms} />
          </p>
        </section>
      ))}
    </>
  );
}

const META_BAND = "bg-cream text-label mt-2 w-fit rounded-[6px] px-2 py-0.5 text-sm";

export function useLoad<T>(key: string, load: () => Promise<ApiResult<T>>) {
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

/**
 * 상세 화면의 돌아가기 (DEC-067): 리서치·결과 화면에서 왔으면 그 화면으로 돌아가고, 처음부터 이 화면으로 들어왔으면 검색 화면으로 간다.
 * 이 사이트 안에서 앞 화면이 있는지는 Navigation API(지원 브라우저) → 같은 사이트 referrer 순으로 본다.
 */
function BackLink() {
  const router = useRouter();
  const [canBack, setCanBack] = useState(false);
  useEffect(() => {
    try {
      const nav = (window as { navigation?: { canGoBack?: boolean } }).navigation;
      const sameSite =
        !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      // 화면을 그린 뒤 브라우저 기록을 한 번 읽는다 (서버 렌더와 맞추려고 처음에는 검색 링크로 그린다)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanBack(nav?.canGoBack ?? (sameSite && window.history.length > 1));
    } catch {
      setCanBack(false);
    }
  }, []);
  return (
    <Link
      href="/search"
      onClick={(e) => {
        if (!canBack) return;
        e.preventDefault();
        // 새 탭으로 열어 앞 기록이 없으면 뒤로 가지 않는다 — 그때는 검색 화면으로 간다
        const here = window.location.href;
        window.history.back();
        window.setTimeout(() => {
          if (window.location.href === here) router.push("/search");
        }, 400);
      }}
      className="text-link text-sm underline-offset-2 hover:underline"
    >
      {canBack ? "← 이전 화면으로" : "← 판례·법령 검색"}
    </Link>
  );
}

export function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`mx-auto w-full px-4 py-8 lg:py-12 ${wide ? "max-w-[1120px]" : "max-w-[860px]"}`}
    >
      <BackLink />
      <article className="rounded-panel border-line mt-4 border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
        {children}
      </article>
      <SearchCredit />
    </div>
  );
}

/** 불러오는 중·오류 공통 표시. 준비되면 null */
export function Pending<T>({
  r,
  loading,
}: {
  r: ApiResult<T> | null;
  loading: string;
}): React.ReactNode {
  if (!r)
    return (
      <p aria-live="polite" className="text-muted">
        {loading}
      </p>
    );
  if (!r.ok)
    return (
      <p role="alert" className="text-warn-text">
        {searchErrorText(r.error)}
      </p>
    );
  return null;
}

export const H1 = ({ children }: { children: React.ReactNode }) => (
  <h1 className="font-display text-ink mt-4 text-[24px] leading-snug font-bold">{children}</h1>
);
export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-ink text-lg font-bold">{children}</h2>
);
export const BODY = "text-ink mt-2 text-[15px] leading-[1.8] whitespace-pre-line";

export function CaseRoute() {
  const { id } = useParams<{ id: string }>();
  const r = useLoad(id, () => getCaseDetail(id));
  const terms = useSearchTerms();
  const c: CaseDetailView | null = r?.ok ? r.data : null;
  useRecordRecent(
    c && {
      href: `/cases/${c.id}`,
      title: c.caseName || c.caseNo,
      sub: [c.court, c.caseNo].filter(Boolean).join(" "),
      kind: "판례",
    },
  );
  if (!c)
    return (
      <Shell>
        <Pending r={r} loading="법제처에서 판례를 불러오고 있어요…" />
      </Shell>
    );
  return (
    <Shell>
      <SearchNotice notice={c.notice} />
      <H1>
        <Highlighted text={c.caseName || c.caseNo} terms={terms} />
      </H1>
      <p className={META_BAND}>
        {[c.court, dotDate(c.decidedAt), c.caseNo].filter(Boolean).join(" · ")}
      </p>
      {c.fromBody && (
        <p className="bg-soft text-muted mt-3 w-fit rounded-[6px] px-2 py-0.5 text-xs">
          판시사항·요지가 없어 개인정보를 가린 본문 일부를 보여 드려요
        </p>
      )}
      {/* 보관함 담기 · 인용 표기 형식 (DEC-072 ⓑ) */}
      <CaseActions c={c} />
      <TermsLegend terms={terms} />
      <Sections sections={c.sections} terms={terms} />
      {c.citedStatutes.length > 0 && (
        <section className="mt-6">
          <H2>참조조문</H2>
          <p className="text-muted mt-1 text-[13px]">
            누르면 법제처 현행 조문과, 선고일에 시행 중이던 조문을 함께 보여 드려요. 구법·부칙
            표기는 현행 조문과 다를 수 있어 링크를 달지 않았어요.
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
      {/* 참조판례 · 같은 조문이 나오는 판례 (DEC-072 ⓑ): 누를 때만 법제처에 묻는다 */}
      <CitedCases items={c.citedCases ?? []} />
      <SameStatuteCases selfId={c.id} statutes={c.citedStatutes} />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <OriginalLink url={c.sourceUrl} label="법제처에서 판결 원문 보기 →" />
        {/* 질문창 (DEC-070): 이 판례를 근거에 넣어 Light로 묻는다 */}
        <AskArchive
          focus={{
            id: c.id,
            title: [c.court, c.caseNo].filter(Boolean).join(" ") || c.caseName,
          }}
        />
      </div>
    </Shell>
  );
}

export function DecisionRoute() {
  const { domain, id } = useParams<{ domain: string; id: string }>();
  const r = useLoad(`${domain}|${id}`, () => getDecision(domain, id));
  const terms = useSearchTerms();
  const d = r?.ok ? r.data : null;
  const label = isDecisionDomain(domain) ? DECISION_DOMAINS[domain].label : "결정문";
  useRecordRecent(
    d && {
      href: `/decisions/${d.domain}/${d.id}`,
      title: d.title,
      sub: [d.agency, d.refNo].filter(Boolean).join(" "),
      kind: label,
    },
  );
  if (!d)
    return (
      <Shell>
        <Pending r={r} loading="법제처에서 불러오고 있어요…" />
      </Shell>
    );
  return (
    <Shell>
      <SearchNotice notice={d.notice} />
      <H1>
        <Highlighted text={d.title} terms={terms} />
      </H1>
      <p className={META_BAND}>
        {[label, d.agency, dotDate(d.decidedAt), d.refNo].filter(Boolean).join(" · ")}
      </p>
      {d.fromBody && (
        <p className="bg-soft text-muted mt-3 w-fit rounded-[6px] px-2 py-0.5 text-xs">
          요지 항목이 없어 개인정보를 가린 본문 일부를 보여 드려요
        </p>
      )}
      {d.sections.length === 0 && (
        <p className="text-muted mt-6 text-[15px]">
          법제처가 이 자료의 요지 항목을 제공하지 않아요. 원문에서 확인해 주세요.
        </p>
      )}
      <TermsLegend terms={terms} />
      <Sections sections={d.sections} terms={terms} />
      <div className="mt-4">
        {d.sourceUrl ? (
          <OriginalLink url={d.sourceUrl} label="법제처에서 원문 보기 →" />
        ) : d.agencySite ? (
          <p className="text-muted text-[13px]">
            국가법령정보센터에는 이 자료의 공개 주소가 없어요.{" "}
            <OriginalLink
              url={d.agencySite.url}
              label={`${d.agencySite.label} 사이트에서 ${d.refNo ? `‘${d.refNo}’(으)로` : "제목으로"} 찾기 ↗`}
            />
          </p>
        ) : (
          <p className="text-muted text-[13px]">
            원문은 국가법령정보센터에서 {d.refNo ? `‘${d.refNo}’(으)로` : "제목으로"} 검색해 확인할
            수 있어요.
          </p>
        )}
      </div>
    </Shell>
  );
}

/** 그 날짜 조문 → 현행 조문 변화. 빠진 줄은 줄을 긋고, 새로 들어온 줄은 바탕색으로 표시한다 */
export function DiffText({ parts }: { parts: DiffPart[] }) {
  return (
    <div className="mt-2 text-[15px] leading-[1.8] whitespace-pre-line">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <p key={i} className="text-ink">
            {p.text}
          </p>
        ) : p.type === "removed" ? (
          <p key={i} className="text-muted line-through">
            <span className="sr-only">그 뒤 빠진 내용: </span>
            {p.text}
          </p>
        ) : (
          <p key={i} className="bg-cream text-ink rounded-[4px] px-1">
            <span className="sr-only">그 뒤 들어온 내용: </span>
            {p.text}
          </p>
        ),
      )}
    </div>
  );
}

const LAW_TOOLS: [string, string][] = [
  ["articles", "법령 전문·판례"],
  ["three-tier", "3단 비교"],
  ["old-new", "신구조문 대조"],
  ["history", "개정 연혁"],
  ["annexes", "별표·서식"],
  ["impact", "연계·위임 대조"],
];

function RelatedCases({ id }: { id: string }) {
  const r = useLoad(`cases|${id}`, () => getStatuteCases(id));
  return (
    <section className="mt-8" aria-label="이 조문이 나오는 판례">
      <H2>이 조문이 나오는 판례</H2>
      {!r?.ok ? (
        <div className="mt-2 text-sm">
          <Pending r={r} loading="법제처에서 판례를 찾고 있어요…" />
        </div>
      ) : (
        <>
          <p className="text-muted mt-1 text-[13px] leading-relaxed">{r.data.searchScopeNote}</p>
          {(r.data.items ?? []).length === 0 ? (
            <p className="text-muted mt-3 text-sm">찾은 판례가 없어요.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {(r.data.items ?? []).map((c) => (
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

export function StatuteRoute() {
  const { id } = useParams<{ id: string }>();
  const statuteId = decodeURIComponent(id);
  // 판례 상세에서 오면 ?asOf=선고일 — 판결 당시 조문을 처음부터 함께 보여 준다 (F-004 AC1)
  const fromCase = useSearchParams().get("asOf") ?? "";
  const [asOf, setAsOf] = useState(fromCase);
  const [applied, setApplied] = useState(fromCase);
  const r = useLoad(`${id}|${applied}`, () => getStatuteAt(statuteId, applied || undefined));
  const s: StatuteTimeView | null = r?.ok ? r.data : null;
  useRecordRecent(
    s && {
      href: `/statutes/${encodeURIComponent(s.id)}`,
      title: `${s.lawName} ${s.articleNo}`,
      sub: s.articleTitle,
      kind: "조문",
    },
  );
  if (!s) {
    // 법령 이름이 정식 이름·공식 약칭과 맞지 않으면 조문을 못 찾는다 — 법령 탭에서 이름 일부로 다시 찾게 한다
    const lawName = statuteId.split(":")[0]?.trim() ?? "";
    const notFound = r && !r.ok && r.error.code === "NOT_FOUND" && lawName;
    return (
      <Shell>
        <Pending r={r} loading="법제처에서 조문을 불러오고 있어요…" />
        {notFound && (
          <p className="text-muted mt-3 text-sm leading-relaxed">
            법령 이름이 정식 이름과 다르면 조문을 찾지 못해요.{" "}
            <Link
              href="/search?from=statute&kind=laws"
              onClick={() => rememberSearch(lawName)}
              className="text-link font-semibold underline-offset-2 hover:underline"
            >
              &lsquo;{lawName}&rsquo;(이)가 들어간 법령 찾기 →
            </Link>
          </p>
        )}
      </Shell>
    );
  }
  const at = s.atDate;
  return (
    <Shell>
      <SearchNotice notice={s.notice} />
      <H1>
        {s.lawName} {s.articleNo}
        {s.articleTitle && ` (${s.articleTitle})`}
      </H1>
      <p className="text-muted mt-1 text-sm">
        {s.effectiveFrom && `시행 ${dotDate(s.effectiveFrom)} · `}
        {s.isCurrent ? "현재 시행 중" : "시행 예정"}
      </p>
      <p className="text-ink mt-5 text-[15px] leading-[1.8] whitespace-pre-line">{s.body}</p>
      <div className="mt-4">
        <OriginalLink url={s.sourceUrl} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(asOf);
        }}
        className="rounded-card bg-soft mt-6 flex flex-wrap items-end gap-2 p-4"
      >
        <label className="text-muted flex flex-col text-[13px]">
          날짜를 고르면 그날 시행 중이던 조문을 보여 드려요
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
      {s.asOf && !at && (
        <p className="text-muted mt-3 text-sm leading-relaxed">
          {s.versionAtDate
            ? `${dotDate(s.asOf)}에도 위 조문이 시행 중이었어요 (시행 ${dotDate(s.effectiveFrom)}).`
            : s.asOfNote}
        </p>
      )}
      {s.asOf && at && (
        <section className="border-line mt-4 border-t pt-4" aria-label="그 날짜의 조문">
          <H2>
            {dotDate(s.asOf)}에 시행 중이던 {at.articleNo}
            {at.articleTitle && ` (${at.articleTitle})`}
          </H2>
          <p className="text-muted mt-1 text-[13px] leading-relaxed">
            {[
              at.lawName !== s.lawName && `당시 법령명 ${at.lawName}`,
              at.version.effectiveFrom && `시행 ${dotDate(at.version.effectiveFrom)}`,
              at.version.promulgationNo && `공포번호 제${at.version.promulgationNo}호`,
              at.version.revisionType,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {at.articleTitle !== s.articleTitle && (
            <p className="text-muted mt-2 text-sm">
              조문 제목이 지금과 달라요. 그 사이 조문 번호가 바뀌었다면 다른 내용의 조문일 수 있으니
              법제처 연혁에서 확인해 주세요.
            </p>
          )}
          {at.sameAsCurrent ? (
            <>
              <p className="text-muted mt-2 text-sm">
                법제처 자료 기준으로 이 조문의 글은 지금과 같아요.
              </p>
              <p className={BODY}>{at.body}</p>
            </>
          ) : (
            <>
              <p className="text-muted mt-2 text-sm">
                줄 그은 부분은 그 뒤에 빠진 내용, 바탕색이 있는 부분은 그 뒤에 들어온 내용이에요.
              </p>
              <DiffText parts={at.diff} />
            </>
          )}
        </section>
      )}

      {/* 두 날짜 비교·조문 개정 이력 (DEC-072 ⓔ) */}
      <StatuteTime id={s.id} initialFrom={s.asOf ?? undefined} />

      <section className="mt-8" aria-label="법령 도구">
        <H2>{s.lawName} 더 살펴보기</H2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {LAW_TOOLS.map(([tab, label]) => (
            <li key={tab}>
              <Link
                href={`/laws/${encodeURIComponent(s.lawName)}?tab=${tab}`}
                className="border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <RelatedCases id={s.id} />
    </Shell>
  );
}
