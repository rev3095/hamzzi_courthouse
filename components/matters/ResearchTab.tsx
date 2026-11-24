"use client";
// 사건 진행 — 리서치(서치하기) 탭 (F-016 AC4·AC5, DEC-053). 찾은 내용은 노트로 저장해 사건에 계속 덧붙인다.
// ① 기업 조사: 회사가 무엇을 하고 무엇을 팔며 어떻게 버는지 — 링크·홈페이지·기사를 AI가 읽어 출처와 함께 정리(평가 없음).
//    법인·사업자만 대상이고 개인은 조사하지 않는다. 읽지 못한 링크(자동 접근을 막은 블로그 등)는 본문을 붙여 넣게 안내한다.
// ② 법령·판례 찾기: 법제처 검색(모델 없음, 기존 판례 검색과 같은 API). ③ 붙여 넣은 글 줄이기(AI 요약).
import { useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { searchCases, type CaseRef } from "@/lib/client/api";
import {
  aiSkipText,
  matterErrorText,
  researchCompany,
  summarizeText,
  type CompanyResult,
} from "@/lib/client/matters";
import { COMPANY_LIMITS, companyNoteBody } from "@/lib/matters/policy";
import { newId, type MatterData, type MatterNote } from "@/lib/matters/model";
import { AiTag, Empty, Fold, Hover, SectionTitle, btn, btnLine, card, field, label } from "./ui";

export type ResearchSeed = { company?: { name: string; partyId: string }; query?: string };

export function ResearchTab({
  data,
  update,
  seed,
  onSaved,
}: {
  data: MatterData;
  update: (fn: (d: MatterData) => MatterData) => void;
  seed: ResearchSeed;
  onSaved: () => void;
}) {
  const addNote = (note: Omit<MatterNote, "id" | "at">) => {
    update((d) => ({
      ...d,
      notes: [...d.notes, { ...note, id: newId(), at: new Date().toISOString() }].slice(-200),
    }));
    onSaved();
  };
  const personNames = data.parties.filter((p) => p.kind === "person").map((p) => p.name);
  return (
    <div className="space-y-8">
      <CompanyResearch seed={seed.company} addNote={addNote} personNames={personNames} />
      <LawSearch seed={seed.query} addNote={addNote} />
      <Summarize personNames={personNames} addNote={addNote} />
    </div>
  );
}

type AddNote = (note: Omit<MatterNote, "id" | "at">) => void;

function CompanyResearch({
  seed,
  addNote,
  personNames,
}: {
  seed?: { name: string; partyId: string };
  addNote: AddNote;
  personNames: string[];
}) {
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState(seed?.name ?? "");
  const [links, setLinks] = useState("");
  const [pasted, setPasted] = useState("");
  const [state, setState] = useState<{
    busy: boolean;
    message: string | null;
    result: CompanyResult | null;
    saved: boolean;
  }>({
    busy: false,
    message: null,
    result: null,
    saved: false,
  });
  const urls = links
    .split(/\s+/)
    .map((u) => u.trim())
    .filter(Boolean);

  async function run() {
    setState({ busy: true, message: null, result: null, saved: false });
    const r = await researchCompany({ name: name.trim(), urls, pasted, personNames, consent });
    if (!r.ok) {
      if (r.error.code === "CONSENT_REQUIRED") {
        setConsent(true);
        return setState({
          busy: false,
          message:
            "붙여 넣은 글에 건강·범죄경력 같은 민감한 내용이 보여요. AI에게 보내려면 버튼을 한 번 더 눌러 주세요.",
          result: null,
          saved: false,
        });
      }
      const reason = r.error.details?.reason;
      const message =
        r.error.code === "VALIDATION_ERROR" && r.error.details?.fields?.toString() === "urls"
          ? `링크는 http로 시작하는 공개 주소 ${COMPANY_LIMITS.urls}개까지 넣을 수 있어요.`
          : matterErrorText(r.error.code, reason);
      return setState({ busy: false, message, result: null, saved: false });
    }
    setState({
      busy: false,
      message: r.data.ai.used ? null : aiSkipText(r.data.ai.reason),
      result: r.data,
      saved: false,
    });
  }

  const result = state.result;
  const report = result?.report ?? null;
  return (
    <section>
      <SectionTitle
        title="기업 조사"
        hint="무엇을 하는 회사인지, 주력 상품과 매출 방식을 공개 자료에서 찾아 출처와 함께 정리해요. 평가나 전망은 넣지 않아요."
      />
      <div className={`${card} mt-3 p-3`}>
        <label className="block">
          <span className={label}>회사 이름</span>
          <input
            className={`${field} mt-1`}
            value={name}
            maxLength={COMPANY_LIMITS.nameChars}
            placeholder="예: 주식회사 ○○"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="mt-2 block">
          <span className={label}>
            참고할 링크 (선택, {COMPANY_LIMITS.urls}개까지 · 한 줄에 하나)
          </span>
          <textarea
            className={`${field} mt-1`}
            rows={2}
            value={links}
            placeholder="회사 홈페이지, 소개 글, 기사 주소"
            onChange={(e) => setLinks(e.target.value)}
          />
        </label>
        <Fold summary="읽히지 않는 글은 본문을 붙여 넣기 (선택)">
          <textarea
            className={field}
            rows={4}
            value={pasted}
            maxLength={COMPANY_LIMITS.pastedChars}
            placeholder="네이버 블로그처럼 자동으로 읽을 수 없는 글은 본문을 복사해 붙여 주세요. 이름·연락처는 가린 뒤 AI에게 보내요."
            onChange={(e) => setPasted(e.target.value)}
            aria-label="붙여 넣은 글"
          />
        </Fold>
        <button
          type="button"
          className={`${btn} mt-1`}
          disabled={state.busy || name.trim().length < 2 || urls.length > COMPANY_LIMITS.urls}
          onClick={() => void run()}
        >
          {state.busy ? "찾는 중… (1~2분)" : "기업 조사 (AI)"}
        </button>
        <span className="text-muted ml-2 text-[12px]">
          회사만 조사해요. 개인은 조사하지 않아요.
        </span>
        {state.message && (
          <p role="alert" className="text-ink mt-2 text-[13px] font-semibold">
            {state.message}
          </p>
        )}
      </div>

      {result && (
        <div className={`${card} mt-3 px-4 py-3`} data-testid="company-result">
          {report && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink text-[16px] font-bold">{name.trim()}</p>
                <span className="flex items-center gap-2">
                  {result.notice && <AiTag notice={result.notice} />}
                  <button
                    type="button"
                    className={btnLine}
                    disabled={state.saved}
                    onClick={() => {
                      addNote({
                        title: `${name.trim()} 기업 조사`,
                        body: companyNoteBody(report),
                        kind: "company",
                        refs: seed && seed.name === name.trim() ? [seed.partyId] : [],
                        sources: [...result.sources, ...result.found].slice(0, 20),
                        byAi: true,
                      });
                      setState((s) => ({ ...s, saved: true }));
                    }}
                  >
                    {state.saved ? "노트에 저장했어요" : "노트로 저장"}
                  </button>
                </span>
              </div>
              <p className="text-muted mt-0.5 text-[12px]">{result.sourceNotice}</p>
              <dl className="mt-2 space-y-2">
                <Row title="무엇을 하는 회사인가" text={report.overview} />
                <Row title="주력 제품·서비스" items={report.products} />
                <Row title="매출·판매 방식" text={report.business} />
                <Row title="핵심 기술·아이템" items={report.items} />
                <Row title="기본 정보" items={report.basics} />
              </dl>
              {report.unknowns.length > 0 && (
                <Fold summary={`자료에서 확인하지 못한 것 ${report.unknowns.length}`}>
                  <ul className="text-ink list-disc space-y-1 pl-5 text-[13px] leading-relaxed">
                    {report.unknowns.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </Fold>
              )}
            </>
          )}
          {result.unread.length > 0 && (
            <p
              role="status"
              className="border-ink text-ink mt-2 rounded-[6px] border px-3 py-2 text-[13px] leading-relaxed"
            >
              읽지 못한 링크가 있어요: {result.unread.join(", ")}. 자동으로 읽는 것을 막아 둔
              사이트일 수 있어요. 본문을 복사해 위의 붙여 넣기 칸에 넣고 다시 조사해 주세요.
            </p>
          )}
          <Fold summary={`읽은 페이지 ${result.sources.length}`} open={result.sources.length > 0}>
            <SourceList items={result.sources} empty="읽은 웹 페이지가 없어요." />
          </Fold>
          {result.found.length > 0 && (
            <Fold summary={`검색에서 나온 페이지 ${result.found.length}`}>
              <p className="text-muted text-[12px]">
                검색 결과에 나온 주소예요. 모두 읽었다는 뜻은 아니에요.
              </p>
              <SourceList items={result.found} empty="" />
            </Fold>
          )}
          <Fold summary="공식 자료·바로 가기">
            <Official result={result} />
          </Fold>
        </div>
      )}
    </section>
  );
}

function SourceList({ items, empty }: { items: { title: string; url: string }[]; empty: string }) {
  if (items.length === 0) return empty ? <p className="text-muted text-[13px]">{empty}</p> : null;
  return (
    <ul className="space-y-1">
      {items.map((s) => (
        <li key={s.url} className="text-[13px]">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink underline">
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Row({ title, text, items }: { title: string; text?: string; items?: string[] }) {
  if (!text && (!items || items.length === 0)) return null;
  return (
    <div>
      <dt className={label}>{title}</dt>
      <dd className="text-ink mt-0.5 text-[14px] leading-relaxed">
        {text}
        {items && (
          <ul className="list-disc space-y-0.5 pl-5">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  );
}

function Official({ result }: { result: CompanyResult }) {
  const { places, corps, blogs } = result.official;
  const noKey = [places, corps, blogs].every((s) => s.status === "no_key");
  return (
    <div className="text-[13px] leading-relaxed">
      {noKey && (
        <p className="text-muted">공식 검색 API 키가 아직 설정되지 않아 바로 가기만 보여 드려요.</p>
      )}
      {corps.items.map((c, i) => (
        <p key={`c${i}`} className="text-ink">
          {c.corpName}
          <span className="text-muted">
            {[c.industry, c.establishedAt && `설립 ${c.establishedAt}`]
              .filter(Boolean)
              .map((v) => ` · ${v}`)
              .join("")}{" "}
            (금융위원회 공공데이터)
          </span>
        </p>
      ))}
      {places.items.map((p, i) => (
        <p key={`p${i}`} className="text-ink">
          {p.title}
          <span className="text-muted">
            {p.category ? ` · ${p.category}` : ""} (네이버 지역 검색)
          </span>
        </p>
      ))}
      {blogs.items.map((b, i) => (
        <p key={`b${i}`} className="text-ink">
          <Hover panel={<>{b.description || "요약문이 없어요."}</>}>{b.title}</Hover>
          {b.link && (
            <>
              {" "}
              <a href={b.link} target="_blank" rel="noopener noreferrer" className="underline">
                글 열기
              </a>
            </>
          )}
          <span className="text-muted"> (네이버 블로그 검색 · 요약문만)</span>
        </p>
      ))}
      <ul className="mt-1 flex flex-wrap gap-x-4">
        {result.links.map((l) => (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink inline-flex min-h-10 items-center underline"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LawSearch({ seed, addNote }: { seed?: string; addNote: AddNote }) {
  const [q, setQ] = useState(seed ?? "");
  const [state, setState] = useState<{
    busy: boolean;
    message: string | null;
    items: CaseRef[];
    notice: string | null;
    saved: string[];
  }>({
    busy: false,
    message: null,
    items: [],
    notice: null,
    saved: [],
  });
  async function run() {
    setState((s) => ({ ...s, busy: true, message: null }));
    const r = await searchCases(q.trim());
    if (!r.ok) {
      return setState({
        busy: false,
        message: "지금은 찾지 못했어요. 검색어를 바꾸거나 잠시 뒤에 다시 해 주세요.",
        items: [],
        notice: null,
        saved: [],
      });
    }
    setState({
      busy: false,
      message:
        r.data.items.length === 0
          ? "찾은 판례가 없어요. 법률 용어 두세 낱말로 다시 찾아 보세요."
          : null,
      items: r.data.items,
      notice: r.data.notice,
      saved: [],
    });
  }
  return (
    <section>
      <SectionTitle
        title="법령·판례 찾기"
        hint="법제처 판례 검색이에요(AI 없음). 필요한 판례는 노트에 붙여 두세요. 조문·결정문까지 보려면 판례 검색 화면을 쓰세요."
        right={
          <a href="/search" target="_blank" className={btnLine + " inline-flex items-center"}>
            판례 검색 화면 열기
          </a>
        }
      />
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) void run();
        }}
      >
        <input
          className={field}
          value={q}
          maxLength={60}
          placeholder="예: 개인정보 처리 위탁 손해배상"
          onChange={(e) => setQ(e.target.value)}
          aria-label="판례 검색어"
        />
        <button type="submit" className={btn} disabled={state.busy || q.trim().length < 2}>
          {state.busy ? "찾는 중…" : "찾기"}
        </button>
      </form>
      {state.message && (
        <p role="status" className="text-ink mt-2 text-[13px]">
          {state.message}
        </p>
      )}
      {state.items.length > 0 && (
        <>
          {state.notice && <p className="text-muted mt-2 text-[12px]">{state.notice}</p>}
          <ul className={`${card} mt-1 divide-y divide-[var(--line)]`}>
            {state.items.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink min-w-0 flex-1 text-[14px] underline-offset-2 hover:underline"
                >
                  <span className="font-semibold">{c.caseName}</span>
                  <span className="text-muted block text-[12px]">
                    {[c.court, c.caseNo, c.decidedAt].filter(Boolean).join(" · ")}
                  </span>
                </a>
                <button
                  type="button"
                  className={btnLine}
                  disabled={state.saved.includes(c.id)}
                  onClick={() => {
                    addNote({
                      title: `${c.court} ${c.caseNo}`,
                      body: `${c.caseName}\n${[c.court, c.caseNo, c.decidedAt].filter(Boolean).join(" · ")}\n(법제처 검색 결과 · 원문에서 내용을 확인하세요)`,
                      kind: "search",
                      refs: [],
                      sources: [{ title: `${c.court} ${c.caseNo} 원문`, url: c.sourceUrl }],
                      byAi: false,
                    });
                    setState((s) => ({ ...s, saved: [...s.saved, c.id] }));
                  }}
                >
                  {state.saved.includes(c.id) ? "붙였어요" : "노트에 붙이기"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Summarize({ personNames, addNote }: { personNames: string[]; addNote: AddNote }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [state, setState] = useState<{
    busy: boolean;
    message: string | null;
    lines: string[];
    consent: boolean;
    saved: boolean;
  }>({
    busy: false,
    message: null,
    lines: [],
    consent: false,
    saved: false,
  });
  async function run(consent: boolean) {
    setState((s) => ({ ...s, busy: true, message: null, lines: [], saved: false }));
    const r = await summarizeText(text, personNames, consent);
    if (!r.ok) {
      if (r.error.code === "CONSENT_REQUIRED") {
        return setState({
          busy: false,
          message:
            "건강·범죄경력 같은 민감한 내용이 보여요. AI에게 보내려면 아래 버튼을 한 번 더 눌러 주세요.",
          lines: [],
          consent: true,
          saved: false,
        });
      }
      return setState({
        busy: false,
        message: matterErrorText(r.error.code, r.error.details?.reason),
        lines: [],
        consent: false,
        saved: false,
      });
    }
    setState({
      busy: false,
      message: r.data.ai.used ? null : aiSkipText(r.data.ai.reason),
      lines: r.data.lines,
      consent: false,
      saved: false,
    });
  }
  return (
    <section>
      <SectionTitle
        title="찾은 글 줄이기"
        hint="기사나 자료의 글을 붙여 넣으면 노트에 넣기 좋게 줄여요. 이름·연락처는 가린 뒤 AI에게 보내요."
      />
      <div className={`${card} mt-3 p-3`}>
        <input
          className={field}
          value={title}
          maxLength={120}
          placeholder="노트 제목 (예: ○○ 기사 요약)"
          onChange={(e) => setTitle(e.target.value)}
          aria-label="요약 노트 제목"
        />
        <textarea
          className={`${field} mt-2`}
          rows={4}
          value={text}
          maxLength={COMPANY_LIMITS.pastedChars}
          placeholder="줄일 글을 붙여 넣어 주세요"
          onChange={(e) => setText(e.target.value)}
          aria-label="줄일 글"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={state.busy || text.trim().length < 20}
            onClick={() => void run(state.consent)}
          >
            {state.busy ? "줄이는 중…" : state.consent ? "동의하고 줄이기 (AI)" : "줄이기 (AI)"}
          </button>
          <button
            type="button"
            className={btnLine}
            disabled={text.trim().length < 2}
            onClick={() => {
              addNote({
                title: title.trim() || "붙여 넣은 글",
                body: text.trim(),
                kind: "memo",
                refs: [],
                sources: [],
                byAi: false,
              });
              setText("");
              setTitle("");
            }}
          >
            줄이지 않고 그대로 노트에
          </button>
        </div>
        {state.message && (
          <p role="alert" className="text-ink mt-2 text-[13px] font-semibold">
            {state.message}
          </p>
        )}
        {state.lines.length > 0 && (
          <div className="mt-3">
            <AiTag notice={AI_NOTICE} />
            <ul className="text-ink mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed">
              {state.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <button
              type="button"
              className={`${btnLine} mt-2`}
              disabled={state.saved}
              onClick={() => {
                addNote({
                  title: title.trim() || "요약",
                  body: state.lines.map((l) => `- ${l}`).join("\n"),
                  kind: "summary",
                  refs: [],
                  sources: [],
                  byAi: true,
                });
                setState((s) => ({ ...s, saved: true }));
              }}
            >
              {state.saved ? "노트에 저장했어요" : "노트로 저장"}
            </button>
          </div>
        )}
      </div>
      {state.lines.length === 0 && !state.message && !state.busy && text.length === 0 && (
        <div className="mt-2">
          <Empty>찾은 내용은 노트 탭에 차곡차곡 쌓여요.</Empty>
        </div>
      )}
    </section>
  );
}
