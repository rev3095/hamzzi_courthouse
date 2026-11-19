import "server-only";

import { ApiError } from "@/lib/api/errors";
import type { RequestScope } from "@/lib/api/route";
import { isAdminRequest } from "@/lib/auth/admin-session";
import { assertRateLimit, type RateRule } from "@/lib/auth/rate-limit";
import { getActor } from "@/lib/auth/server";
import { scanInput } from "@/lib/pii";
import { hashPassword, verifyPassword } from "./password";
import {
  canChange,
  cleanNickname,
  commentView,
  earnsSeeds,
  isBoard,
  parseComment,
  parsePost,
  passwordError,
  postSummary,
  postView,
  seedSummary,
  type FieldError,
  type Viewer,
} from "./policy";
import * as store from "./store";

// 커뮤니티 흐름 (DEC-047): 라우트는 이 모듈만 부른다. 입력 검사 → 개인정보 가리기 → 저장 → 씨앗 적립.
// 원문·비밀번호는 저장·로그·에러 어디에도 남기지 않는다(절대 규칙 4). 에러 details에는 필드 이름과 이유만 싣는다.

/** 글쓰기·수정: 같은 네트워크 1시간 10회 */
export const POST_RATE: RateRule = { bucket: "community_post", limit: 10, windowSeconds: 3600 };
/** 댓글: 같은 네트워크 1시간 30회 */
export const COMMENT_RATE: RateRule = {
  bucket: "community_comment",
  limit: 30,
  windowSeconds: 3600,
};
/** 삭제·신고·비밀번호 확인: 같은 네트워크 1시간 20회 (비밀번호 대입 방지) */
export const MANAGE_RATE: RateRule = { bucket: "community_manage", limit: 20, windowSeconds: 3600 };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalid = (e: FieldError) =>
  new ApiError("VALIDATION_ERROR", { field: e.field, reason: e.reason });

function assertId(id: string) {
  if (!UUID.test(id)) throw new ApiError("NOT_FOUND");
}

export async function viewerOf(scope: RequestScope): Promise<Viewer> {
  const [actor, admin] = await Promise.all([getActor(scope), isAdminRequest()]);
  return { userId: actor?.userId ?? null, admin };
}

/** 가린 본문과 가린 곳 수. 호출한 쪽은 원문을 더 쓰지 않는다 */
function mask(text: string): { text: string; masked: number } {
  const scan = scanInput(text);
  return { text: scan.maskedText, masked: scan.findings.length };
}

/**
 * 민감정보(건강·범죄경력 등)로 보이는 글은 올리는 사람이 동의해야 받는다 (F-007 AC2).
 * 누구나 보는 글이라 질문 입력과 같은 기준으로 묻고, 동의한 시각과 종류만 남긴다. 해당 없으면 null
 */
function sensitiveConsent(raw: string[], consent: unknown) {
  const categories = [...new Set(raw.flatMap((t) => scanInput(t).sensitive))];
  if (categories.length === 0) return null;
  if (consent !== true) {
    throw new ApiError("CONSENT_REQUIRED", { kind: "sensitive_info", categories });
  }
  return { at: new Date().toISOString(), categories };
}

/** 작성자 정보: 로그인이면 계정, 비로그인이면 비밀번호 해시 */
function authorOf(viewer: Viewer, input: { nickname?: unknown; password?: unknown }) {
  const nick = cleanNickname(input.nickname);
  if ("error" in nick) throw invalid(nick.error);
  // 닉네임에 연락처·이름 같은 개인정보 패턴이 있으면 받지 않는다
  if (scanInput(nick.nickname).findings.length > 0) {
    throw invalid({ field: "nickname", reason: "invalid" });
  }
  if (viewer.userId) return { nickname: nick.nickname, userId: viewer.userId, passHash: null };
  const pe = passwordError(input.password);
  if (pe) throw invalid(pe);
  return {
    nickname: nick.nickname,
    userId: null,
    passHash: hashPassword(input.password as string),
  };
}

export async function listPosts(viewer: Viewer, board: string | null, cursor: string | null) {
  if (board !== null && !isBoard(board)) throw invalid({ field: "board", reason: "invalid" });
  const before = cursor && !Number.isNaN(Date.parse(cursor)) ? cursor : null;
  const { items, nextCursor } = await store.listPosts(board, before);
  return { items: items.map((p) => postSummary(p, viewer)), nextCursor };
}

export async function readPost(viewer: Viewer, id: string) {
  assertId(id);
  const post = await store.getPost(id);
  if (!post) throw new ApiError("NOT_FOUND");
  const comments = await store.listComments(id);
  return {
    post: postView(post, viewer),
    comments: comments.map((c) => commentView(c, viewer)),
  };
}

type PostBody = {
  board?: unknown;
  title?: unknown;
  body?: unknown;
  nickname?: unknown;
  password?: unknown;
  sensitiveConsent?: unknown;
};

export async function createPost(viewer: Viewer, headers: Headers, input: PostBody) {
  await assertRateLimit(POST_RATE, headers);
  const parsed = parsePost(input);
  if ("error" in parsed) throw invalid(parsed.error);
  const author = authorOf(viewer, input);
  const consent = sensitiveConsent([parsed.value.title, parsed.value.body], input.sensitiveConsent);
  const title = mask(parsed.value.title);
  const body = mask(parsed.value.body);
  const post = await store.insertPost({
    board: parsed.value.board,
    title: title.text,
    body: body.text,
    sensitiveConsent: consent,
    ...author,
  });
  const seeds =
    viewer.userId && earnsSeeds("post", body.text)
      ? await store.awardSeeds(viewer.userId, "post", post.id)
      : 0;
  return { post: postView(post, viewer), masked: title.masked + body.masked, seeds };
}

export async function editPost(viewer: Viewer, headers: Headers, id: string, input: PostBody) {
  assertId(id);
  await assertRateLimit(MANAGE_RATE, headers);
  const post = await store.getPost(id);
  if (!post) throw new ApiError("NOT_FOUND");
  if (!canChange("edit", post, viewer, verifyPassword(input.password, post.passHash))) {
    throw new ApiError("FORBIDDEN", { reason: post.userId ? "not_owner" : "wrong_password" });
  }
  const parsed = parsePost({ ...input, board: input.board ?? post.board });
  if ("error" in parsed) throw invalid(parsed.error);
  const consent = sensitiveConsent([parsed.value.title, parsed.value.body], input.sensitiveConsent);
  const title = mask(parsed.value.title);
  const body = mask(parsed.value.body);
  const saved = await store.updatePost(id, {
    board: parsed.value.board,
    title: title.text,
    body: body.text,
    ...(consent && { sensitiveConsent: consent }),
  });
  return { post: postView(saved, viewer), masked: title.masked + body.masked };
}

export async function removePost(
  viewer: Viewer,
  headers: Headers,
  id: string,
  input: { password?: unknown },
) {
  assertId(id);
  await assertRateLimit(MANAGE_RATE, headers);
  const post = await store.getPost(id);
  if (!post) throw new ApiError("NOT_FOUND");
  if (!canChange("delete", post, viewer, verifyPassword(input.password, post.passHash))) {
    throw new ApiError("FORBIDDEN", { reason: post.userId ? "not_owner" : "wrong_password" });
  }
  // 글과 함께 지워지는 댓글로 받은 씨앗도 되돌린다
  const comments = await store.memberCommentsOf(id);
  await store.deletePost(id);
  if (post.userId) await store.revokeSeeds(post.userId, id);
  for (const c of comments) await store.revokeSeeds(c.userId, c.id);
  return { deleted: true };
}

export async function createComment(
  viewer: Viewer,
  headers: Headers,
  postId: string,
  input: { body?: unknown; nickname?: unknown; password?: unknown; sensitiveConsent?: unknown },
) {
  assertId(postId);
  await assertRateLimit(COMMENT_RATE, headers);
  const parsed = parseComment(input.body);
  if ("error" in parsed) throw invalid(parsed.error);
  const author = authorOf(viewer, input);
  if (!(await store.getPost(postId))) throw new ApiError("NOT_FOUND");
  const consent = sensitiveConsent([parsed.body], input.sensitiveConsent);
  const body = mask(parsed.body);
  const comment = await store.insertComment({
    postId,
    body: body.text,
    sensitiveConsent: consent,
    ...author,
  });
  const seeds =
    viewer.userId && earnsSeeds("comment", body.text)
      ? await store.awardSeeds(viewer.userId, "comment", comment.id)
      : 0;
  return { comment: commentView(comment, viewer), masked: body.masked, seeds };
}

export async function removeComment(
  viewer: Viewer,
  headers: Headers,
  id: string,
  input: { password?: unknown },
) {
  assertId(id);
  await assertRateLimit(MANAGE_RATE, headers);
  const comment = await store.getComment(id);
  if (!comment) throw new ApiError("NOT_FOUND");
  if (!canChange("delete", comment, viewer, verifyPassword(input.password, comment.passHash))) {
    throw new ApiError("FORBIDDEN", { reason: comment.userId ? "not_owner" : "wrong_password" });
  }
  await store.deleteComment(id);
  if (comment.userId) await store.revokeSeeds(comment.userId, id);
  return { deleted: true };
}

export async function report(headers: Headers, id: string) {
  assertId(id);
  await assertRateLimit(MANAGE_RATE, headers);
  // 같은 네트워크는 한 글을 하루에 한 번만 센다 — 한 사람이 되풀이 신고해 글을 가리지 못하게
  try {
    await assertRateLimit(
      { bucket: `community_report_${id}`, limit: 1, windowSeconds: 86_400 },
      headers,
    );
  } catch (e) {
    if (e instanceof ApiError && e.code === "RATE_LIMITED") return { reported: true };
    throw e;
  }
  if (!(await store.reportPost(id))) throw new ApiError("NOT_FOUND");
  return { reported: true };
}

/** 신고 수를 0으로 되돌려 가려진 글을 다시 보이게 한다 (관리자 모드만) */
export async function clearReports(viewer: Viewer, id: string) {
  assertId(id);
  if (!viewer.admin) throw new ApiError("FORBIDDEN");
  if (!(await store.clearReports(id))) throw new ApiError("NOT_FOUND");
  return { cleared: true };
}

export async function mySeeds(userId: string) {
  const c = await store.getSeedCounts(userId);
  return seedSummary(c.balance, c.posts, c.comments);
}
