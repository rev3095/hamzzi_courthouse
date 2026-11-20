// 앱 공통 화면 조각 (DEC-049): 안내 띠, 아래에서 올라오는 창, 답변 보기, 절차 순서.
// 답변은 인용 검증을 통과한 문단만 보여 준다(절대 규칙 1). 승패·유불리를 말하는 표시는 없다(절대 규칙 2).
import { useEffect, useState, type ReactNode } from "react";
import type { DemoAnalysisResult } from "@/lib/citations/policy";
import { hasTimeline, type ProcedurePlan } from "@/lib/procedure/policy";
import { DIFFICULTY_LABEL, PROCEDURE_NOTICE, type OfficialLink } from "@/lib/procedure/steps";
import { Icon } from "./ornament";

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="notice">
      <Icon name="shield" size={14} />
      <span>{children}</span>
    </p>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

/** 바깥 링크. 인터넷이 없으면 누를 수 없는 글자로 보인다 */
export function Out({
  href,
  online,
  children,
  className = "out",
}: {
  href: string;
  online: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!online)
    return <span className={`${className} off`}>{children} · 인터넷 연결 뒤 열려요</span>;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <Icon name="link" size={14} />
    </a>
  );
}

/** 아래에서 올라오는 창 (확인·글쓰기). 브라우저 확인창을 쓰지 않는다 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-dim" aria-label="닫기" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="textbtn" onClick={onClose}>
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ"];

export function sourceLabel(source: string): string {
  if (source.startsWith("case:")) return `판례 ${source.slice("case:".length)}`;
  return source.replace(/^law:/, "").replace(/:/g, " ");
}

type Tab = "answer" | "laws" | "cases" | "check";

/** 답변 보기: 검증된 문단 · 근거 법령 · 판례 · 검증 기록 */
export function AnswerView({ result, online }: { result: DemoAnalysisResult; online: boolean }) {
  const searchOnly = result.mode === "search_only";
  // AI 답변 없이 검색 결과만 있을 때는 찾은 법령부터 보여 준다
  const [tab, setTab] = useState<Tab>(searchOnly ? "laws" : "answer");
  const points = result.answer.points.filter((p) => p.check === "verified");
  const usedArticles = result.articles.filter((a) => a.used);
  const tabs: [Tab, string][] = [
    ["answer", "답변"],
    ["laws", `법령 ${result.articles.length}`],
    ["cases", `판례 ${result.cases.length}`],
    ["check", "검증"],
  ];
  return (
    <div className="answer">
      <div className="seg" role="tablist" aria-label="답변 보기">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "on" : ""}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "answer" && (
        <div className="stack">
          {points.length === 0 && (
            <p className="muted">
              {searchOnly
                ? "지금은 AI 답변 없이 법제처에서 찾은 법령과 판례만 보여 드려요. 옆 탭에서 볼 수 있어요."
                : "근거를 확인한 문단이 없어 답변 문단을 싣지 않았어요. 찾은 법령과 판례는 옆 탭에서 볼 수 있어요."}
            </p>
          )}
          {points.map((p, i) => (
            <article key={i} className="stele">
              <span className="numeral" aria-hidden="true">
                {ROMAN[i] ?? i + 1}
              </span>
              <p>{p.text}</p>
              {p.quote && <blockquote>{p.quote}</blockquote>}
              <p className="cite">
                <Icon name="check" size={13} />
                근거 확인 · {sourceLabel(p.source)}
              </p>
            </article>
          ))}
          {points.length > 0 && (
            <p className="muted small">
              근거 법령 {usedArticles.length}건 · 판례 {result.cases.filter((c) => c.used).length}
              건을 인용했어요. 내 상황에 그대로 맞는지는 전문가와 확인해 주세요.
            </p>
          )}
        </div>
      )}

      {tab === "laws" && (
        <ul className="reflist">
          {result.articles.map((a) => (
            <li key={a.id}>
              <div>
                <b>
                  {a.lawName} {a.articleNo}
                </b>
                <span>{a.title}</span>
                {a.used && <em>답변에 씀</em>}
              </div>
              <Out href={a.sourceUrl} online={online} className="mini">
                법제처
              </Out>
            </li>
          ))}
          {result.articles.length === 0 && <li className="muted">찾은 조문이 없어요.</li>}
        </ul>
      )}

      {tab === "cases" && (
        <ul className="reflist">
          {result.cases.map((c) => (
            <li key={c.id}>
              <div>
                <b>
                  {c.court} {c.caseNo}
                </b>
                <span>
                  {c.caseName}
                  {c.decidedAt ? ` · ${c.decidedAt}` : ""}
                </span>
                {c.used && <em>답변에 씀</em>}
              </div>
              <Out href={c.sourceUrl} online={online} className="mini">
                법제처
              </Out>
            </li>
          ))}
          {result.cases.length === 0 && <li className="muted">찾은 판례가 없어요.</li>}
        </ul>
      )}

      {tab === "check" && (
        <div className="stack">
          <p className="muted small">
            답변에 나온 조문·사건번호를 법제처에서 다시 조회해 실제로 있는지 확인한 기록이에요.
          </p>
          <ul className="reflist">
            {result.recheck.items.map((it) => (
              <li key={it.citation}>
                <div>
                  <b>{it.citation}</b>
                  <span>{it.exists ? "법제처에서 확인됨" : "확인되지 않아 답변에서 뺌"}</span>
                </div>
              </li>
            ))}
          </ul>
          {result.recheck.removed > 0 && (
            <p className="muted small">
              근거를 확인하지 못한 문단 {result.recheck.removed}개는 싣지 않았어요.
            </p>
          )}
          <p className="muted small">{result.searchScopeNote}</p>
        </div>
      )}
    </div>
  );
}

function Links({ links, online }: { links: OfficialLink[]; online: boolean }) {
  if (links.length === 0) return null;
  return (
    <div className="links">
      {links.map((l) => (
        <Out key={l.url + l.label} href={l.url} online={online}>
          {l.label}
        </Out>
      ))}
    </div>
  );
}

/** 절차 순서 (규칙으로 고른 고정 문안, 사건 결과를 판단하지 않는다) */
export function PlanView({ plan, online }: { plan: ProcedurePlan; online: boolean }) {
  if (!hasTimeline(plan)) {
    return (
      <section className="card">
        <h2>{plan.title}</h2>
        <p>{plan.body}</p>
        <Links links={plan.links} online={online} />
      </section>
    );
  }
  return (
    <section className="card">
      <Eyebrow>절차 순서 · {PROCEDURE_NOTICE}</Eyebrow>
      <h2>
        {plan.section} · {plan.title}
      </h2>
      <p className="muted">{plan.reason}</p>
      {plan.note && <p className="note">{plan.note}</p>}
      <ol className="timeline">
        {plan.steps.map((s, i) => {
          const rec = s.key === plan.recommended.key;
          return (
            <li key={s.key} className={rec ? "rec" : ""}>
              <span className="drum" aria-hidden="true">
                {i + 1}
              </span>
              <details open={rec}>
                <summary>
                  <span className="step">{s.label}</span>
                  <span className="badges">
                    <span className={`badge d-${s.difficulty}`}>
                      {DIFFICULTY_LABEL[s.difficulty]}
                    </span>
                    {rec && <span className="badge gold">먼저 볼 단계</span>}
                  </span>
                </summary>
                {s.prepare.length > 0 && (
                  <>
                    <h4>준비할 것</h4>
                    <ul>
                      {s.prepare.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
                {s.cautions.length > 0 && (
                  <>
                    <h4>주의할 점</h4>
                    <ul>
                      {s.cautions.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
                <Links links={s.links} online={online} />
              </details>
            </li>
          );
        })}
      </ol>
      <p className="muted small">규칙에 따라 고른 안내이며 사건 결과를 판단한 것이 아니에요.</p>
    </section>
  );
}

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
