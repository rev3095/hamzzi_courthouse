// 절차와 서식 (F-014 DEC-021, DEC-022·025). 분야별 절차 순서는 규칙으로 고른 고정 문안이고 인터넷 없이 열린다.
// 서식은 공식 기관 서식 안내와 작성 요령을 보여 주고, 작성 화면은 웹에서 연다(DEC-055 무료 AI 대리 작성, 게이트 없음).
import { useState } from "react";
import { DOCUMENT_KINDS, DOCUMENT_NOTICE, DOCUMENT_SPECS } from "@/lib/documents/policy";
import { CATEGORIES, CATEGORY_GROUPS, type CategoryKey } from "@/lib/procedure/categories";
import { procedurePlan } from "@/lib/procedure/policy";
import { PROCEDURE_NOTICE, type DocumentKind } from "@/lib/procedure/steps";
import { WEB_URL } from "@/lib/reader/source";
import { EXAMPLES, categoryOfExample } from "./library";
import type { Ctx } from "./nav";
import { Divider, Icon } from "./ornament";
import { Eyebrow, Notice, Out, PlanView } from "./ui";

const EMPTY = { intent: { area: "", goal: "", laws: [], lawKeywords: [] }, articles: [] };

export function GuideScreen({ ctx }: { ctx: Ctx }) {
  const [group, setGroup] = useState(CATEGORY_GROUPS[0].key);
  return (
    <>
      <header className="page-head">
        <Eyebrow>ΣΤΟΑ · 회랑</Eyebrow>
        <h1>절차와 서식</h1>
        <p className="muted">
          분야를 고르면 비슷한 일이 보통 거치는 절차 순서와 준비할 것을 보여 드려요. 인터넷 없이도
          열려요.
        </p>
      </header>

      <div className="chips" role="tablist" aria-label="분야 묶음">
        {CATEGORY_GROUPS.map((g) => (
          <button
            key={g.key}
            role="tab"
            aria-selected={group === g.key}
            className={group === g.key ? "on" : ""}
            onClick={() => setGroup(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="tiles">
        {CATEGORY_GROUPS.find((g) => g.key === group)!.keys.map((k) => (
          <button key={k} className="tile" onClick={() => ctx.go({ name: "track", category: k })}>
            <b>{CATEGORIES[k].label}</b>
            <span>{CATEGORIES[k].description}</span>
          </button>
        ))}
      </div>

      <Divider />

      <section>
        <Eyebrow>공식 기관 서식 {DOCUMENT_KINDS.length}종</Eyebrow>
        <h2 className="h">단계별 서식</h2>
        <div className="doclist">
          {DOCUMENT_KINDS.map((k) => (
            <button key={k} onClick={() => ctx.go({ name: "doc", kind: k })}>
              <Icon name="pen" size={18} />
              <span>
                <b>{DOCUMENT_SPECS[k].title}</b>
                <i>{DOCUMENT_SPECS[k].intro}</i>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      </section>
      <Notice>{PROCEDURE_NOTICE} · 규칙으로 고른 안내이며 사건 결과를 판단하지 않아요.</Notice>
    </>
  );
}

export function TrackScreen({ ctx, category }: { ctx: Ctx; category: CategoryKey }) {
  const cat = CATEGORIES[category];
  const plan = procedurePlan(EMPTY as never, null, category);
  const examples = EXAMPLES.filter((e) => categoryOfExample(e.id) === category);
  return (
    <>
      <button className="backlink" onClick={() => ctx.go({ name: "guide" })}>
        <Icon name="back" size={16} /> 절차와 서식
      </button>
      <section className="card lead">
        <Eyebrow>분야</Eyebrow>
        <h1>{cat.label}</h1>
        <p>{cat.description}</p>
        <p className="muted small">{cat.guide}</p>
        {cat.lawHints && cat.lawHints.length > 0 && (
          <p className="muted small">
            기본 조문:{" "}
            {cat.lawHints.map((h) => `${h.lawName} ${h.articleNos.join("·")}`).join(", ")}
          </p>
        )}
      </section>
      <PlanView plan={plan} online={ctx.online} />
      {examples.length > 0 && (
        <section className="card">
          <Eyebrow>미리 검증해 둔 답변</Eyebrow>
          <h2>이 분야 예시 답변</h2>
          {examples.map((e) => (
            <button
              key={e.id}
              className="listbtn"
              onClick={() =>
                ctx.go({ name: "example", id: e.id, back: { name: "track", category } })
              }
            >
              {e.question}
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </section>
      )}
      <button className="primary block" onClick={() => ctx.go({ name: "home" })}>
        내 상황으로 질문하기
      </button>
    </>
  );
}

export function DocScreen({ ctx, kind }: { ctx: Ctx; kind: DocumentKind }) {
  const spec = DOCUMENT_SPECS[kind];
  return (
    <>
      <button className="backlink" onClick={() => ctx.go({ name: "guide" })}>
        <Icon name="back" size={16} /> 절차와 서식
      </button>
      <section className="card lead">
        <Eyebrow>서식 · {spec.stepLabel}</Eyebrow>
        <h1>{spec.title}</h1>
        <p>{spec.intro}</p>
      </section>
      <section className="card">
        <h2>작성 요령</h2>
        <ul className="checks">
          {spec.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>공식 서식과 창구</h2>
        <ul className="reflist">
          {spec.officialForms.map((f) => (
            <li key={f.name + f.url}>
              <div>
                <b>{f.name}</b>
                <span>{f.source}</span>
              </div>
              <Out href={f.url} online={ctx.online} className="mini">
                열기
              </Out>
            </li>
          ))}
        </ul>
        <div className="links">
          {spec.links.map((l) => (
            <Out key={l.url} href={l.url} online={ctx.online}>
              {l.label}
            </Out>
          ))}
        </div>
        {spec.basis.length > 0 && (
          <p className="muted small">항목 구성의 근거: {spec.basis.join(", ")}</p>
        )}
      </section>
      {spec.officialNotice && (
        <section className="card soft">
          <p>{spec.officialNotice.text}</p>
          <p className="muted small">출처: {spec.officialNotice.source}</p>
        </section>
      )}
      <Out href={`${WEB_URL}/documents/${kind}`} online={ctx.online} className="primary block">
        웹에서 작성 화면 열기
      </Out>
      <p className="muted small">
        적은 이름·주소는 저장하지 않아요. 웹 작성 화면에서 햄찌법원이 무료로 대신 작성해 드려요.
      </p>
      <Notice>{DOCUMENT_NOTICE}</Notice>
    </>
  );
}
