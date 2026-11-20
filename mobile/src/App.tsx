// 햄찌법원 앱 (DEC-048·049). 웹의 기능을 앱 화면으로 옮겼다: 질문(AI 답변·규칙 판독)·판례 법령 탐색·절차와 서식·커뮤니티·내 정보.
// - 서버에 닿으면 웹과 같은 API로 동작한다(횟수·금액 상한·인용 검증은 서버). 닿지 않으면 기기 안 자료(규칙 판독·검증된 예시)로 동작한다.
// - 질문은 기기에 저장하지 않고 주소(URL)에 넣지 않는다. 바깥 링크는 공식 기관·법제처·햄찌법원 웹만 연다.
// - 승패·유불리를 말하는 표시가 없다(절대 규칙 2). AI 답변에는 AI_NOTICE, 규칙 판독에는 READER_NOTICE를 붙인다.
import { useEffect, useMemo, useRef, useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { CATEGORIES, CATEGORY_GROUPS, type CategoryKey } from "@/lib/procedure/categories";
import { hasTimeline, procedurePlan } from "@/lib/procedure/policy";
import type { Section } from "@/lib/reader/lexicon";
import { MIN_CHARS, READER_NOTICE, readOffline, sectionName } from "@/lib/reader/read";
import { WEB_URL } from "@/lib/reader/source";
import icon from "@/public/icons/icon-192.png?url";
import judge from "@/public/mascot/hamzzi-judge.webp?url";
import thinking from "@/public/mascot/moods/thinking-8c805b60.webp?url";
import done from "@/public/mascot/moods/done-b4aad7cd.webp?url";
import {
  TIER_LABEL,
  analyze,
  confirmPii,
  createInquiry,
  errorText,
  getQuota,
  probe,
  type Analyzed,
  type ApiError,
  type Quota,
  type Tier,
} from "./api";
import { CommunityScreen, PostScreen } from "./Community";
import { CaseScreen, ExploreScreen } from "./Explore";
import { DocScreen, GuideScreen, TrackScreen } from "./Guide";
import { EXAMPLES, categoryOfExample, exampleOf, nearestExamples } from "./library";
import { BotScreen, MeScreen } from "./Me";
import { tabOf, type Ctx, type Net, type Screen, type TabKey } from "./nav";
import { useOnline } from "./online";
import { Divider, Icon, Laurel, Pediment } from "./ornament";
import { AnswerView, Eyebrow, Notice, Out, PlanView, Sheet } from "./ui";

const MAX_CHARS = 1200;

const TABS: { key: TabKey; label: string; icon: Parameters<typeof Icon>[0]["name"]; to: Screen }[] =
  [
    { key: "home", label: "법정", icon: "temple", to: { name: "home" } },
    { key: "explore", label: "판례·법령", icon: "scroll", to: { name: "explore" } },
    { key: "guide", label: "절차·서식", icon: "column", to: { name: "guide" } },
    { key: "community", label: "광장", icon: "agora", to: { name: "community" } },
    { key: "me", label: "내 정보", icon: "wreath", to: { name: "me" } },
  ];

export function App() {
  const online = useOnline();
  const [net, setNet] = useState<Net>("checking");
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let live = true;
    if (!online) return;
    void probe().then((ok) => {
      if (live) setNet(ok ? "live" : "preview");
    });
    return () => {
      live = false;
    };
  }, [online]);

  const state: Net = online ? net : "preview";
  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };
  const ctx: Ctx = { net: state, online, go };
  const tab = tabOf(screen);

  return (
    <div className="app">
      <div className="splash" aria-hidden="true">
        <Laurel size={132}>
          {/* 앱 안 정적 파일이라 next/image가 필요 없다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" width={84} height={84} />
        </Laurel>
        <b>햄찌법원</b>
        <span>HAMZZI COURT</span>
      </div>

      <header className="top">
        <button className="brand" onClick={() => go({ name: "home" })} aria-label="처음 화면">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" width={40} height={40} />
          <span>
            <b>햄찌법원</b>
            <i>HAMZZI COURT</i>
          </span>
        </button>
        <span className={`status ${state}`} title="서버 연결 상태">
          <i />
          {state === "live"
            ? "실시간 연결"
            : state === "checking"
              ? "연결 확인 중"
              : "기기 안 자료"}
        </span>
      </header>
      <div className="meander" aria-hidden="true" />

      <main>
        {screen.name === "home" && <Home ctx={ctx} draft={draft} setDraft={setDraft} />}
        {screen.name === "read" && <ReadScreen key={screen.question} ctx={ctx} screen={screen} />}
        {screen.name === "example" && (
          <ExampleScreen ctx={ctx} id={screen.id} onBack={() => go(screen.back)} />
        )}
        {screen.name === "explore" && <ExploreScreen ctx={ctx} />}
        {screen.name === "case" && (
          <CaseScreen ctx={ctx} caseRef={screen.ref} onBack={() => go(screen.back)} />
        )}
        {screen.name === "guide" && <GuideScreen ctx={ctx} />}
        {screen.name === "track" && <TrackScreen ctx={ctx} category={screen.category} />}
        {screen.name === "doc" && <DocScreen ctx={ctx} kind={screen.kind} />}
        {screen.name === "community" && <CommunityScreen ctx={ctx} />}
        {screen.name === "post" && <PostScreen ctx={ctx} id={screen.id} />}
        {screen.name === "me" && <MeScreen ctx={ctx} />}
        {screen.name === "bot" && <BotScreen ctx={ctx} />}
      </main>

      <nav className="tabs" aria-label="주요 메뉴">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => go(t.to)}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── 법정(홈) ────────────────────────────────────────────────
function Home({
  ctx,
  draft,
  setDraft,
}: {
  ctx: Ctx;
  draft: string;
  setDraft: (v: string) => void;
}) {
  const live = ctx.net === "live";
  const [mode, setMode] = useState<"ai" | "rule">("ai");
  const [tier, setTier] = useState<Tier>("max");
  const [deep, setDeep] = useState(false);
  const [group, setGroup] = useState(CATEGORY_GROUPS[0].key);
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const len = draft.replace(/\s+/g, "").length;

  useEffect(() => {
    if (!live) return;
    let on = true;
    void getQuota().then((r) => {
      if (on && r.ok) setQuota(r.data);
    });
    return () => {
      on = false;
    };
  }, [live]);

  const cat = category ? CATEGORIES[category] : null;
  const submit = () =>
    ctx.go({ name: "read", question: draft, category, mode, tier, deep: mode === "ai" && deep });
  const featured = useMemo(
    () =>
      (category ? EXAMPLES.filter((e) => categoryOfExample(e.id) === category) : EXAMPLES).slice(
        0,
        8,
      ),
    [category],
  );

  return (
    <>
      <section className="hero">
        <Pediment label="HAMZZI · COURT · OF · LAW" />
        <div className="hero-body">
          <div className="colonnade" aria-hidden="true">
            <i />
            <i />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="judge" src={judge} alt="햄찌 판사" width={132} height={132} />
          <h1>무슨 일이 있었나요?</h1>
          <p>
            있었던 일을 적으면 법령과 판례를 찾아 근거와 함께 정리해 드려요. 절차와 준비할 것도 함께
            보여 드려요.
          </p>
        </div>
      </section>

      <section className="tablet" aria-label="질문 쓰기">
        <div className="seg big" role="tablist" aria-label="답변 방식">
          <button
            role="tab"
            aria-selected={mode === "ai"}
            className={mode === "ai" ? "on" : ""}
            onClick={() => setMode("ai")}
          >
            <Icon name="spark" size={16} /> AI 답변
          </button>
          <button
            role="tab"
            aria-selected={mode === "rule"}
            className={mode === "rule" ? "on" : ""}
            onClick={() => setMode("rule")}
          >
            <Icon name="bolt" size={16} /> 규칙 판독
          </button>
        </div>
        {cat && (
          <p className="picked">
            <b>{cat.label}</b> {cat.guide}{" "}
            <button className="textbtn" onClick={() => setCategory(null)}>
              분야 지우기
            </button>
          </p>
        )}
        <label className="sr" htmlFor="ask">
          질문
        </label>
        <textarea
          id="ask"
          value={draft}
          maxLength={MAX_CHARS}
          rows={6}
          placeholder={
            cat?.placeholder ??
            "예: 전세 계약이 끝났는데 집주인이 새 세입자가 들어와야 보증금을 준대요. 이사는 다음 달이에요."
          }
          onChange={(e) => setDraft(e.target.value)}
        />
        {cat && draft.length === 0 && (
          <div className="starters">
            {cat.starters.map((s) => (
              <button key={s} className="pill" onClick={() => setDraft(s)}>
                {s.trim()}
              </button>
            ))}
          </div>
        )}
        {mode === "ai" && (
          <div className="tiers" role="radiogroup" aria-label="답변 단계">
            {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={tier === t}
                className={tier === t ? "on" : ""}
                onClick={() => setTier(t)}
              >
                <b>{TIER_LABEL[t].name}</b>
                <span>{TIER_LABEL[t].hint}</span>
              </button>
            ))}
            <button
              role="switch"
              aria-checked={deep}
              className={`deep ${deep ? "on" : ""}`}
              onClick={() => setDeep(!deep)}
            >
              <b>DeepSearch</b>
              <span>{deep ? "켜짐" : "여러 쟁점"}</span>
            </button>
          </div>
        )}
        <div className="tablet-foot">
          <span className="muted small">
            {draft.length}/{MAX_CHARS}
            {live && quota && !quota.admin && quota.remaining !== null
              ? ` · 오늘 남은 질문 ${quota.remaining}/${quota.limit}`
              : ""}
          </span>
          <button className="primary" disabled={len < MIN_CHARS} onClick={submit}>
            {mode === "ai" ? "답변 받기" : "정리하기"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <p className="muted small">
          {mode === "ai"
            ? live
              ? "가린 문장으로 법제처 자료를 찾아 AI가 정리해요. 이름·연락처는 보내기 전에 가려요."
              : "지금은 서버에 닿지 않아요. 규칙 판독과 미리 검증해 둔 예시 답변으로 보여 드려요."
            : "인터넷 없이 정해 둔 규칙으로 읽어요. 질문은 기기 밖으로 나가지 않아요."}
        </p>
      </section>

      {ctx.net === "preview" && ctx.online && (
        <section className="webcall">
          <div>
            <b>실시간 AI 답변은 웹에서</b>
            <p>
              지금 화면은 기기 안 자료로 열렸어요. 법제처 실시간 검색과 AI 답변, 광장 글쓰기는
              햄찌법원 웹에서 바로 쓸 수 있어요.
            </p>
          </div>
          <Out href={WEB_URL} online className="primary sm">
            웹 열기
          </Out>
        </section>
      )}

      <section>
        <Eyebrow>분야로 시작하기</Eyebrow>
        <h2 className="h">어떤 일인가요?</h2>
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
            <button
              key={k}
              className={`tile ${category === k ? "on" : ""}`}
              onClick={() => {
                setCategory(k);
                window.scrollTo(0, 0);
              }}
            >
              <b>{CATEGORIES[k].label}</b>
              <span>{CATEGORIES[k].description}</span>
            </button>
          ))}
        </div>
      </section>

      <Divider />

      <section>
        <Eyebrow>검증해 둔 답변 {EXAMPLES.length}건 · 질문 횟수에 들어가지 않아요</Eyebrow>
        <h2 className="h">예시 답변 바로 보기</h2>
        <div className="scroller">
          {featured.map((e) => {
            const k = categoryOfExample(e.id);
            return (
              <button
                key={e.id}
                className="excard"
                onClick={() => ctx.go({ name: "example", id: e.id, back: { name: "home" } })}
              >
                <em>{k ? CATEGORIES[k].label : "예시"}</em>
                <span>{e.question}</span>
                <i>
                  근거 법령 {e.result.articles.filter((a) => a.used).length} · 판례{" "}
                  {e.result.cases.length}
                </i>
              </button>
            );
          })}
        </div>
      </section>

      <Divider />

      <section>
        <Eyebrow>둘러보기</Eyebrow>
        <h2 className="h">햄찌법원에서 할 수 있는 일</h2>
        <div className="doors">
          <button onClick={() => ctx.go({ name: "explore" })}>
            <Icon name="scroll" />
            <b>판례·법령 탐색</b>
            <span>판례, 조문, 결정문, 자치법규</span>
          </button>
          <button onClick={() => ctx.go({ name: "guide" })}>
            <Icon name="column" />
            <b>절차와 서식</b>
            <span>분야별 절차 순서, 공식 서식</span>
          </button>
          <button onClick={() => ctx.go({ name: "community" })}>
            <Icon name="agora" />
            <b>광장</b>
            <span>의견·경험을 나누고 씨앗 모으기</span>
          </button>
          <button onClick={() => ctx.go({ name: "bot" })}>
            <Icon name="chat" />
            <b>햄찌 안내</b>
            <span>규정·약관·운영 방식 물어보기</span>
          </button>
        </div>
      </section>

      <Notice>{AI_NOTICE} · 중요한 결정 전에는 변호사·법무사와 상담하세요.</Notice>
    </>
  );
}

// ── 질문 결과: 규칙 판독은 바로, AI 답변은 서버에 닿을 때 ─────────
type AiState =
  | { kind: "idle" }
  | { kind: "loading"; step: number }
  | { kind: "consent"; masked?: string }
  | { kind: "pii"; id: string; masked: string; count: number }
  | { kind: "done"; data: Analyzed }
  | { kind: "error"; error: ApiError };

const STEPS = ["개인정보 가리기", "법령·판례 찾기", "답변 정리", "인용 다시 확인"];

function categoryOf(section: Section): CategoryKey | null {
  const hit = (Object.keys(CATEGORIES) as CategoryKey[]).find(
    (k) => CATEGORIES[k].track === section,
  );
  return hit ?? null;
}

function ReadScreen({ ctx, screen }: { ctx: Ctx; screen: Extract<Screen, { name: "read" }> }) {
  const [category, setCategory] = useState<CategoryKey | null>(screen.category);
  const r = useMemo(
    () => readOffline({ question: screen.question, category }),
    [screen.question, category],
  );
  const wantsAi = screen.mode === "ai";
  const live = ctx.net === "live";
  const [ai, setAi] = useState<AiState>({ kind: "idle" });

  // 분석은 한 번만 부른다 (재시도 없음). 진행 표시는 기다리는 동안의 안내일 뿐 서버 단계와 맞물리지 않는다
  const run = async (consent: boolean) => {
    setAi({ kind: "loading", step: 0 });
    const created = await createInquiry(screen.question, consent);
    if (!created.ok) {
      if (created.error.code === "CONSENT_REQUIRED") return setAi({ kind: "consent" });
      return setAi({ kind: "error", error: created.error });
    }
    if (created.data.piiConfirmationRequired) {
      return setAi({
        kind: "pii",
        id: created.data.id,
        masked: created.data.maskedText,
        count: created.data.piiFindings.length,
      });
    }
    await finish(created.data.id);
  };
  const finish = async (id: string) => {
    setAi({ kind: "loading", step: 1 });
    const timer = setInterval(
      () =>
        setAi((s) =>
          s.kind === "loading" && s.step < 3 ? { kind: "loading", step: s.step + 1 } : s,
        ),
      6000,
    );
    const res = await analyze(id, { tier: screen.tier, category, deep: screen.deep });
    clearInterval(timer);
    setAi(res.ok ? { kind: "done", data: res.data } : { kind: "error", error: res.error });
  };
  const acceptPii = async (id: string) => {
    setAi({ kind: "loading", step: 0 });
    const ok = await confirmPii(id);
    if (!ok.ok) return setAi({ kind: "error", error: ok.error });
    await finish(id);
  };

  // 질문 하나에 한 번만 시작한다. 연결 확인이 늦게 끝나도 닿는 순간 시작한다
  const started = useRef(false);
  useEffect(() => {
    if (!wantsAi || !live || r.status !== "read" || started.current) return;
    started.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  if (r.status === "too_short") {
    return (
      <section className="card">
        <h1>조금 더 적어 주세요</h1>
        <p className="muted">무슨 일이 있었는지 한두 문장으로 적어 주시면 정리할 수 있어요.</p>
        <button className="primary" onClick={() => ctx.go({ name: "home" })}>
          질문 고치기
        </button>
      </section>
    );
  }

  const f = r.facts;
  const facts: [string, string[]][] = [
    ["때", f.when],
    ["금액", f.money],
    ["상대방", f.parties],
    ["자료", f.evidence],
    ["해 본 일", f.done],
  ];
  const near = nearestExamples(
    screen.question,
    r.examples.map((e) => e.id),
  );
  const aiResult = ai.kind === "done" ? ai.data.result : null;
  const plan = aiResult ? procedurePlan(aiResult, r.masked, category) : r.plan;

  return (
    <>
      <button className="backlink" onClick={() => ctx.go({ name: "home" })}>
        <Icon name="back" size={16} /> 질문 고치기
      </button>

      <section className="quote">
        <Eyebrow>내 질문 (가린 문장)</Eyebrow>
        <p>{r.masked}</p>
      </section>

      {r.urgent && <div className="urgent">{r.notes[0]}</div>}

      {wantsAi && (
        <section className="card ai">
          <div className="card-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ai.kind === "done" ? done : thinking}
              alt=""
              width={56}
              height={56}
              className={ai.kind === "loading" ? "knock" : ""}
            />
            <div>
              <Eyebrow>햄찌 판사의 정리</Eyebrow>
              <h2>
                {ai.kind === "done"
                  ? aiResult!.mode === "search_only"
                    ? "법제처 검색 결과"
                    : "AI 답변"
                  : ai.kind === "loading"
                    ? "살펴보는 중이에요"
                    : "AI 답변"}
              </h2>
            </div>
          </div>

          {ctx.net === "checking" && <p className="muted">서버 연결을 확인하고 있어요…</p>}
          {ctx.net === "preview" && (
            <>
              <p>
                지금은 햄찌법원 서버에 닿지 않아 AI 답변을 받지 못했어요. 아래 규칙 판독과, 미리
                법령·판례를 확인해 둔 비슷한 예시 답변을 먼저 보여 드려요.
              </p>
              <Out href={WEB_URL} online={ctx.online} className="primary block">
                햄찌법원 웹에서 AI 답변 받기
              </Out>
              <p className="muted small">
                웹에서는 질문을 다시 적어야 해요. 앱은 질문을 웹으로 넘기지 않아요.
              </p>
            </>
          )}

          {live && ai.kind === "loading" && (
            <ol className="steps" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s} className={i < ai.step ? "past" : i === ai.step ? "now" : ""}>
                  {s}
                </li>
              ))}
            </ol>
          )}

          {live && ai.kind === "error" && (
            <>
              <p role="alert" className="warn">
                {errorText(ai.error)}
              </p>
              {ai.error.code === "LOGIN_REQUIRED" && (
                <Out href={`${WEB_URL}/me`} online={ctx.online}>
                  웹에서 Google로 로그인하기
                </Out>
              )}
              <p className="muted small">아래 규칙 판독은 그대로 볼 수 있어요.</p>
            </>
          )}

          {aiResult && (
            <>
              <Notice>
                {aiResult.aiNotice}
                {aiResult.mode === "search_only" ? " · AI 답변 없이 검색 결과만" : ""}
              </Notice>
              <AnswerView result={aiResult} online={ctx.online} />
            </>
          )}
        </section>
      )}

      <section className="card lead">
        <Eyebrow>규칙 판독 · {READER_NOTICE}</Eyebrow>
        <h2>{hasTimeline(plan) ? `${plan.section} · ${plan.title}` : plan.title}</h2>
        <p>{r.confidenceText}</p>
        <p className="muted small">{r.roleText}</p>
        {r.also.length > 0 && (
          <p className="muted small">함께 걸린 절차: {r.also.map(sectionName).join(" · ")}</p>
        )}
        {(r.maskedCount > 0 || r.sensitive) && (
          <p className="muted small">
            {r.maskedCount > 0 ? "질문에 있던 개인정보는 가리고 읽었어요. " : ""}
            {r.sensitive
              ? "건강·범죄경력처럼 민감한 내용이 보여요. 다른 사람에게 보여 줄 때 조심해 주세요."
              : ""}
          </p>
        )}
        {r.role === "claimant" && (r.confidence !== "clear" || r.candidates.length > 0) && (
          <div className="chips wrap">
            {r.candidates.slice(0, 3).map((c) => {
              const key = categoryOf(c.section);
              return key ? (
                <button
                  key={c.section}
                  className={category === key ? "on" : ""}
                  onClick={() => setCategory(key)}
                >
                  {CATEGORIES[key].label}
                </button>
              ) : null;
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>적어 주신 것</h2>
        {facts.some(([, v]) => v.length > 0) ? (
          <dl className="facts">
            {facts
              .filter(([, v]) => v.length > 0)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v.join(", ")}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="muted">질문에서 날짜·금액·자료를 찾지 못했어요.</p>
        )}
        {r.checklist.missing.length > 0 && (
          <>
            <h3>더 확인해 두면 좋은 것</h3>
            <ul className="checks">
              {r.checklist.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <PlanView plan={plan} online={ctx.online} />

      {near.length > 0 && (
        <section className="card">
          <Eyebrow>미리 검증해 둔 답변</Eyebrow>
          <h2>비슷한 예시 답변</h2>
          {near.map((e) => (
            <button
              key={e.id}
              className="listbtn"
              onClick={() => ctx.go({ name: "example", id: e.id, back: screen })}
            >
              {e.question}
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </section>
      )}

      {!aiResult && r.notes.filter((n) => !r.urgent || n !== r.notes[0]).length > 0 && (
        <section className="card soft">
          {r.notes
            .filter((n) => !r.urgent || n !== r.notes[0])
            .map((n) => (
              <p key={n}>{n}</p>
            ))}
        </section>
      )}

      {ai.kind === "consent" && (
        <Sheet title="민감한 내용이 보여요" onClose={() => setAi({ kind: "idle" })}>
          <p>
            건강·범죄경력처럼 민감한 내용으로 보이는 부분이 있어요. 동의하시면 그 내용이 들어간 가린
            문장으로 법령·판례를 찾고 답변을 만들어요.
          </p>
          <div className="row end">
            <button className="ghost" onClick={() => setAi({ kind: "idle" })}>
              보내지 않기
            </button>
            <button className="primary" onClick={() => void run(true)}>
              동의하고 답변 받기
            </button>
          </div>
        </Sheet>
      )}
      {ai.kind === "pii" && (
        <Sheet title="개인정보를 가렸어요" onClose={() => setAi({ kind: "idle" })}>
          <p>개인정보로 보이는 {ai.count}곳을 가렸어요. 아래 문장으로 분석할까요?</p>
          <p className="quote-in">{ai.masked}</p>
          <div className="row end">
            <button className="ghost" onClick={() => setAi({ kind: "idle" })}>
              그만두기
            </button>
            <button className="primary" onClick={() => void acceptPii(ai.id)}>
              가린 문장으로 분석하기
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

// ── 예시 답변 ──────────────────────────────────────────────
function ExampleScreen({ ctx, id, onBack }: { ctx: Ctx; id: string; onBack: () => void }) {
  const e = exampleOf(id);
  if (!e) return null;
  const k = categoryOfExample(e.id);
  const plan = procedurePlan(e.result, e.question, k);
  return (
    <>
      <button className="backlink" onClick={onBack}>
        <Icon name="back" size={16} /> 돌아가기
      </button>
      <section className="quote">
        <Eyebrow>예시 질문{k ? ` · ${CATEGORIES[k].label}` : ""}</Eyebrow>
        <p>{e.question}</p>
      </section>
      <section className="card ai">
        <div className="card-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={done} alt="" width={56} height={56} />
          <div>
            <Eyebrow>햄찌 판사의 정리</Eyebrow>
            <h2>미리 검증해 둔 답변</h2>
          </div>
        </div>
        <Notice>{AI_NOTICE} · 만든 시점의 법령·판례 기준</Notice>
        <AnswerView result={e.result} online={ctx.online} />
      </section>
      <PlanView plan={plan} online={ctx.online} />
      <button className="primary block" onClick={() => ctx.go({ name: "home" })}>
        내 상황으로 질문하기
      </button>
    </>
  );
}
