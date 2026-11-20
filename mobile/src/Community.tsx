// 광장 = 커뮤니티 (DEC-047). 서버에 닿으면 웹과 같은 게시판을 읽고 쓴다(비로그인은 글마다 비밀번호).
// 닿지 않으면 직접 쓴 예시 글을 보여 주고, 쓴 글은 이 화면에만 잠깐 보인다(저장·전송 없음)고 알린다.
// 글은 이용자 의견이라 AI_NOTICE 대신 COMMUNITY_NOTICE를 붙인다. 씨앗을 할인에 쓰는 기능은 없다(절대 규칙 5).
import { useEffect, useState, type FormEvent } from "react";
import {
  BOARDS,
  COMMUNITY_NOTICE,
  DEFAULT_BOARD,
  DEFAULT_NICKNAME,
  LIMITS,
  SEEDS,
  SENSITIVE_ASK,
  boardName,
  type BoardKey,
  type CommentView,
  type PostSummary,
  type PostView,
} from "@/lib/community/policy";
import { scanInput } from "@/lib/pii";
import { WEB_URL } from "@/lib/reader/source";
import {
  createComment,
  createPost,
  deletePost,
  errorText,
  getPost,
  listPosts,
  reportPost,
  type ApiError,
  type PostDraft,
} from "./api";
import { SAMPLE_POSTS } from "./library";
import type { Ctx } from "./nav";
import { Icon } from "./ornament";
import { Eyebrow, Notice, Out, Sheet, timeOf } from "./ui";

// 미리보기에서 쓴 글 (이 화면을 닫으면 사라진다)
const localPosts: (PostSummary & { body: string })[] = [];
const previewPosts = () => [...localPosts, ...SAMPLE_POSTS];

function Author({ nickname, member }: { nickname: string; member: boolean }) {
  return (
    <span className="author">
      <b>{nickname}</b>
      {member && <em>로그인</em>}
    </span>
  );
}

function SeedStrip({ ctx }: { ctx: Ctx }) {
  return (
    <section className="seedstrip">
      <Icon name="seed" />
      <div>
        <b>씨앗을 모아 보세요</b>
        <p>
          로그인하고 글을 쓰면 씨앗 {SEEDS.post}개, 댓글은 {SEEDS.comment}개가 쌓여요. 씨앗 하나는
          할인 {SEEDS.wonPerSeed}원의 가치이고, 지금은 쌓이기만 해요.
        </p>
        <Out href={`${WEB_URL}/me`} online={ctx.online} className="textlink">
          웹에서 Google로 로그인
        </Out>
      </div>
    </section>
  );
}

export function CommunityScreen({ ctx }: { ctx: Ctx }) {
  const live = ctx.net === "live";
  const [board, setBoard] = useState<BoardKey | null>(null);
  const [items, setItems] = useState<PostSummary[] | null>(live ? null : previewPosts());
  const [error, setError] = useState<ApiError | null>(null);
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    if (!live) return;
    let on = true;
    void listPosts(board).then((r) => {
      if (!on) return;
      if (r.ok) setItems(r.data.items);
      else setError(r.error);
    });
    return () => {
      on = false;
    };
  }, [live, board]);

  const shown = live ? items : previewPosts().filter((p) => !board || p.board === board);

  return (
    <>
      <header className="page-head">
        <Eyebrow>ΑΓΟΡΑ · 광장</Eyebrow>
        <h1>광장</h1>
        <p className="muted">법 이야기부터 가벼운 이야기까지, 로그인 없이도 나눌 수 있어요.</p>
        <button className="primary" onClick={() => setWriting(true)}>
          <Icon name="pen" size={16} /> 글쓰기
        </button>
      </header>

      {!live && (
        <p className="banner">
          지금은 서버에 닿지 않아 예시 글을 보여 드려요. 여기서 쓴 글은 이 화면에만 잠깐 보이고
          저장되지 않아요.
        </p>
      )}

      <SeedStrip ctx={ctx} />

      <div className="chips" role="tablist" aria-label="게시판">
        <button
          role="tab"
          aria-selected={board === null}
          className={board === null ? "on" : ""}
          onClick={() => setBoard(null)}
        >
          전체
        </button>
        {BOARDS.map((b) => (
          <button
            key={b.key}
            role="tab"
            aria-selected={board === b.key}
            className={board === b.key ? "on" : ""}
            onClick={() => setBoard(b.key)}
          >
            {b.name}
          </button>
        ))}
      </div>

      <section className="card flush">
        {error && (
          <p role="alert" className="warn pad">
            {errorText(error)}
          </p>
        )}
        {!shown && !error && <p className="muted pad">불러오는 중…</p>}
        {shown && shown.length === 0 && (
          <p className="muted pad">아직 글이 없어요. 첫 글을 남겨 보세요.</p>
        )}
        {shown?.map((p) => (
          <button key={p.id} className="postrow" onClick={() => ctx.go({ name: "post", id: p.id })}>
            <span className="row1">
              <em>{boardName(p.board)}</em>
              <b>{p.title}</b>
              {p.commentCount > 0 && <i>{p.commentCount}</i>}
            </span>
            <span className="row2">
              <Author nickname={p.nickname} member={p.member} />
              <span>{timeOf(p.createdAt)}</span>
              {p.id.startsWith("sample-") && <span className="tag">예시 글</span>}
            </span>
          </button>
        ))}
      </section>
      <Notice>{COMMUNITY_NOTICE}</Notice>

      {writing && (
        <WriteSheet
          ctx={ctx}
          board={board ?? DEFAULT_BOARD}
          onClose={() => setWriting(false)}
          onDone={(id) => {
            setWriting(false);
            ctx.go({ name: "post", id });
          }}
        />
      )}
    </>
  );
}

function WriteSheet({
  ctx,
  board,
  onClose,
  onDone,
}: {
  ctx: Ctx;
  board: BoardKey;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const live = ctx.net === "live";
  const [d, setD] = useState<PostDraft>({ board, title: "", body: "", nickname: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const set = <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const send = async (consent: boolean) => {
    setBusy(true);
    setError(null);
    if (!live) {
      // 미리보기: 기기 안에서 가리고 이 화면에만 잠깐 둔다
      const scan = scanInput(`${d.title}\n${d.body}`);
      if (scan.sensitive.length > 0 && !consent) {
        setBusy(false);
        return setAsk(true);
      }
      const id = `local-${localPosts.length + 1}`;
      localPosts.unshift({
        id,
        board: d.board,
        title: scanInput(d.title).maskedText,
        body: scanInput(d.body).maskedText,
        nickname: d.nickname.trim() || DEFAULT_NICKNAME,
        member: false,
        folded: false,
        commentCount: 0,
        createdAt: new Date().toISOString(),
      });
      return onDone(id);
    }
    const r = await createPost({ ...d, ...(consent && { sensitiveConsent: true }) });
    setBusy(false);
    if (r.ok) return onDone(r.data.post.id);
    if (r.error.code === "CONSENT_REQUIRED") return setAsk(true);
    setError(errorText(r.error));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(false);
  };

  return (
    <Sheet title="글쓰기" onClose={onClose}>
      {ask ? (
        <>
          <p>{SENSITIVE_ASK}</p>
          <div className="row end">
            <button className="ghost" onClick={() => setAsk(false)}>
              다시 고치기
            </button>
            <button className="primary" onClick={() => void send(true)}>
              그래도 올리기
            </button>
          </div>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="row gap">
            <label>
              <span>게시판</span>
              <select
                id="w-board"
                value={d.board}
                onChange={(e) => set("board", e.target.value as BoardKey)}
              >
                {BOARDS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>닉네임</span>
              <input
                id="w-nick"
                value={d.nickname}
                maxLength={LIMITS.nickname.max}
                placeholder={DEFAULT_NICKNAME}
                onChange={(e) => set("nickname", e.target.value)}
              />
            </label>
          </div>
          {live && (
            <label>
              <span>비밀번호 (수정·삭제할 때 써요. 로그인했으면 비워 두세요)</span>
              <input
                id="w-pw"
                type="password"
                autoComplete="new-password"
                value={d.password}
                maxLength={LIMITS.password.max}
                onChange={(e) => set("password", e.target.value)}
              />
            </label>
          )}
          <label>
            <span>제목</span>
            <input
              id="w-title"
              value={d.title}
              required
              minLength={LIMITS.title.min}
              maxLength={LIMITS.title.max}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>
          <label>
            <span>내용</span>
            <textarea
              id="w-body"
              rows={6}
              value={d.body}
              required
              minLength={LIMITS.body.min}
              maxLength={LIMITS.body.max}
              onChange={(e) => set("body", e.target.value)}
            />
          </label>
          <p className="muted small">
            이름·연락처·주소처럼 보이는 내용은 올릴 때 자동으로 가려져요.
          </p>
          {error && (
            <p role="alert" className="warn">
              {error}
            </p>
          )}
          <div className="row end">
            <button type="button" className="ghost" onClick={onClose}>
              취소
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "올리는 중…" : "올리기"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

export function PostScreen({ ctx, id }: { ctx: Ctx; id: string }) {
  const live = ctx.net === "live" && !id.startsWith("sample-") && !id.startsWith("local-");
  const sample = previewPosts().find((p) => p.id === id);
  const [data, setData] = useState<{ post: PostView; comments: CommentView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState({ body: "", nickname: "", password: "" });
  const [note, setNote] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    getPost(id).then((r) => {
      if (r.ok) setData(r.data);
      else setError(errorText(r.error));
    });
  useEffect(() => {
    if (live) void load();
    // 글 번호가 바뀔 때만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live]);

  const back = (
    <button className="backlink" onClick={() => ctx.go({ name: "community" })}>
      <Icon name="back" size={16} /> 광장
    </button>
  );

  if (!live) {
    if (!sample) return back;
    return (
      <>
        {back}
        <article className="card lead">
          <Eyebrow>{boardName(sample.board)}</Eyebrow>
          <h1>{sample.title}</h1>
          <p className="meta">
            <Author nickname={sample.nickname} member={sample.member} /> ·{" "}
            {timeOf(sample.createdAt)}
            {sample.id.startsWith("sample-") && <span className="tag">예시 글</span>}
          </p>
          <p className="pre">{sample.body}</p>
        </article>
        <p className="banner">
          {sample.id.startsWith("sample-")
            ? "직접 쓴 예시 글이에요. 서버에 닿으면 실제 글과 댓글을 볼 수 있어요."
            : "이 글은 이 화면에만 잠깐 보이고 저장되지 않아요."}
        </p>
        <Out href={`${WEB_URL}/community`} online={ctx.online} className="primary block">
          웹 커뮤니티 열기
        </Out>
        <Notice>{COMMUNITY_NOTICE}</Notice>
      </>
    );
  }

  if (error && !data)
    return (
      <>
        {back}
        <p role="alert" className="warn">
          {error}
        </p>
      </>
    );
  if (!data)
    return (
      <>
        {back}
        <p className="muted">불러오는 중…</p>
      </>
    );

  const { post, comments } = data;
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createComment(post.id, {
      body: comment.body,
      nickname: comment.nickname,
      ...(comment.password && { password: comment.password }),
    });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    setComment((c) => ({ ...c, body: "", password: "" }));
    setNote(r.data.seeds > 0 ? `씨앗 ${r.data.seeds}개가 쌓였어요.` : null);
    void load();
  };
  const remove = async () => {
    const r = await deletePost(post.id, pw || undefined);
    if (!r.ok) return setError(errorText(r.error));
    ctx.go({ name: "community" });
  };

  return (
    <>
      {back}
      <article className="card lead">
        <Eyebrow>{boardName(post.board)}</Eyebrow>
        <h1>{post.title}</h1>
        <p className="meta">
          <Author nickname={post.nickname} member={post.member} /> · {timeOf(post.createdAt)}
          {post.updatedAt ? " · 수정됨" : ""}
        </p>
        <p className="pre">{post.body}</p>
        <div className="row gap actions">
          {(post.mine || post.needsPassword) && (
            <button className="textbtn" onClick={() => setDel(true)}>
              삭제
            </button>
          )}
          <button
            className="textbtn"
            onClick={async () => {
              const r = await reportPost(post.id);
              if (r.ok) setNote("신고했어요.");
            }}
          >
            신고
          </button>
        </div>
      </article>

      {note && <p className="banner">{note}</p>}

      <section className="card">
        <h2>댓글 {comments.length}</h2>
        {comments.length === 0 && <p className="muted">첫 댓글을 남겨 보세요.</p>}
        <ul className="comments">
          {comments.map((c) => (
            <li key={c.id}>
              <p className="meta">
                <Author nickname={c.nickname} member={c.member} /> · {timeOf(c.createdAt)}
              </p>
              <p className="pre">{c.body}</p>
            </li>
          ))}
        </ul>
        <form className="form" onSubmit={send}>
          <div className="row gap">
            <label>
              <span>닉네임</span>
              <input
                id="c-nick"
                value={comment.nickname}
                maxLength={LIMITS.nickname.max}
                placeholder={DEFAULT_NICKNAME}
                onChange={(e) => setComment((c) => ({ ...c, nickname: e.target.value }))}
              />
            </label>
            <label>
              <span>비밀번호</span>
              <input
                id="c-pw"
                type="password"
                autoComplete="new-password"
                value={comment.password}
                maxLength={LIMITS.password.max}
                onChange={(e) => setComment((c) => ({ ...c, password: e.target.value }))}
              />
            </label>
          </div>
          <label>
            <span>댓글</span>
            <textarea
              id="c-body"
              rows={3}
              required
              maxLength={LIMITS.comment.max}
              value={comment.body}
              onChange={(e) => setComment((c) => ({ ...c, body: e.target.value }))}
            />
          </label>
          {error && (
            <p role="alert" className="warn">
              {error}
            </p>
          )}
          <div className="row end">
            <button className="primary" disabled={busy}>
              {busy ? "올리는 중…" : "댓글 달기"}
            </button>
          </div>
        </form>
      </section>
      <Notice>{COMMUNITY_NOTICE}</Notice>

      {del && (
        <Sheet title="글을 지울까요?" onClose={() => setDel(false)}>
          {post.needsPassword && (
            <label className="form">
              <span>글 비밀번호</span>
              <input
                id="d-pw"
                type="password"
                autoComplete="off"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="warn">
              {error}
            </p>
          )}
          <div className="row end">
            <button className="ghost" onClick={() => setDel(false)}>
              취소
            </button>
            <button className="primary danger" onClick={() => void remove()}>
              삭제하기
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
