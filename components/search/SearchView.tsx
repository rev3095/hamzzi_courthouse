"use client";
// 검색 화면 /search (F-003, DEC-026 제안). 질문 3회와 별개 (DEC-017 제안). 관련도 점수는 보이지 않는다 (PRD 8.3).
// 종류 탭: 판례 · 법령해석례 · 헌재 결정례 · 조세심판 재결례 · 관세청 해석 · 자치법규 · 행정규칙.
// "민법 750조"·사건번호처럼 대상이 분명한 입력은 목록 대신 그 조문·판례로 바로 간다.
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { directTarget } from "@/lib/search/explore";
import { dotDate } from "../result/labels";
import { QuestionBox } from "../ask/QuestionBox";
import { OriginalLink, RecentList, SearchCredit, SearchNotice, searchErrorText } from "./parts";

type Kind = "cases" | DecisionDomain | "ordinances" | "admin_rules";

const KINDS: { kind: Kind; label: string; placeholder: string }[] = [
  { kind: "cases", label: "판례", placeholder: "예: 임대차 보증금 반환, 민법 750조, 2023다12345" },
  { kind: "interpretation", label: "법령해석례", placeholder: "예: 임대차, 공공임대주택" },
  { kind: "constitutional", label: "헌재 결정례", placeholder: "예: 임대차보호법, 재산권" },
  { kind: "tax_tribunal", label: "조세심판 재결례", placeholder: "예: 양도소득세, 증여" },
  { kind: "customs", label: "관세청 해석", placeholder: "예: 과세가격, 원산지" },
  { kind: "ordinances", label: "자치법규", placeholder: "예: 출산장려금, 주차장 설치" },
  { kind: "admin_rules", label: "행정규칙", placeholder: "예: 임대차, 최저임금 고시" },
];

type Item = {
  key: string;
  href: string | null;
  title: string;
  sub: string;
  sourceUrl: string | null;
  /** 자치법규만: 나란히 비교에 쓰는 번호 */
  compareId?: string;
};
type Result = { items: Item[]; notice: string; searchScopeNote: string };

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

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
          href: `/cases/${c.id}`,
          title: c.caseName || c.caseNo,
          sub: join(c.court, dotDate(c.decidedAt), c.caseNo),
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
          sub: join(o.region, o.kind, o.effectiveFrom && `시행 ${dotDate(o.effectiveFrom)}`),
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
          sub: join(a.agency, a.kind, a.effectiveFrom && `시행 ${dotDate(a.effectiveFrom)}`),
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
        href: `/decisions/${d.domain}/${d.id}`,
        title: d.title,
        sub: join(d.agency, dotDate(d.decidedAt), d.refNo),
        sourceUrl: d.sourceUrl,
      })),
    },
  };
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; q: string; data: Result }
  | { kind: "error"; error: ClientError };

export function SearchView() {
  const router = useRouter();
  const [tab, setTab] = useState<Kind>("cases");
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [picked, setPicked] = useState<string[]>([]);
  const spec = KINDS.find((k) => k.kind === tab)!;

  // 검색어는 주소(?q=)에 두지 않는다 — 브라우저 기록·접속 기록에 남지 않게 (F-007)
  const submit = async (kind: Kind = tab) => {
    const q = text.trim();
    if (!q) {
      setState({ kind: "error", error: { code: "EMPTY_INPUT", message: "" } });
      return;
    }
    const direct = directTarget(q);
    if (direct?.kind === "statute") {
      router.push(`/statutes/${encodeURIComponent(direct.id)}`);
      return;
    }
    setPicked([]);
    setState({ kind: "loading" });
    const r = await run(direct?.kind === "case" ? "cases" : kind, q);
    if (!r.ok) {
      setState({ kind: "error", error: r.error });
      return;
    }
    // 사건번호로 한 건만 나오면 그 판례로 바로 간다
    if (direct?.kind === "case" && r.data.items.length === 1 && r.data.items[0].href) {
      router.push(r.data.items[0].href);
      return;
    }
    setState({ kind: "done", q, data: r.data });
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 lg:py-12">
      <h1 className="font-display text-ink text-[28px] font-bold">판례·법령 검색</h1>
      <p className="text-muted mt-2 text-[15px] leading-relaxed">
        국가법령정보센터(법제처)에서 판례·해석례·재결례·자치법규를 바로 찾아요. 검색은 질문 3번과
        따로 세요.
      </p>
      <div
        role="tablist"
        aria-label="검색 종류"
        className="mt-6 flex gap-2 overflow-x-auto pb-1 whitespace-nowrap"
      >
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={tab === k.kind}
            onClick={() => {
              setTab(k.kind);
              if (text.trim() && state.kind !== "idle") void submit(k.kind);
            }}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
              tab === k.kind
                ? "border-gold bg-cream text-ink"
                : "border-line text-muted hover:border-gold bg-white"
            }`}
          >
            {k.label}
          </button>
        ))}
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
        <p className="text-muted mt-2 text-[13px] leading-relaxed">
          &lsquo;민법 750조&rsquo;처럼 법령 이름(약칭도 돼요)과 조문 번호를 적거나 사건번호를 적으면
          바로 열어요. 이름·전화번호 같은 개인정보는 검색어에 넣지 말아 주세요.
        </p>
      </div>

      {state.kind === "idle" && <RecentList />}
      {state.kind === "error" && (
        <p role="alert" className="text-warn-text mt-6 text-[15px]">
          {searchErrorText(state.error)}
        </p>
      )}
      {state.kind === "loading" && (
        <p aria-live="polite" className="text-muted mt-6 text-[15px]">
          법제처에서 찾고 있어요…
        </p>
      )}
      {state.kind === "done" && (
        <section aria-label="검색 결과" className="mt-8">
          <SearchNotice notice={state.data.notice} />
          <p className="text-muted mt-3 text-sm leading-relaxed">{state.data.searchScopeNote}</p>
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
            <p className="text-ink mt-6 text-[15px]">
              &lsquo;{state.q}&rsquo;로 찾은 결과가 없어요. 다른 말로 바꿔 검색해 보세요.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {state.data.items.map((c) => (
                <li
                  key={c.key}
                  className="rounded-card border-line flex flex-col gap-1.5 border bg-white p-5"
                >
                  {c.href ? (
                    <Link
                      href={c.href}
                      className="font-display text-ink text-base leading-snug font-bold underline-offset-2 hover:underline"
                    >
                      {c.title}
                    </Link>
                  ) : (
                    <p className="font-display text-ink text-base leading-snug font-bold">
                      {c.title}
                    </p>
                  )}
                  {c.sub && <p className="text-muted text-[13px]">{c.sub}</p>}
                  <div className="flex flex-wrap items-center gap-4">
                    {c.href && (
                      <Link
                        href={c.href}
                        className="text-link inline-flex min-h-11 items-center text-sm underline-offset-2 hover:underline"
                      >
                        요지·조문 보기 →
                      </Link>
                    )}
                    {c.sourceUrl && <OriginalLink url={c.sourceUrl} />}
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
