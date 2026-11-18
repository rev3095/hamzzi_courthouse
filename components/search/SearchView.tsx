"use client";
// 검색 화면 /search (F-003, DEC-029 제안). 질문 3회와 별개 (DEC-017 제안). 관련도 점수는 보이지 않는다 (PRD 8.3).
// 종류 탭: 판례 · 법령해석례 · 헌재 결정례 · 조세심판 재결례 · 관세청 해석 · 자치법규 · 행정규칙.
// "민법 750조"·사건번호처럼 대상이 분명한 입력은 목록 대신 그 조문·판례로 바로 간다.
// 검색 패널(출처·자주 찾는 검색어·검색 요령)과 결과 카드(건수·칩·19px 제목·자리표시)는 F-003 가독성 개편(e08a9e2) 구성을 따른다.
import Link from "next/link";
import { useState } from "react";
import {
  searchAdminRules,
  searchCases,
  searchDecisions,
  searchOrdinances,
  type ApiResult,
  type ClientError,
  type DecisionDomain,
} from "@/lib/client/api";
import { DECISION_TABS, directTarget } from "@/lib/search/explore";
import { highlightTerms } from "@/lib/search/highlight";
import { dotDate } from "../result/labels";
import { QuestionBox } from "../ask/QuestionBox";
import { KindTabs } from "./KindTabs";
import {
  Highlighted,
  OriginalLink,
  RecentList,
  SearchCredit,
  SearchNotice,
  rememberSearch,
  searchErrorText,
} from "./parts";

type Kind = "cases" | DecisionDomain | "ordinances" | "admin_rules";

const KINDS: { kind: Kind; label: string; placeholder: string }[] = [
  { kind: "cases", label: "판례", placeholder: "예: 임대차 보증금 반환, 민법 750조, 2023다12345" },
  ...DECISION_TABS.map((d) => ({
    kind: d.domain as Kind,
    label: d.label,
    placeholder: d.placeholder,
  })),
  { kind: "ordinances", label: "자치법규", placeholder: "예: 출산장려금, 주차장 설치" },
  { kind: "admin_rules", label: "행정규칙", placeholder: "예: 임대차, 최저임금 고시" },
];

/** 판례 탭의 자주 찾는 검색어. 누르면 바로 검색한다 */
export const QUICK_QUERIES = [
  "임대차 보증금 반환",
  "계약금 해제",
  "임금 체불",
  "부당해고",
  "전세 사기",
  "교통사고 손해배상",
  "층간소음 손해배상",
  "대여금 반환",
] as const;

const TIPS = [
  "사건의 핵심 낱말 두세 개로 찾아보세요. 예: 임대차 보증금 반환",
  "‘민법 750조’처럼 법령 이름(약칭도 돼요)과 조문 번호, 또는 사건번호를 적으면 바로 열어요.",
  "이름·전화번호 같은 개인정보는 검색어에 넣지 말아 주세요.",
];

type Item = {
  key: string;
  href: string | null;
  title: string;
  /** 첫 항목은 칩(법원·기관), 나머지는 날짜·번호 */
  tags: string[];
  sourceUrl: string | null;
  /** 원문 주소가 없을 때 번호로 찾아볼 기관 공식 사이트 */
  agencySite?: { label: string; url: string } | null;
  /** 자치법규만: 나란히 비교에 쓰는 번호 */
  compareId?: string;
};
type Result = { items: Item[]; notice: string; searchScopeNote: string };

const tags = (...parts: (string | null | undefined | false)[]) =>
  parts.filter((p): p is string => !!p);

async function run(kind: Kind, q: string): Promise<ApiResult<Result>> {
  if (kind === "cases") {
    const r = await searchCases(q);
    if (!r.ok) return r;
    return {
      ok: true,
      data: {
        ...r.data,
        items: r.data.items.map((c) => ({
          key: c.id,
          href: `/cases/${c.id}?from=search`,
          title: c.caseName || c.caseNo,
          tags: tags(c.court, c.decidedAt && `선고 ${dotDate(c.decidedAt)}`, c.caseNo),
          sourceUrl: c.sourceUrl,
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
        ...r.data,
        items: r.data.items.map((o) => ({
          key: o.id,
          href: `/ordinances/${o.id}`,
          title: o.name,
          tags: tags(o.region, o.kind, o.effectiveFrom && `시행 ${dotDate(o.effectiveFrom)}`),
          sourceUrl: o.sourceUrl,
          compareId: o.id,
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
        ...r.data,
        items: r.data.items.map((a) => ({
          key: a.id,
          href: null,
          title: a.name,
          tags: tags(a.agency, a.kind, a.effectiveFrom && `시행 ${dotDate(a.effectiveFrom)}`),
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
      ...r.data,
      items: r.data.items.map((d) => ({
        key: d.id,
        // 법제처가 본문 조회를 주지 않는 종류(국세청 해석)는 목록만
        href: d.hasDetail ? `/decisions/${d.domain}/${d.id}?from=search` : null,
        title: d.title,
        tags: tags(d.agency, d.decidedAt && `${d.dateLabel} ${dotDate(d.decidedAt)}`, d.refNo),
        sourceUrl: d.sourceUrl,
        agencySite: d.agencySite ?? null,
      })),
    },
  };
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; q: string; data: Result }
  | { kind: "error"; error: ClientError };

const go = (href: string) => window.location.assign(href);

function QuickButtons({ onPick }: { onPick: (q: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {QUICK_QUERIES.map((q) => (
        <li key={q}>
          <button
            type="button"
            onClick={() => onPick(q)}
            className="border-line text-ink hover:border-gold flex min-h-11 items-center rounded-full border bg-white px-4 text-sm"
          >
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SearchView() {
  const [tab, setTab] = useState<Kind>("cases");
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [picked, setPicked] = useState<string[]>([]);
  const spec = KINDS.find((k) => k.kind === tab)!;

  // 검색어는 주소(?q=)에 두지 않는다 — 브라우저 기록·접속 기록에 남지 않게 (F-007)
  const submit = async (kind: Kind = tab, input: string = text) => {
    const q = input.trim();
    if (!q) {
      setState({ kind: "error", error: { code: "EMPTY_INPUT", message: "" } });
      return;
    }
    const direct = directTarget(q);
    if (direct?.kind === "statute") {
      go(`/statutes/${encodeURIComponent(direct.id)}`);
      return;
    }
    const target = direct?.kind === "case" ? "cases" : kind;
    if (target !== tab) setTab(target);
    setPicked([]);
    setState({ kind: "loading" });
    const r = await run(target, q);
    if (!r.ok) {
      setState({ kind: "error", error: r.error });
      return;
    }
    // 사건번호로 한 건만 나오면 그 판례로 바로 간다
    if (direct?.kind === "case" && r.data.items.length === 1 && r.data.items[0].href) {
      go(r.data.items[0].href);
      return;
    }
    // 서버가 받아 준 검색어만 이 기기에 남긴다 (개인정보로 막힌 검색어는 남기지 않음) — 상세 화면 하이라이트용
    rememberSearch(q);
    setState({ kind: "done", q, data: r.data });
  };

  // 검색 결과에서 검색어 낱말을 하이라이트한다 (F-003)
  const terms = state.kind === "done" ? highlightTerms(state.q) : [];

  const quick = (q: string) => {
    setText(q);
    void submit("cases", q);
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
      <section className="rounded-panel border-line border bg-white px-[18px] py-[22px] lg:px-8 lg:py-8">
        <p className="bg-soft text-muted w-fit rounded-[6px] px-2.5 py-1 text-xs font-semibold">
          출처 · 법제처 국가법령정보센터
        </p>
        <h1 className="font-display text-ink mt-3 text-[28px] font-bold">판례·법령 검색</h1>
        <p className="text-muted mt-2 text-[15px] leading-relaxed">
          판례·해석례·재결례·자치법규를 법제처에서 바로 찾아요. 검색은 질문 3번과 따로 세요.
        </p>
        <div className="mt-5">
          {/* 종류 탭: 모바일은 주요 4개 + 묶음별 '더 보기', 데스크톱은 전체 (시안 A) */}
          <KindTabs
            kinds={KINDS}
            value={tab}
            label="검색 종류"
            onChange={(k) => {
              setTab(k);
              if (text.trim() && state.kind !== "idle") void submit(k);
            }}
          />
        </div>
        <div className="mt-4 max-w-[820px]">
          <QuestionBox
            value={text}
            onChange={setText}
            onSubmit={() => void submit()}
            busy={state.kind === "loading"}
            size="md"
            label={`${spec.label} 검색어`}
            placeholder={spec.placeholder}
          />
        </div>
        {tab === "cases" && (
          <div className="mt-4">
            <p className="text-muted mb-2 text-[13px] font-semibold">자주 찾는 검색어</p>
            <QuickButtons onPick={quick} />
          </div>
        )}
        <ul className="text-muted mt-4 grid gap-1 text-[13px] leading-relaxed">
          {TIPS.map((t) => (
            <li key={t}>· {t}</li>
          ))}
        </ul>
      </section>

      <Link
        href="/research"
        className="border-honey-line bg-honey hover:border-gold rounded-card mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border px-5 py-4"
      >
        <span>
          <span className="text-ink block text-[15px] font-bold">판례 리서치 화면으로 보기</span>
          <span className="text-muted block text-[13px]">
            목록 옆에서 요지를 바로 읽고, 법원·기간으로 거르고, 보관함에 모아 인용 표기를 복사해요.
          </span>
        </span>
        <span className="text-link text-sm font-semibold">열기 →</span>
      </Link>

      {state.kind === "idle" && <RecentList />}
      {state.kind === "error" && (
        <p role="alert" className="text-warn-text mt-6 text-[15px]">
          {searchErrorText(state.error)}
        </p>
      )}
      {state.kind === "loading" && (
        <div aria-live="polite" className="mt-8">
          <p className="text-muted text-[15px]">법제처에서 찾고 있어요…</p>
          <ul aria-hidden="true" className="mt-4 grid gap-3 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="rounded-card border-line bg-soft h-[132px] animate-pulse border"
              />
            ))}
          </ul>
        </div>
      )}
      {state.kind === "done" && (
        <section aria-label="검색 결과" className="mt-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-ink text-xl font-bold">
              &lsquo;{state.q}&rsquo; 검색 결과
            </h2>
            <span data-testid="result-count" className="text-gold text-base font-bold">
              {state.data.items.length}건
            </span>
          </div>
          <div className="mt-2">
            <SearchNotice notice={state.data.notice} />
          </div>
          {state.data.searchScopeNote && (
            <p className="text-muted mt-3 text-sm leading-relaxed">{state.data.searchScopeNote}</p>
          )}
          {tab === "ordinances" && state.data.items.length > 1 && (
            <div className="rounded-card bg-soft mt-4 flex flex-wrap items-center gap-3 p-4">
              <p className="text-muted text-sm">
                지자체 두 곳의 자치법규를 골라 조문을 나란히 볼 수 있어요. ({picked.length}/2)
              </p>
              {picked.length === 2 && (
                <Link
                  href={`/ordinances/compare?a=${picked[0]}&b=${picked[1]}`}
                  className="rounded-button border-line text-ink flex min-h-11 items-center border bg-white px-4 text-sm font-semibold"
                >
                  나란히 보기 →
                </Link>
              )}
            </div>
          )}
          {state.data.items.length === 0 ? (
            <div className="mt-6">
              <p className="text-ink text-[15px]">
                &lsquo;{state.q}&rsquo;로 찾은 {tab === "cases" ? "판례가" : "결과가"} 없어요. 다른
                말로 바꿔 검색해 보세요.
              </p>
              {tab === "cases" && (
                <div className="mt-4">
                  <QuickButtons onPick={quick} />
                </div>
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {state.data.items.map((c) => (
                <li
                  key={c.key}
                  className="rounded-card border-line flex flex-col gap-2 border bg-white p-5"
                >
                  {c.tags.length > 0 && (
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
                      <span className="bg-cream text-ink rounded-full px-2.5 py-0.5 font-semibold">
                        {c.tags[0]}
                      </span>
                      {c.tags.slice(1).map((t) => (
                        <span key={t} className="text-muted">
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                  {c.href ? (
                    <Link
                      href={c.href}
                      className="font-display text-ink text-[19px] leading-snug font-bold underline-offset-2 hover:underline"
                    >
                      <Highlighted text={c.title} terms={terms} />
                    </Link>
                  ) : (
                    <p className="font-display text-ink text-[19px] leading-snug font-bold">
                      {c.title}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    {c.href && (
                      <Link
                        href={c.href}
                        aria-label={tab === "cases" ? "판시사항·요지 보기" : "내용 보기"}
                        className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
                      >
                        {tab === "cases" ? "판시사항·요지 보기 →" : "내용 보기 →"}
                      </Link>
                    )}
                    {c.sourceUrl && <OriginalLink url={c.sourceUrl} />}
                    {!c.sourceUrl && c.agencySite && (
                      <OriginalLink
                        url={c.agencySite.url}
                        label={`${c.agencySite.label} 사이트에서 번호로 찾기 ↗`}
                      />
                    )}
                    {c.compareId && (
                      <label className="text-muted inline-flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={picked.includes(c.compareId)}
                          onChange={() => toggle(c.compareId!)}
                          className="size-4"
                        />
                        비교에 담기
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <SearchCredit />
    </div>
  );
}
