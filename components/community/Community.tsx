"use client";
// 커뮤니티 (DEC-047): 게시판 목록·글쓰기(/community)와 글 보기·댓글(/community/[id]).
// 비로그인도 쓴다 — 그때는 비밀번호를 정해 두고 수정·삭제에 쓴다. 로그인하면 계정으로 수정·삭제하고 씨앗이 쌓인다.
// AI를 부르지 않는다. 글은 이용자 의견이라 AI_NOTICE 대신 COMMUNITY_NOTICE를 붙인다.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { HamzziJudge } from "@/components/HamzziJudge";
import { useQuota } from "@/components/useQuota";
import { isSignedIn, type ApiResult } from "@/lib/client/api";
import {
  clearReports,
  communityErrorText,
  createComment,
  createPost,
  deleteComment,
  deletePost,
  editPost,
  getMySeeds,
  getPost,
  listPosts,
  readNickname,
  reportPost,
  withSensitiveConsent,
  writeNickname,
} from "@/lib/client/community";
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
  type SeedSummary,
} from "@/lib/community/policy";

const card = "rounded-panel border-line border bg-white px-[18px] py-[20px] lg:px-7 lg:py-6";
const input =
  "border-line text-ink focus:border-gold w-full rounded-card border bg-white px-3 py-2.5 text-[15px] outline-none";
const primary =
  "bg-honey border-honey-line text-ink hover:border-gold min-h-11 rounded-full border px-5 text-[15px] font-bold disabled:opacity-50";
const ghost =
  "border-line text-ink hover:border-gold min-h-11 rounded-full border bg-white px-4 text-[14px] font-semibold disabled:opacity-50";
const chip = "bg-cream text-gold rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 민감한 내용으로 보이는 글을 올릴지 묻는다 */
const askSensitive = () => window.confirm(SENSITIVE_ASK);

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 py-8 lg:py-10">{children}</div>
  );
}

function Notice() {
  return <p className="text-muted text-[12px] leading-relaxed">{COMMUNITY_NOTICE}</p>;
}

function Author({ nickname, member }: { nickname: string; member: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-ink font-semibold">{nickname}</span>
      {member && <span className={chip}>로그인</span>}
    </span>
  );
}

/** 씨앗 안내: 로그인하면 내 씨앗, 아니면 쌓는 방법 */
function SeedCard({ signedIn, refreshKey }: { signedIn: boolean; refreshKey: number }) {
  const [seeds, setSeeds] = useState<SeedSummary | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void getMySeeds().then((r) => {
      if (live && r.ok && typeof r.data?.balance === "number") setSeeds(r.data);
    });
    return () => {
      live = false;
    };
  }, [signedIn, refreshKey]);

  return (
    <section
      aria-label="씨앗 안내"
      className="rounded-panel border-honey-line bg-cream border px-4 py-3"
    >
      {signedIn && seeds ? (
        <p className="text-ink text-[14px]" data-testid="seed-balance">
          <b>내 씨앗 {seeds.balance.toLocaleString("ko-KR")}개</b>
          <span className="text-muted">
            {" "}
            · 오늘 글 {seeds.today.posts}/{seeds.today.postsLimit} · 댓글 {seeds.today.comments}/
            {seeds.today.commentsLimit}
          </span>
        </p>
      ) : (
        <p className="text-ink text-[14px]">
          <b>씨앗을 모아 보세요.</b>{" "}
          <span className="text-muted">
            {signedIn
              ? "글과 댓글을 쓰면 씨앗이 쌓여요."
              : "로그인하고 글·댓글을 쓰면 씨앗이 쌓여요."}
          </span>
        </p>
      )}
      <p className="text-muted mt-1 text-[12px] leading-relaxed">
        글 하나에 씨앗 {SEEDS.post}개, 댓글 하나에 {SEEDS.comment}개. 씨앗은 활동 기록이에요.
        햄찌법원은 전면 무료라 씨앗을 돈이나 할인으로 바꾸지 않아요.
        {!signedIn && (
          <>
            {" "}
            <Link href="/me" className="text-link underline-offset-2 hover:underline">
              로그인하러 가기
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

type Draft = { board: BoardKey; title: string; body: string; nickname: string; password: string };

function PostForm({
  signedIn,
  initial,
  editing,
  needsPassword,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  signedIn: boolean;
  initial: Draft;
  editing: boolean;
  needsPassword: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (d: Draft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(d);
  };
  return (
    <form
      onSubmit={submit}
      className={`${card} space-y-3`}
      aria-label={editing ? "글 수정" : "글쓰기"}
    >
      <div className="flex flex-wrap gap-2">
        <label className="min-w-[150px] flex-1">
          <span className="text-muted mb-1 block text-[13px]">게시판</span>
          <select
            className={input}
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
        {!editing && (
          <label className="min-w-[150px] flex-1">
            <span className="text-muted mb-1 block text-[13px]">닉네임</span>
            <input
              className={input}
              value={d.nickname}
              maxLength={LIMITS.nickname.max}
              placeholder={DEFAULT_NICKNAME}
              onChange={(e) => set("nickname", e.target.value)}
            />
          </label>
        )}
        {needsPassword && (
          <label className="min-w-[150px] flex-1">
            <span className="text-muted mb-1 block text-[13px]">
              {editing ? "글 비밀번호" : "비밀번호 (수정·삭제할 때 써요)"}
            </span>
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              value={d.password}
              minLength={LIMITS.password.min}
              maxLength={LIMITS.password.max}
              required
              onChange={(e) => set("password", e.target.value)}
            />
          </label>
        )}
      </div>
      <label className="block">
        <span className="text-muted mb-1 block text-[13px]">제목</span>
        <input
          className={input}
          value={d.title}
          maxLength={LIMITS.title.max}
          required
          onChange={(e) => set("title", e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-muted mb-1 block text-[13px]">내용</span>
        <textarea
          className={`${input} min-h-[180px] leading-relaxed`}
          value={d.body}
          maxLength={LIMITS.body.max}
          required
          onChange={(e) => set("body", e.target.value)}
        />
      </label>
      <p className="text-muted text-[12px] leading-relaxed">
        이름·연락처·주소처럼 보이는 내용은 올릴 때 자동으로 가려져요.
        {!signedIn && " 비밀번호는 다시 알려 드릴 수 없으니 기억해 두세요."}
      </p>
      {error && (
        <p role="alert" className="text-warn-text text-[13px]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" className={primary} disabled={busy}>
          {busy ? "올리는 중…" : editing ? "수정하기" : "올리기"}
        </button>
      </div>
    </form>
  );
}

function resultNote(masked: number, seeds: number): string | null {
  const parts: string[] = [];
  if (masked > 0) parts.push(`개인정보로 보이는 ${masked}곳을 가렸어요.`);
  if (seeds > 0) parts.push(`씨앗 ${seeds}개가 쌓였어요.`);
  return parts.length ? parts.join(" ") : null;
}

// 방금 올린 글의 안내(가린 곳·씨앗)를 글 화면으로 건넨다. 개인정보가 아닌 안내 문장뿐이다
const NOTE_KEY = "hz:cnote";
function passNote(note: string | null) {
  try {
    if (note) sessionStorage.setItem(NOTE_KEY, note);
  } catch {
    // 안내만 빠진다
  }
}
function takeNote(): string | null {
  try {
    const v = sessionStorage.getItem(NOTE_KEY);
    sessionStorage.removeItem(NOTE_KEY);
    return v;
  } catch {
    return null;
  }
}

export function CommunityBoard() {
  const router = useRouter();
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  const [board, setBoard] = useState<BoardKey | null>(null);
  const [list, setList] = useState<ApiResult<{ items: PostSummary[]; nextCursor?: string }> | null>(
    null,
  );
  const [more, setMore] = useState(false);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void listPosts(board).then((r) => {
      if (live) setList(r);
    });
    return () => {
      live = false;
    };
  }, [board]);

  const pick = (b: BoardKey | null) => {
    if (b === board) return;
    setList(null);
    setBoard(b);
  };

  const loadMore = async () => {
    if (!list?.ok || !list.data.nextCursor) return;
    setMore(true);
    const r = await listPosts(board, list.data.nextCursor);
    setMore(false);
    if (r.ok)
      setList({
        ok: true,
        data: { items: [...list.data.items, ...r.data.items], nextCursor: r.data.nextCursor },
      });
  };

  const submit = async (d: Draft) => {
    setBusy(true);
    setError(null);
    const r = await withSensitiveConsent(
      (sensitiveConsent) =>
        createPost({
          board: d.board,
          title: d.title,
          body: d.body,
          nickname: d.nickname,
          ...(!signedIn && { password: d.password }),
          ...(sensitiveConsent && { sensitiveConsent }),
        }),
      askSensitive,
    );
    setBusy(false);
    if (!r.ok) return setError(communityErrorText(r.error));
    writeNickname(d.nickname);
    passNote(resultNote(r.data.masked, r.data.seeds));
    router.push(`/community/${r.data.post.id}`);
  };

  const tab = (active: boolean) =>
    `min-h-10 rounded-full border px-3.5 text-[14px] font-semibold whitespace-nowrap ${
      active
        ? "bg-honey border-honey-line text-ink"
        : "border-line text-muted hover:border-gold bg-white"
    }`;

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <HamzziJudge size={56} />
          <div>
            <h1 className="font-display text-ink text-[26px] font-bold">커뮤니티</h1>
            <p className="text-muted text-[14px]">
              법 이야기부터 잡담까지, 로그인 없이도 편하게 나눠요.
            </p>
          </div>
        </div>
        {!writing && (
          <button
            type="button"
            className={`${primary} shrink-0 whitespace-nowrap`}
            onClick={() => setWriting(true)}
          >
            글쓰기
          </button>
        )}
      </header>

      <SeedCard signedIn={signedIn} refreshKey={0} />

      {writing && (
        <PostForm
          signedIn={signedIn}
          editing={false}
          needsPassword={!signedIn}
          busy={busy}
          error={error}
          initial={{
            board: board ?? DEFAULT_BOARD,
            title: "",
            body: "",
            nickname: readNickname(),
            password: "",
          }}
          onSubmit={submit}
          onCancel={() => {
            setWriting(false);
            setError(null);
          }}
        />
      )}

      <div role="tablist" aria-label="게시판" className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          role="tab"
          aria-selected={board === null}
          className={tab(board === null)}
          onClick={() => pick(null)}
        >
          전체
        </button>
        {BOARDS.map((b) => (
          <button
            key={b.key}
            type="button"
            role="tab"
            aria-selected={board === b.key}
            title={b.hint}
            className={tab(board === b.key)}
            onClick={() => pick(b.key)}
          >
            {b.name}
          </button>
        ))}
      </div>

      <section aria-label="글 목록" className={`${card} !py-2`}>
        {!list && <p className="text-muted py-6 text-[15px]">불러오는 중…</p>}
        {list && !list.ok && (
          <p role="alert" className="text-warn-text py-6 text-[15px]">
            글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {list?.ok && list.data.items.length === 0 && (
          <p className="text-muted py-8 text-center text-[15px]">
            아직 글이 없어요. 첫 글을 남겨 보세요.
          </p>
        )}
        {list?.ok && list.data.items.length > 0 && (
          <ul className="divide-line divide-y">
            {list.data.items.map((p) => (
              <li key={p.id}>
                <Link href={`/community/${p.id}`} className="hover:bg-cream/50 block px-1 py-3.5">
                  <span className="flex items-center gap-2">
                    <span className={chip}>{boardName(p.board)}</span>
                    <span className="text-ink min-w-0 flex-1 truncate text-[15px] font-semibold">
                      {p.title}
                    </span>
                    {p.commentCount > 0 && (
                      <span className="text-gold shrink-0 text-[13px] font-bold">
                        댓글 {p.commentCount}
                      </span>
                    )}
                  </span>
                  <span className="text-muted mt-1 flex items-center gap-2 text-[12px]">
                    <Author nickname={p.nickname} member={p.member} />
                    <span>{timeOf(p.createdAt)}</span>
                    {p.reportCount !== undefined && p.reportCount > 0 && (
                      <span className="text-warn-text">신고 {p.reportCount}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list?.ok && list.data.nextCursor && (
          <div className="py-3 text-center">
            <button type="button" className={ghost} onClick={loadMore} disabled={more}>
              {more ? "불러오는 중…" : "더 보기"}
            </button>
          </div>
        )}
      </section>
      <Notice />
    </Shell>
  );
}

/** 비밀번호가 필요한 삭제: 누르면 비밀번호 칸이 열린다 */
function DeleteControl({
  needsPassword,
  label,
  onDelete,
}: {
  needsPassword: boolean;
  label: string;
  onDelete: (password?: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    const e = await onDelete(needsPassword ? password : undefined);
    setBusy(false);
    setError(e);
  };
  if (!open)
    return (
      <button
        type="button"
        className="text-muted hover:text-ink text-[13px] underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {needsPassword && (
        <input
          type="password"
          aria-label="비밀번호"
          placeholder="비밀번호"
          autoComplete="off"
          className={`${input} !w-36 !py-1.5 text-[13px]`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
      <button
        type="button"
        className="text-warn-text text-[13px] font-semibold"
        disabled={busy}
        onClick={run}
      >
        {busy ? "지우는 중…" : "정말 삭제"}
      </button>
      <button type="button" className="text-muted text-[13px]" onClick={() => setOpen(false)}>
        취소
      </button>
      {error && (
        <span role="alert" className="text-warn-text text-[12px]">
          {error}
        </span>
      )}
    </span>
  );
}

export function PostRoute() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const quota = useQuota();
  const signedIn = isSignedIn(quota);
  const admin = quota?.admin === true;
  const [data, setData] = useState<ApiResult<{ post: PostView; comments: CommentView[] }> | null>(
    null,
  );
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState({ body: "", nickname: "", password: "" });
  const [commentError, setCommentError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const load = useCallback(() => getPost(id).then(setData), [id]);
  useEffect(() => {
    let live = true;
    void getPost(id).then((r) => {
      if (!live) return;
      setData(r);
      setNote(takeNote());
      setComment((c) => ({ ...c, nickname: readNickname() }));
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!data)
    return (
      <Shell>
        <p className="text-muted">불러오는 중…</p>
      </Shell>
    );
  if (!data.ok)
    return (
      <Shell>
        <Link href="/community" className="text-link text-sm underline-offset-2 hover:underline">
          ← 커뮤니티
        </Link>
        <p role="alert" className="text-warn-text">
          {communityErrorText(data.error)}
        </p>
      </Shell>
    );

  const { post, comments } = data.data;
  const canManage = post.mine || post.needsPassword;

  const saveEdit = async (d: Draft) => {
    setBusy(true);
    setError(null);
    const r = await withSensitiveConsent(
      (sensitiveConsent) =>
        editPost(post.id, {
          board: d.board,
          title: d.title,
          body: d.body,
          ...(post.needsPassword && { password: d.password }),
          ...(sensitiveConsent && { sensitiveConsent }),
        }),
      askSensitive,
    );
    setBusy(false);
    if (!r.ok) return setError(communityErrorText(r.error));
    setEditing(false);
    setNote(resultNote(r.data.masked, 0));
    void load();
  };

  const removePost = async (password?: string) => {
    const r = await deletePost(post.id, password);
    if (!r.ok) return communityErrorText(r.error);
    router.push("/community");
    return null;
  };

  const sendComment = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setCommentError(null);
    const r = await withSensitiveConsent(
      (sensitiveConsent) =>
        createComment(post.id, {
          body: comment.body,
          nickname: comment.nickname,
          ...(!signedIn && { password: comment.password }),
          ...(sensitiveConsent && { sensitiveConsent }),
        }),
      askSensitive,
    );
    setBusy(false);
    if (!r.ok) return setCommentError(communityErrorText(r.error));
    writeNickname(comment.nickname);
    setComment((c) => ({ ...c, body: "", password: "" }));
    setNote(resultNote(r.data.masked, r.data.seeds));
    void load();
  };

  const removeComment = async (c: CommentView, password?: string) => {
    const r = await deleteComment(c.id, password);
    if (!r.ok) return communityErrorText(r.error);
    void load();
    return null;
  };

  return (
    <Shell>
      <Link href="/community" className="text-link text-sm underline-offset-2 hover:underline">
        ← 커뮤니티
      </Link>

      {note && (
        <p
          role="status"
          className="rounded-card border-honey-line bg-cream text-ink border px-3 py-2 text-[13px]"
        >
          {note}
        </p>
      )}

      {editing ? (
        <PostForm
          signedIn={signedIn}
          editing
          needsPassword={post.needsPassword}
          busy={busy}
          error={error}
          initial={{
            board: post.board as BoardKey,
            title: post.title,
            body: post.body,
            nickname: post.nickname,
            password: "",
          }}
          onSubmit={saveEdit}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
        />
      ) : (
        <article className={card}>
          <span className={chip}>{boardName(post.board)}</span>
          <h1 className="font-display text-ink mt-2 text-[22px] leading-snug font-bold break-words">
            {post.title}
          </h1>
          <p className="text-muted mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            <Author nickname={post.nickname} member={post.member} />
            <span>{timeOf(post.createdAt)}</span>
            {post.updatedAt && <span>(수정됨)</span>}
          </p>
          <div className="text-ink mt-5 text-[15px] leading-[1.8] break-words whitespace-pre-line">
            {post.body}
          </div>
          <div className="border-line mt-6 flex flex-wrap items-center gap-4 border-t pt-4">
            {canManage && !(post.folded && !admin) && (
              <button
                type="button"
                className="text-muted hover:text-ink text-[13px] underline-offset-2 hover:underline"
                onClick={() => setEditing(true)}
              >
                수정
              </button>
            )}
            {(canManage || admin) && (
              <DeleteControl
                label={admin && !post.mine ? "삭제 (관리자)" : "삭제"}
                needsPassword={post.needsPassword && !admin}
                onDelete={removePost}
              />
            )}
            {admin && (post.reportCount ?? 0) > 0 && (
              <button
                type="button"
                className="text-muted hover:text-ink text-[13px] underline-offset-2 hover:underline"
                onClick={async () => {
                  const r = await clearReports(post.id);
                  if (r.ok) void load();
                }}
              >
                신고 {post.reportCount}건 초기화 (관리자)
              </button>
            )}
            <button
              type="button"
              className="text-muted hover:text-ink ml-auto text-[13px] underline-offset-2 hover:underline disabled:no-underline"
              disabled={reported}
              onClick={async () => {
                const r = await reportPost(post.id);
                if (r.ok) setReported(true);
              }}
            >
              {reported ? "신고했어요" : "신고"}
            </button>
          </div>
        </article>
      )}

      <section aria-labelledby="c-comments" className={card}>
        <h2 id="c-comments" className="text-ink text-lg font-bold">
          댓글 {comments.length}
        </h2>
        {comments.length === 0 && (
          <p className="text-muted mt-3 text-[14px]">첫 댓글을 남겨 보세요.</p>
        )}
        <ul className="divide-line mt-2 divide-y">
          {comments.map((c) => (
            <li key={c.id} className="py-3">
              <p className="text-muted flex flex-wrap items-center gap-2 text-[12px]">
                <Author nickname={c.nickname} member={c.member} />
                <span>{timeOf(c.createdAt)}</span>
                {(c.mine || c.needsPassword || admin) && (
                  <span className="ml-auto">
                    <DeleteControl
                      label="삭제"
                      needsPassword={c.needsPassword && !admin}
                      onDelete={(pw) => removeComment(c, pw)}
                    />
                  </span>
                )}
              </p>
              <p className="text-ink mt-1 text-[15px] leading-relaxed break-words whitespace-pre-line">
                {c.body}
              </p>
            </li>
          ))}
        </ul>

        <form
          onSubmit={sendComment}
          className="border-line mt-3 space-y-2 border-t pt-4"
          aria-label="댓글 쓰기"
        >
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="닉네임"
              className={`${input} min-w-[130px] flex-1`}
              placeholder={DEFAULT_NICKNAME}
              maxLength={LIMITS.nickname.max}
              value={comment.nickname}
              onChange={(e) => setComment((c) => ({ ...c, nickname: e.target.value }))}
            />
            {!signedIn && (
              <input
                aria-label="댓글 비밀번호"
                type="password"
                autoComplete="new-password"
                className={`${input} min-w-[130px] flex-1`}
                placeholder="비밀번호 (삭제할 때 써요)"
                minLength={LIMITS.password.min}
                maxLength={LIMITS.password.max}
                required
                value={comment.password}
                onChange={(e) => setComment((c) => ({ ...c, password: e.target.value }))}
              />
            )}
          </div>
          <textarea
            aria-label="댓글 내용"
            className={`${input} min-h-[84px] leading-relaxed`}
            placeholder="댓글을 남겨 보세요"
            maxLength={LIMITS.comment.max}
            required
            value={comment.body}
            onChange={(e) => setComment((c) => ({ ...c, body: e.target.value }))}
          />
          {commentError && (
            <p role="alert" className="text-warn-text text-[13px]">
              {commentError}
            </p>
          )}
          <div className="flex justify-end">
            <button type="submit" className={primary} disabled={busy}>
              {busy ? "올리는 중…" : "댓글 달기"}
            </button>
          </div>
        </form>
      </section>
      <Notice />
    </Shell>
  );
}
