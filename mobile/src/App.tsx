// 햄찌법원 앱 (DEC-048). 인터넷이 없어도 규칙 판독기(lib/reader)로 질문을 정리한다.
// - 질문·판독 결과는 기기에 저장하지 않는다 (화면을 닫으면 사라진다).
// - 질문을 주소(URL)에 넣지 않는다. 바깥 링크는 공식 기관과 햄찌법원 웹 첫 화면만 연다.
// - 온라인 AI 판독은 lib/reader/source.ts 스위치로 꺼 두었다.
import { useMemo, useState } from "react";
import data from "@/lib/demo/examples.json";
import { AI_NOTICE } from "@/lib/api/respond";
import { CATEGORIES, CATEGORY_GROUPS, type CategoryKey } from "@/lib/procedure/categories";
import { hasTimeline, type ProcedurePlan } from "@/lib/procedure/policy";
import { DIFFICULTY_LABEL, PROCEDURE_NOTICE, type OfficialLink } from "@/lib/procedure/steps";
import { exampleSection } from "@/lib/reader/examples";
import type { Section } from "@/lib/reader/lexicon";
import {
  MIN_CHARS,
  READER_NOTICE,
  readOffline,
  sectionName,
  type ReaderResult,
} from "@/lib/reader/read";
import { WEB_URL, chooseReader } from "@/lib/reader/source";
import face from "@/public/mascot/hamzzi-face.webp?url";
import appVersion from "../app-version.json";
import { useOnline } from "./online";

type Example = {
  id: string;
  tags: string[];
  question: string;
  result: { answer: { points: { text: string; source: string; check: string }[] } };
};
const EXAMPLES = (data as unknown as { examples: Example[] }).examples;

type Screen =
  | { name: "home" }
  | { name: "result"; question: string; category: CategoryKey | null }
  | { name: "categories"; question: string }
  | { name: "examples" }
  | { name: "example"; id: string; back: Screen }
  | { name: "about" };

const MAX_CHARS = 1200;
const VERSION = appVersion.versionName;

export function App() {
  const online = useOnline();
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [draft, setDraft] = useState("");
  const go = (s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => go({ name: "home" })} aria-label="처음 화면">
          {/* 앱 안 정적 파일이라 next/image가 필요 없다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={face} alt="" width={36} height={36} />
          <span>햄찌법원</span>
        </button>
        <span className={`chip ${online ? "on" : "off"}`}>
          {online ? "인터넷 연결됨" : "인터넷 없음"} · 규칙 판독
        </span>
      </header>

      <main>
        {screen.name === "home" && (
          <Home
            draft={draft}
            setDraft={setDraft}
            onRead={(q) => go({ name: "result", question: q, category: null })}
            onPick={(q) => go({ name: "categories", question: q })}
            onExamples={() => go({ name: "examples" })}
          />
        )}
        {screen.name === "result" && (
          <Result
            question={screen.question}
            category={screen.category}
            online={online}
            onPick={() => go({ name: "categories", question: screen.question })}
            onExample={(id) => go({ name: "example", id, back: screen })}
            onEdit={() => go({ name: "home" })}
          />
        )}
        {screen.name === "categories" && (
          <Categories
            onChoose={(category) => go({ name: "result", question: screen.question, category })}
            onBack={() => go({ name: "home" })}
          />
        )}
        {screen.name === "examples" && (
          <Examples onOpen={(id) => go({ name: "example", id, back: screen })} />
        )}
        {screen.name === "example" && <ExampleView id={screen.id} onBack={() => go(screen.back)} />}
        {screen.name === "about" && <About online={online} />}
      </main>

      <nav className="tabs">
        <button
          className={screen.name === "home" || screen.name === "result" ? "active" : ""}
          onClick={() => go({ name: "home" })}
        >
          질문 정리
        </button>
        <button
          className={screen.name === "examples" || screen.name === "example" ? "active" : ""}
          onClick={() => go({ name: "examples" })}
        >
          예시 답변
        </button>
        <button
          className={screen.name === "about" ? "active" : ""}
          onClick={() => go({ name: "about" })}
        >
          앱 정보
        </button>
      </nav>
    </div>
  );
}

function Home(props: {
  draft: string;
  setDraft: (v: string) => void;
  onRead: (q: string) => void;
  onPick: (q: string) => void;
  onExamples: () => void;
}) {
  const len = props.draft.replace(/\s+/g, "").length;
  return (
    <section>
      <h1>어떤 일이 있었나요?</h1>
      <p className="muted">
        인터넷이 없어도 질문을 읽고 어떤 절차에 해당하는지, 무엇을 준비하면 좋은지 정리해 드려요.
        이름·연락처 같은 개인정보는 가려서 읽어요.
      </p>
      <div className="askbox">
        <textarea
          value={props.draft}
          maxLength={MAX_CHARS}
          rows={7}
          placeholder="예: 전세 계약이 끝났는데 집주인이 새 세입자가 들어와야 보증금을 준대요. 이사는 다음 달이에요."
          onChange={(e) => props.setDraft(e.target.value)}
        />
        <div className="row between">
          <span className="muted small">
            {props.draft.length}/{MAX_CHARS}
          </span>
          <button
            className="primary"
            disabled={len < MIN_CHARS}
            onClick={() => props.onRead(props.draft)}
          >
            정리하기
          </button>
        </div>
      </div>
      <p className="muted small">언제, 누구와, 무슨 일이 있었는지 적어 주시면 더 잘 정리돼요.</p>
      <div className="row gap">
        <button className="ghost" onClick={() => props.onPick(props.draft)}>
          분야 직접 고르기
        </button>
        <button className="ghost" onClick={props.onExamples}>
          예시 답변 보기
        </button>
      </div>
      <p className="notice">{READER_NOTICE}</p>
    </section>
  );
}

function Result(props: {
  question: string;
  category: CategoryKey | null;
  online: boolean;
  onPick: () => void;
  onExample: (id: string) => void;
  onEdit: () => void;
}) {
  const [category, setCategory] = useState<CategoryKey | null>(props.category);
  const r: ReaderResult = useMemo(
    () => readOffline({ question: props.question, category }),
    [props.question, category],
  );
  const reader = chooseReader({ online: props.online });

  if (r.status === "too_short") {
    return (
      <section>
        <h1>조금 더 적어 주세요</h1>
        <p className="muted">무슨 일이 있었는지 한두 문장으로 적어 주시면 정리할 수 있어요.</p>
        <button className="primary" onClick={props.onEdit}>
          질문 고치기
        </button>
      </section>
    );
  }

  const f = r.facts;
  const factRows: [string, string[]][] = [
    ["때", f.when],
    ["금액", f.money],
    ["상대방", f.parties],
    ["자료", f.evidence],
    ["해 본 일", f.done],
  ];

  return (
    <section>
      <p className="notice">{r.notice}</p>
      {r.urgent && <div className="urgent">{r.notes[0]}</div>}

      <div className="card lead">
        <p className="eyebrow">판독 결과</p>
        <h1>{planTitle(r.plan)}</h1>
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
      </div>

      {/* 받는 쪽은 고른 분야가 쓰이지 않으므로 버튼을 보이지 않는다 */}
      {r.role === "claimant" && (r.confidence !== "clear" || r.candidates.length > 0) && (
        <div className="card">
          <h2>다른 분야로 보기</h2>
          <div className="row wrap gap">
            {r.candidates.slice(0, 3).map((c) => {
              const key = categoryOf(c.section);
              return key ? (
                <button key={c.section} className="pill" onClick={() => setCategory(key)}>
                  {CATEGORIES[key].label}
                </button>
              ) : null;
            })}
            <button className="pill" onClick={props.onPick}>
              분야 직접 고르기
            </button>
          </div>
          <p className="muted small">고른 분야의 절차로 다시 정리해요.</p>
        </div>
      )}

      <div className="card">
        <h2>적어 주신 것</h2>
        {factRows.some(([, v]) => v.length > 0) ? (
          <dl className="facts">
            {factRows
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
      </div>

      <PlanView plan={r.plan} online={props.online} />

      {r.examples.length > 0 && (
        <div className="card">
          <h2>비슷한 예시 답변</h2>
          {r.examples.map((e) => (
            <button key={e.id} className="listbtn" onClick={() => props.onExample(e.id)}>
              {e.question}
            </button>
          ))}
          <p className="muted small">미리 검증해 둔 예시예요. 인터넷 없이도 볼 수 있어요.</p>
        </div>
      )}

      <div className="card soft">
        {r.notes
          .filter((n) => !r.urgent || n !== r.notes[0])
          .map((n) => (
            <p key={n}>{n}</p>
          ))}
        {props.online && reader === "offline" && (
          <a className="primary block" href={WEB_URL} target="_blank" rel="noreferrer">
            햄찌법원 웹에서 법령·판례 근거 보기
          </a>
        )}
        {props.online && (
          <p className="muted small">
            웹에서는 질문을 다시 적어야 해요. 앱은 질문을 웹으로 보내지 않아요.
          </p>
        )}
      </div>

      <button className="ghost" onClick={props.onEdit}>
        질문 고치기
      </button>
    </section>
  );
}

function planTitle(plan: ProcedurePlan): string {
  return hasTimeline(plan) ? `${plan.section} · ${plan.title}` : plan.title;
}

function categoryOf(section: Section): CategoryKey | null {
  const hit = (Object.keys(CATEGORIES) as CategoryKey[]).find(
    (k) => CATEGORIES[k].track === section,
  );
  return hit ?? null;
}

function Links(props: { links: OfficialLink[]; online: boolean }) {
  if (props.links.length === 0) return null;
  return (
    <div className="links">
      {props.links.map((l) =>
        props.online ? (
          <a key={l.url + l.label} href={l.url} target="_blank" rel="noreferrer">
            {l.label}
          </a>
        ) : (
          <span key={l.url + l.label} className="offline-link">
            {l.label} (인터넷 연결 뒤 열 수 있어요)
          </span>
        ),
      )}
    </div>
  );
}

function PlanView(props: { plan: ProcedurePlan; online: boolean }) {
  const { plan } = props;
  if (!hasTimeline(plan)) {
    return (
      <div className="card">
        <h2>{plan.title}</h2>
        <p>{plan.body}</p>
        <Links links={plan.links} online={props.online} />
      </div>
    );
  }
  return (
    <div className="card">
      <h2>절차 순서</h2>
      <p className="muted small">{PROCEDURE_NOTICE}</p>
      <p>{plan.reason}</p>
      {plan.note && <p className="note">{plan.note}</p>}
      <ol className="timeline">
        {plan.steps.map((s) => (
          <li key={s.key} className={s.key === plan.recommended.key ? "rec" : ""}>
            <details open={s.key === plan.recommended.key}>
              <summary>
                <span className="step">{s.label}</span>
                <span className="badge">{DIFFICULTY_LABEL[s.difficulty]}</span>
                {s.key === plan.recommended.key && <span className="badge gold">먼저 볼 단계</span>}
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
              <Links links={s.links} online={props.online} />
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Categories(props: { onChoose: (k: CategoryKey) => void; onBack: () => void }) {
  return (
    <section>
      <h1>분야 고르기</h1>
      <p className="muted">
        가까운 분야를 고르면 그 절차로 정리해요. 고소를 당했거나 서류를 받은 쪽으로 읽힌 질문은 그 절차가 먼저예요.
      </p>
      {CATEGORY_GROUPS.map((g) => (
        <div key={g.key} className="card">
          <h2>{g.label}</h2>
          <div className="row wrap gap">
            {g.keys.map((k) => (
              <button key={k} className="pill" onClick={() => props.onChoose(k)}>
                {CATEGORIES[k].label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="ghost" onClick={props.onBack}>
        돌아가기
      </button>
    </section>
  );
}

function Examples(props: { onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Example[]>();
    for (const e of EXAMPLES) {
      const sec = exampleSection(e.id);
      const key = sec ? (categoryOf(sec) ? CATEGORIES[categoryOf(sec)!].label : "그 밖") : "그 밖";
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return [...m.entries()];
  }, []);
  return (
    <section>
      <h1>예시 답변</h1>
      <p className="muted">미리 법령·판례를 확인해 만든 예시예요. 인터넷 없이 볼 수 있어요.</p>
      {groups.map(([label, list]) => (
        <div key={label} className="card">
          <h2>{label}</h2>
          {list.map((e) => (
            <button key={e.id} className="listbtn" onClick={() => props.onOpen(e.id)}>
              {e.question}
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}

function sourceLabel(source: string): string {
  if (source.startsWith("case:")) return `판례 ${source.slice("case:".length)}`;
  return source.replace(/^law:/, "").replace(/:/g, " ");
}

function ExampleView(props: { id: string; onBack: () => void }) {
  const e = EXAMPLES.find((x) => x.id === props.id);
  if (!e) return null;
  const points = e.result.answer.points.filter((p) => p.check === "verified");
  return (
    <section>
      <p className="notice">{AI_NOTICE} · 미리 검증해 둔 예시</p>
      <div className="card lead">
        <p className="eyebrow">예시 질문</p>
        <h1 className="q">{e.question}</h1>
      </div>
      <div className="card">
        <h2>답변</h2>
        {points.map((p, i) => (
          <div key={i} className="point">
            <p>{p.text}</p>
            <p className="muted small">근거: {sourceLabel(p.source)}</p>
          </div>
        ))}
        <p className="muted small">
          예시 답변은 만든 시점의 법령·판례 기준이에요. 내 상황에 맞는지는 인터넷에 연결한 뒤 확인해
          주세요.
        </p>
      </div>
      <button className="ghost" onClick={props.onBack}>
        돌아가기
      </button>
    </section>
  );
}

function About(props: { online: boolean }) {
  return (
    <section>
      <h1>앱 정보</h1>
      <div className="card">
        <h2>이 앱이 하는 일</h2>
        <ul>
          <li>질문을 읽고 어떤 절차에 해당하는지, 무엇을 준비하면 좋은지 정리해요.</li>
          <li>인터넷이 없어도 쓸 수 있어요. AI를 쓰지 않고 정해 둔 규칙으로 읽어요.</li>
          <li>결과를 예측하거나 누가 옳은지 판단하지 않아요. 법률 자문이 아니에요.</li>
        </ul>
      </div>
      <div className="card">
        <h2>개인정보</h2>
        <ul>
          <li>질문은 이 기기 안에서만 읽고, 저장하거나 밖으로 보내지 않아요.</li>
          <li>이름·연락처·주소·계좌 같은 정보는 가린 뒤 읽어요.</li>
        </ul>
        {props.online ? (
          <div className="links">
            <a href={`${WEB_URL}/privacy`} target="_blank" rel="noreferrer">
              개인정보처리방침
            </a>
            <a href={`${WEB_URL}/terms`} target="_blank" rel="noreferrer">
              이용약관
            </a>
          </div>
        ) : (
          <p className="muted small">개인정보처리방침·이용약관은 인터넷 연결 뒤 볼 수 있어요.</p>
        )}
      </div>
      <p className="muted small">버전 {VERSION}</p>
      <p className="notice">{READER_NOTICE}</p>
    </section>
  );
}
