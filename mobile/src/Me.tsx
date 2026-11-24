// 내 정보와 햄찌 안내 (DEC-032·035·030·047). 로그인은 웹에서 Google로 한다 — 앱은 서버가 알려 준 상태만 보여 준다.
// 설정(글자 크기)은 이 기기에만 둔다. 햄찌 안내는 정해 둔 문안 메뉴이고 AI를 부르지 않으며 자유 입력을 받지 않는다.
import { useEffect, useState } from "react";
import { AI_NOTICE } from "@/lib/api/respond";
import { SEEDS, type SeedSummary } from "@/lib/community/policy";
import {
  GREETING,
  GUIDE_NOTICE,
  MENU_IDS,
  guideEmail,
  guideTopic,
  type GuideTopic,
} from "@/lib/guide/topics";
import { READER_NOTICE } from "@/lib/reader/read";
import { WEB_URL } from "@/lib/reader/source";
import face from "@/public/mascot/hamzzi-face.webp?url";
import appVersion from "../app-version.json";
import { getQuota, getSeeds, type Quota } from "./api";
import { EXAMPLES, LIBRARY } from "./library";
import type { Ctx } from "./nav";
import { Divider, Icon, Laurel } from "./ornament";
import { Eyebrow, Notice, Out } from "./ui";

const SIZE_KEY = "hz:app:size";
const SIZES = [
  { key: "base", label: "보통" },
  { key: "large", label: "크게" },
  { key: "xlarge", label: "아주 크게" },
] as const;
type Size = (typeof SIZES)[number]["key"];

export function readSize(): Size {
  try {
    const v = localStorage.getItem(SIZE_KEY);
    return SIZES.some((s) => s.key === v) ? (v as Size) : "base";
  } catch {
    return "base";
  }
}
export function applySize(size: Size) {
  document.documentElement.dataset.size = size;
  try {
    if (size === "base") localStorage.removeItem(SIZE_KEY);
    else localStorage.setItem(SIZE_KEY, size);
  } catch {
    // 저장소를 못 쓰면 이번에만 적용된다
  }
}

const PROMISES = [
  "법제처에서 확인한 조문·판례만 근거로 보여 드려요.",
  "이길지 질지, 처벌될지를 말하지 않아요.",
  "기간·비용 숫자를 지어내지 않아요.",
  "질문 원문은 저장하지 않고 가린 문장만 다뤄요.",
];

export function MeScreen({ ctx }: { ctx: Ctx }) {
  const live = ctx.net === "live";
  const [quota, setQuota] = useState<Quota | null>(null);
  const [seeds, setSeeds] = useState<SeedSummary | null>(null);
  const [size, setSize] = useState<Size>(readSize());

  useEffect(() => {
    if (!live) return;
    let on = true;
    void getQuota().then((r) => {
      if (!on || !r.ok) return;
      setQuota(r.data);
      if (!r.data.anonymous)
        void getSeeds().then((s) => {
          if (on && s.ok && typeof s.data?.balance === "number") setSeeds(s.data);
        });
    });
    return () => {
      on = false;
    };
  }, [live]);

  const signedIn = quota?.anonymous === false;

  return (
    <>
      <section className="profile">
        <Laurel size={104}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={face} alt="" width={64} height={64} />
        </Laurel>
        <div>
          <Eyebrow>ΠΟΛΙΤΗΣ · 시민</Eyebrow>
          <h1>{signedIn ? "Google 계정으로 로그인했어요" : "로그인하지 않았어요"}</h1>
          <p className="muted">
            {!live
              ? "지금은 서버에 닿지 않아 기기 안 자료로 쓰고 있어요."
              : quota?.admin
                ? "관리자 모드예요."
                : quota && quota.remaining !== null
                  ? `오늘 남은 질문 ${quota.remaining}/${quota.limit}`
                  : "연결 상태를 확인하고 있어요."}
          </p>
          {!signedIn && (
            <Out href={`${WEB_URL}/me`} online={ctx.online} className="textlink">
              웹에서 Google로 로그인
            </Out>
          )}
        </div>
      </section>

      <section className="statrow" aria-label="기기 안 자료">
        <div>
          <b>{EXAMPLES.length}</b>
          <span>검증된 예시</span>
        </div>
        <div>
          <b>{LIBRARY.articles.length}</b>
          <span>조문</span>
        </div>
        <div>
          <b>{LIBRARY.cases.length}</b>
          <span>판례 목록</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <span className="medal">
            <Icon name="seed" />
          </span>
          <div>
            <Eyebrow>활동 포인트</Eyebrow>
            <h2>{seeds ? `씨앗 ${seeds.balance.toLocaleString("ko-KR")}개` : "씨앗"}</h2>
          </div>
        </div>
        {seeds ? (
          <p className="muted">
            오늘 글 {seeds.today.posts}/{seeds.today.postsLimit} · 댓글 {seeds.today.comments}/
            {seeds.today.commentsLimit}
          </p>
        ) : (
          <p className="muted">로그인하고 광장에 글·댓글을 쓰면 쌓여요.</p>
        )}
        <p className="muted small">
          글 하나에 {SEEDS.post}개, 댓글 하나에 {SEEDS.comment}개. 씨앗은 활동 기록이에요.
          햄찌법원은 전면 무료라 씨앗을 돈이나 할인으로 바꾸지 않아요.
        </p>
        <button className="ghost" onClick={() => ctx.go({ name: "community" })}>
          광장으로 가기
        </button>
      </section>

      <section className="card">
        <h2>화면 설정</h2>
        <p className="muted small">글자 크기는 이 기기에만 기억해요.</p>
        <div className="seg" role="radiogroup" aria-label="글자 크기">
          {SIZES.map((s) => (
            <button
              key={s.key}
              role="radio"
              aria-checked={size === s.key}
              className={size === s.key ? "on" : ""}
              onClick={() => {
                setSize(s.key);
                applySize(s.key);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>햄찌법원의 약속</h2>
        <ul className="checks">
          {PROMISES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <button className="ghost" onClick={() => ctx.go({ name: "bot" })}>
          <Icon name="chat" size={16} /> 햄찌 안내에게 물어보기
        </button>
      </section>

      <section className="card">
        <h2>약관과 출처</h2>
        <div className="links">
          <Out href={`${WEB_URL}/privacy`} online={ctx.online}>
            개인정보처리방침
          </Out>
          <Out href={`${WEB_URL}/terms`} online={ctx.online}>
            이용약관
          </Out>
          <Out href={`${WEB_URL}/sources`} online={ctx.online}>
            출처 표기
          </Out>
          <Out href={WEB_URL} online={ctx.online}>
            햄찌법원 웹 열기
          </Out>
        </div>
        <p className="muted small">
          버전 {appVersion.versionName} · 법령·판례 자료: 법제처 국가법령정보센터
        </p>
      </section>
      <Notice>
        {AI_NOTICE} · {READER_NOTICE}
      </Notice>
    </>
  );
}

type Turn = { from: "me"; text: string } | { from: "bot"; id: string; topic: GuideTopic };

export function BotScreen({ ctx }: { ctx: Ctx }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [mail, setMail] = useState(false);
  const ask = (id: string) => {
    const topic = guideTopic(id);
    if (!topic) return;
    setTurns((t) => [...t, { from: "me", text: topic.label }, { from: "bot", id, topic }]);
    requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
  };
  const last = turns[turns.length - 1];
  const next = last?.from === "bot" ? (last.topic.next ?? []) : [];
  return (
    <>
      <button className="backlink" onClick={() => ctx.go({ name: "me" })}>
        <Icon name="back" size={16} /> 내 정보
      </button>
      <header className="page-head">
        <Eyebrow>정해진 안내</Eyebrow>
        <h1>햄찌 안내</h1>
      </header>
      <div className="chat">
        <div className="bubble bot">
          <p>{GREETING}</p>
        </div>
        {turns.map((t, i) =>
          t.from === "me" ? (
            <div key={i} className="bubble me">
              <p>{t.text}</p>
            </div>
          ) : (
            <div key={i} className="bubble bot">
              {t.topic.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              {t.topic.list && (
                <ol>
                  {t.topic.list.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ol>
              )}
              {t.topic.links && (
                <div className="links">
                  {t.topic.links.map((l) => (
                    <Out key={l.href} href={`${WEB_URL}${l.href}`} online={ctx.online}>
                      {l.label}
                    </Out>
                  ))}
                </div>
              )}
              {t.topic.contact &&
                (mail ? (
                  <p className="mail">{guideEmail()}</p>
                ) : (
                  <button className="ghost" onClick={() => setMail(true)}>
                    이메일 주소 보기
                  </button>
                ))}
            </div>
          ),
        )}
      </div>
      <Divider />
      <div className="chips wrap">
        {(next.length > 0 ? next : MENU_IDS).map((id) => (
          <button key={id} onClick={() => ask(id)}>
            {guideTopic(id)?.label}
          </button>
        ))}
        {next.length > 0 && (
          <button className="on" onClick={() => setTurns([])}>
            처음 메뉴
          </button>
        )}
      </div>
      <Notice>{GUIDE_NOTICE}</Notice>
    </>
  );
}
