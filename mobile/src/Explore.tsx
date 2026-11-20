// 판례·법령 탐색 (F-003·F-004, DEC-029). 서버에 닿으면 법제처 실시간 검색(웹과 같은 API), 닿지 않으면 기기 안 서고
// (검증된 예시가 근거로 쓴 조문·판례 목록)를 찾는다. AI를 쓰지 않는다 — 관련도·유불리 판정이 없다.
// 검색어는 요청 본문으로만 보내고 주소·기기에 남기지 않는다.
import { useEffect, useState, type FormEvent } from "react";
import { SEARCH_NOTICE } from "@/lib/api/respond";
import { WEB_URL } from "@/lib/reader/source";
import {
  errorText,
  getCase,
  getLawArticles,
  searchAdminRules,
  searchCases,
  searchDecisions,
  searchOrdinances,
  type AdminRuleRef,
  type ApiError,
  type CaseDetail,
  type CaseRef,
  type DecisionRef,
  type LawArticles,
  type OrdinanceRef,
} from "./api";
import { LIBRARY, exampleOf, searchLibrary } from "./library";
import type { Ctx } from "./nav";
import { Icon } from "./ornament";
import { Eyebrow, Notice, Out } from "./ui";

type Kind = "cases" | "laws" | "decisions" | "ordinances" | "rules";
const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "cases", label: "판례", hint: "예: 보증금 반환, 부당해고" },
  { key: "laws", label: "법령", hint: "예: 주택임대차보호법" },
  { key: "decisions", label: "법령해석례", hint: "예: 임대차, 공공임대주택" },
  { key: "ordinances", label: "자치법규", hint: "예: 주차장 조례" },
  { key: "rules", label: "행정규칙", hint: "예: 과태료 부과 기준" },
];

type Live =
  | { kind: "cases"; items: CaseRef[]; note: string }
  | { kind: "laws"; law: LawArticles }
  | { kind: "decisions"; items: DecisionRef[]; note: string }
  | { kind: "ordinances"; items: OrdinanceRef[]; note: string }
  | { kind: "rules"; items: AdminRuleRef[]; note: string };

export function ExploreScreen({ ctx }: { ctx: Ctx }) {
  const live = ctx.net === "live";
  const [kind, setKind] = useState<Kind>("cases");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Live | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const local = searchLibrary(q);
  const spec = KINDS.find((k) => k.key === kind)!;

  const pick = (k: Kind) => {
    setKind(k);
    setRes(null);
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!live || q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setRes(null);
    const term = q.trim();
    if (kind === "cases") {
      const r = await searchCases(term);
      if (r.ok) setRes({ kind, items: r.data.items, note: r.data.searchScopeNote });
      else setError(r.error);
    } else if (kind === "laws") {
      const r = await getLawArticles(term);
      if (r.ok) setRes({ kind, law: r.data });
      else setError(r.error);
    } else if (kind === "decisions") {
      const r = await searchDecisions("interpretation", term);
      if (r.ok) setRes({ kind, items: r.data.items, note: r.data.searchScopeNote });
      else setError(r.error);
    } else if (kind === "ordinances") {
      const r = await searchOrdinances(term);
      if (r.ok) setRes({ kind, items: r.data.items, note: r.data.searchScopeNote });
      else setError(r.error);
    } else {
      const r = await searchAdminRules(term);
      if (r.ok) setRes({ kind, items: r.data.items, note: r.data.searchScopeNote });
      else setError(r.error);
    }
    setBusy(false);
  };

  const localOnly = !live && kind !== "cases" && kind !== "laws";

  return (
    <>
      <header className="page-head">
        <Eyebrow>ΒΙΒΛΙΟΘΗΚΗ · 서고</Eyebrow>
        <h1>판례·법령 탐색</h1>
        <p className="muted">
          {live
            ? "법제처 국가법령정보센터에서 바로 찾아요."
            : `지금은 기기 안 서고에서 찾아요. 검증된 예시가 근거로 쓴 조문 ${LIBRARY.articles.length}개와 판례 ${LIBRARY.cases.length}건이 들어 있어요.`}
        </p>
      </header>

      <div className="chips" role="tablist" aria-label="자료 종류">
        {KINDS.map((k) => (
          <button
            key={k.key}
            role="tab"
            aria-selected={kind === k.key}
            className={kind === k.key ? "on" : ""}
            onClick={() => pick(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <form className="searchbar" onSubmit={submit}>
        <label className="sr" htmlFor="q">
          검색어
        </label>
        <Icon name="search" size={18} />
        <input
          id="q"
          value={q}
          maxLength={80}
          placeholder={spec.hint}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        {live && (
          <button className="primary sm" disabled={busy || q.trim().length < 2}>
            {busy ? "찾는 중" : "찾기"}
          </button>
        )}
      </form>

      {error && (
        <p role="alert" className="warn">
          {errorText(error)}
        </p>
      )}

      {localOnly && (
        <section className="card soft">
          <h2>{spec.label}는 실시간 연결이 필요해요</h2>
          <p className="muted">
            서버에 닿으면 이 화면에서 바로 찾을 수 있어요. 지금은 웹에서 찾아볼 수 있어요.
          </p>
          <Out href={`${WEB_URL}/search`} online={ctx.online}>
            햄찌법원 웹 검색 열기
          </Out>
        </section>
      )}

      {/* 실시간 결과 */}
      {live && res?.kind === "cases" && (
        <ResultList note={res.note} empty={res.items.length === 0}>
          {res.items.map((c) => (
            <li key={c.id}>
              <button
                className="refbtn"
                onClick={() => ctx.go({ name: "case", ref: c, back: { name: "explore" } })}
              >
                <b>
                  {c.court} {c.caseNo}
                </b>
                <span>
                  {c.caseName}
                  {c.decidedAt ? ` · ${c.decidedAt}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ResultList>
      )}
      {live && res?.kind === "laws" && (
        <section className="card">
          <Eyebrow>법령</Eyebrow>
          <h2>{res.law.lawName}</h2>
          <Out href={res.law.sourceUrl} online={ctx.online}>
            법제처에서 전체 보기
          </Out>
          <div className="articles">
            {res.law.articles.slice(0, 60).map((a) => (
              <details key={a.articleNo}>
                <summary>
                  <b>{a.articleNo}</b> {a.title}
                </summary>
                <p>{a.text}</p>
              </details>
            ))}
          </div>
          {res.law.articles.length > 60 && (
            <p className="muted small">
              앞의 조문 60개만 보여 드려요. 나머지는 법제처에서 볼 수 있어요.
            </p>
          )}
        </section>
      )}
      {live &&
        res &&
        (res.kind === "decisions" || res.kind === "ordinances" || res.kind === "rules") && (
          <ResultList note={res.note} empty={res.items.length === 0}>
            {res.kind === "decisions" &&
              res.items.map((d) => (
                <li key={d.id} className="refrow">
                  <div>
                    <b>{d.title}</b>
                    <span>{[d.agency, d.refNo, d.decidedAt].filter(Boolean).join(" · ")}</span>
                  </div>
                  {d.sourceUrl && (
                    <Out href={d.sourceUrl} online={ctx.online} className="mini">
                      법제처
                    </Out>
                  )}
                </li>
              ))}
            {res.kind === "ordinances" &&
              res.items.map((o) => (
                <li key={o.id} className="refrow">
                  <div>
                    <b>{o.name}</b>
                    <span>{o.region ?? "자치법규"}</span>
                  </div>
                  <Out href={o.sourceUrl} online={ctx.online} className="mini">
                    법제처
                  </Out>
                </li>
              ))}
            {res.kind === "rules" &&
              res.items.map((o) => (
                <li key={o.id} className="refrow">
                  <div>
                    <b>{o.name}</b>
                    <span>{o.agency ?? "행정규칙"}</span>
                  </div>
                  <Out href={o.sourceUrl} online={ctx.online} className="mini">
                    법제처
                  </Out>
                </li>
              ))}
          </ResultList>
        )}

      {/* 기기 안 서고: 실시간 결과가 없을 때 판례·법령 */}
      {!res && kind === "cases" && (
        <section className="card">
          <Eyebrow>{live ? "기기 안 서고" : `찾은 판례 ${local.cases.length}건`}</Eyebrow>
          <h2>예시가 살펴본 판례</h2>
          <ul className="reflist">
            {local.cases.slice(0, 40).map((c) => (
              <li key={c.id}>
                <div>
                  <b>
                    {c.court} {c.caseNo}
                  </b>
                  <span>
                    {c.caseName}
                    {c.decidedAt ? ` · ${c.decidedAt}` : ""}
                  </span>
                  <button
                    className="textbtn"
                    onClick={() =>
                      ctx.go({ name: "example", id: c.examples[0], back: { name: "explore" } })
                    }
                  >
                    이 판례를 살펴본 예시 보기
                  </button>
                </div>
                <Out href={c.sourceUrl} online={ctx.online} className="mini">
                  법제처
                </Out>
              </li>
            ))}
            {local.cases.length === 0 && (
              <li className="muted">기기 안 서고에는 맞는 판례가 없어요.</li>
            )}
          </ul>
        </section>
      )}
      {!res && kind === "laws" && (
        <section className="card">
          <Eyebrow>{live ? "기기 안 서고" : `찾은 조문 ${local.articles.length}개`}</Eyebrow>
          <h2>예시가 근거로 쓴 조문</h2>
          <ul className="reflist">
            {local.articles.slice(0, 50).map((a) => (
              <li key={a.id}>
                <div>
                  <b>
                    {a.lawName} {a.articleNo}
                  </b>
                  <span>{a.title}</span>
                  {a.quotes[0] && <q>{a.quotes[0]}</q>}
                  {a.examples[0] && exampleOf(a.examples[0]) && (
                    <button
                      className="textbtn"
                      onClick={() =>
                        ctx.go({ name: "example", id: a.examples[0], back: { name: "explore" } })
                      }
                    >
                      이 조문을 쓴 예시 보기
                    </button>
                  )}
                </div>
                <Out href={a.sourceUrl} online={ctx.online} className="mini">
                  법제처
                </Out>
              </li>
            ))}
            {local.articles.length === 0 && (
              <li className="muted">기기 안 서고에는 맞는 조문이 없어요.</li>
            )}
          </ul>
        </section>
      )}

      <Notice>{SEARCH_NOTICE}</Notice>
    </>
  );
}

function ResultList({
  note,
  empty,
  children,
}: {
  note: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <Eyebrow>법제처 검색 결과</Eyebrow>
      {empty ? (
        <p className="muted">찾은 자료가 없어요. 다른 낱말로 찾아보세요.</p>
      ) : (
        <ul className="reflist">{children}</ul>
      )}
      <p className="muted small">{note}</p>
    </section>
  );
}

/** 판례 상세: 법제처에서 가져온 요지 항목만 보여 준다 (본문을 저장하지 않는다, DEC-007) */
export function CaseScreen({
  ctx,
  caseRef,
  onBack,
}: {
  ctx: Ctx;
  caseRef: CaseRef;
  onBack: () => void;
}) {
  const [d, setD] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let on = true;
    void getCase(caseRef.id).then((r) => {
      if (!on) return;
      if (r.ok) setD(r.data);
      else setError(r.error);
    });
    return () => {
      on = false;
    };
  }, [caseRef.id]);
  return (
    <>
      <button className="backlink" onClick={onBack}>
        <Icon name="back" size={16} /> 검색 결과
      </button>
      <section className="card lead">
        <Eyebrow>
          {caseRef.court} · {caseRef.decidedAt ?? "선고일 미상"}
        </Eyebrow>
        <h1>{caseRef.caseNo}</h1>
        <p>{caseRef.caseName}</p>
        <Out href={caseRef.sourceUrl} online={ctx.online}>
          법제처에서 원문 보기
        </Out>
      </section>
      {!d && !error && <p className="muted">불러오는 중…</p>}
      {error && (
        <p role="alert" className="warn">
          {errorText(error)}
        </p>
      )}
      {d && (
        <section className="card">
          {d.holdingSummary && (
            <>
              <h2>판결 요지</h2>
              <p className="pre">{d.holdingSummary}</p>
            </>
          )}
          {d.sections.map((s) => (
            <div key={s.section}>
              <h3>{s.section}</h3>
              <p className="pre">{s.text}</p>
            </div>
          ))}
          <Notice>{d.notice}</Notice>
        </section>
      )}
    </>
  );
}
