import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { LIMITS, SEEDS, type BoardKey, type CommentRow, type PostRow } from "./policy";

// 커뮤니티 DB 접근 (DEC-047). service_role로 읽고 쓰므로 권한 검사는 라우트가 policy.canChange로 직접 한다.
// 본문은 호출한 쪽이 개인정보를 가린 마스킹본만 넘긴다.

type PostDb = {
  id: string;
  board: string;
  title: string;
  body: string;
  nickname: string;
  user_id: string | null;
  pass_hash: string | null;
  comment_count: number;
  report_count: number;
  created_at: string;
  updated_at: string | null;
};
type CommentDb = {
  id: string;
  post_id: string;
  body: string;
  nickname: string;
  user_id: string | null;
  pass_hash: string | null;
  created_at: string;
};

/** 민감정보 동의 기록: 동의한 시각과 정보 종류만 (내용은 담지 않는다) */
export type SensitiveConsent = { at: string; categories: string[] };

const POST_COLS =
  "id, board, title, body, nickname, user_id, pass_hash, comment_count, report_count, created_at, updated_at";
const COMMENT_COLS = "id, post_id, body, nickname, user_id, pass_hash, created_at";

const toPost = (r: PostDb): PostRow & { passHash: string | null } => ({
  id: r.id,
  board: r.board,
  title: r.title,
  body: r.body,
  nickname: r.nickname,
  userId: r.user_id,
  commentCount: r.comment_count,
  reportCount: r.report_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  passHash: r.pass_hash,
});
const toComment = (r: CommentDb): CommentRow & { passHash: string | null } => ({
  id: r.id,
  postId: r.post_id,
  body: r.body,
  nickname: r.nickname,
  userId: r.user_id,
  createdAt: r.created_at,
  passHash: r.pass_hash,
});

export type StoredPost = ReturnType<typeof toPost>;
export type StoredComment = ReturnType<typeof toComment>;

/** 최신순 목록. before(앞 쪽 마지막 글의 작성 시각)보다 오래된 글부터 한 쪽 */
export async function listPosts(board: BoardKey | null, before: string | null) {
  let q = createServiceClient()
    .from("community_posts")
    .select(POST_COLS)
    .order("created_at", { ascending: false })
    .limit(LIMITS.pageSize + 1);
  if (board) q = q.eq("board", board);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q.returns<PostDb[]>();
  if (error || !data) throw new Error("community_posts 조회 실패");
  const page = data.slice(0, LIMITS.pageSize).map(toPost);
  const nextCursor = data.length > LIMITS.pageSize ? page[page.length - 1]?.createdAt : undefined;
  return { items: page, nextCursor };
}

export async function getPost(id: string): Promise<StoredPost | null> {
  const { data, error } = await createServiceClient()
    .from("community_posts")
    .select(POST_COLS)
    .eq("id", id)
    .maybeSingle<PostDb>();
  if (error) throw new Error("community_posts 조회 실패");
  return data ? toPost(data) : null;
}

export async function insertPost(input: {
  board: BoardKey;
  title: string;
  body: string;
  nickname: string;
  userId: string | null;
  passHash: string | null;
  sensitiveConsent?: SensitiveConsent | null;
}): Promise<StoredPost> {
  const { data, error } = await createServiceClient()
    .from("community_posts")
    .insert({
      board: input.board,
      title: input.title,
      body: input.body,
      nickname: input.nickname,
      user_id: input.userId,
      pass_hash: input.passHash,
      sensitive_consent: input.sensitiveConsent ?? null,
    })
    .select(POST_COLS)
    .single<PostDb>();
  if (error || !data) throw new Error("community_posts 저장 실패");
  return toPost(data);
}

export async function updatePost(
  id: string,
  patch: { board: BoardKey; title: string; body: string; sensitiveConsent?: SensitiveConsent },
): Promise<StoredPost> {
  const { data, error } = await createServiceClient()
    .from("community_posts")
    .update({
      board: patch.board,
      title: patch.title,
      body: patch.body,
      ...(patch.sensitiveConsent && { sensitive_consent: patch.sensitiveConsent }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(POST_COLS)
    .single<PostDb>();
  if (error || !data) throw new Error("community_posts 수정 실패");
  return toPost(data);
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await createServiceClient().from("community_posts").delete().eq("id", id);
  if (error) throw new Error("community_posts 삭제 실패");
}

export async function listComments(postId: string): Promise<StoredComment[]> {
  const { data, error } = await createServiceClient()
    .from("community_comments")
    .select(COMMENT_COLS)
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<CommentDb[]>();
  if (error || !data) throw new Error("community_comments 조회 실패");
  return data.map(toComment);
}

export async function getComment(id: string): Promise<StoredComment | null> {
  const { data, error } = await createServiceClient()
    .from("community_comments")
    .select(COMMENT_COLS)
    .eq("id", id)
    .maybeSingle<CommentDb>();
  if (error) throw new Error("community_comments 조회 실패");
  return data ? toComment(data) : null;
}

export async function insertComment(input: {
  postId: string;
  body: string;
  nickname: string;
  userId: string | null;
  passHash: string | null;
  sensitiveConsent?: SensitiveConsent | null;
}): Promise<StoredComment> {
  const { data, error } = await createServiceClient()
    .from("community_comments")
    .insert({
      post_id: input.postId,
      body: input.body,
      nickname: input.nickname,
      user_id: input.userId,
      pass_hash: input.passHash,
      sensitive_consent: input.sensitiveConsent ?? null,
    })
    .select(COMMENT_COLS)
    .single<CommentDb>();
  if (error || !data) throw new Error("community_comments 저장 실패");
  return toComment(data);
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await createServiceClient().from("community_comments").delete().eq("id", id);
  if (error) throw new Error("community_comments 삭제 실패");
}

/** 지워질 글에 달린 로그인 댓글 (글 삭제 때 그 댓글들의 씨앗도 회수한다) */
export async function memberCommentsOf(postId: string): Promise<{ id: string; userId: string }[]> {
  const { data, error } = await createServiceClient()
    .from("community_comments")
    .select("id, user_id")
    .eq("post_id", postId)
    .not("user_id", "is", null)
    .returns<{ id: string; user_id: string }[]>();
  if (error || !data) throw new Error("community_comments 조회 실패");
  return data.map((r) => ({ id: r.id, userId: r.user_id }));
}

export async function reportPost(id: string): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("report_community_post", { p_id: id });
  if (error) throw new Error("report_community_post 실패");
  return data === true;
}

/** 신고 수를 0으로 (관리자 모드). 없는 글이면 false */
export async function clearReports(id: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("community_posts")
    .update({ report_count: 0 })
    .eq("id", id)
    .select("id")
    .returns<{ id: string }[]>();
  if (error) throw new Error("community_posts 수정 실패");
  return (data?.length ?? 0) > 0;
}

/** 씨앗 적립. 하루 상한을 넘었거나 이미 받은 글이면 0. 적립이 실패해도 글쓰기는 막지 않는다 */
export async function awardSeeds(
  userId: string,
  kind: "post" | "comment",
  refId: string,
): Promise<number> {
  const { data, error } = await createServiceClient().rpc("award_seeds", {
    p_user: userId,
    p_kind: kind,
    p_ref: refId,
    p_amount: kind === "post" ? SEEDS.post : SEEDS.comment,
    p_daily_limit: kind === "post" ? SEEDS.postsPerDay : SEEDS.commentsPerDay,
  });
  if (error || typeof data !== "number") return 0;
  return data;
}

/** 지운 글·댓글로 받은 씨앗 회수. 실패해도 삭제는 막지 않는다 */
export async function revokeSeeds(userId: string, refId: string): Promise<number> {
  const { data, error } = await createServiceClient().rpc("revoke_seeds", {
    p_user: userId,
    p_ref: refId,
  });
  if (error || typeof data !== "number") return 0;
  return data;
}

export async function getSeedCounts(
  userId: string,
): Promise<{ balance: number; posts: number; comments: number }> {
  const { data, error } = await createServiceClient()
    .rpc("seed_summary", { p_user: userId })
    .returns<{ balance: number; posts_today: number; comments_today: number }[]>();
  if (error) throw new Error("seed_summary 실패");
  const row = Array.isArray(data) ? data[0] : null;
  return {
    balance: Number(row?.balance ?? 0),
    posts: Number(row?.posts_today ?? 0),
    comments: Number(row?.comments_today ?? 0),
  };
}
