// 커뮤니티·씨앗 브라우저 API (DEC-047). 비밀번호는 요청 본문으로만 보내고 이 기기에 저장하지 않는다.
import { call } from "./api";
import type {
  BoardKey,
  CommentView,
  PostSummary,
  PostView,
  SeedSummary,
} from "@/lib/community/policy";

const base = "/api/v1/community";
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && { body: JSON.stringify(body) }),
});

export type PostDraft = {
  board: BoardKey;
  title: string;
  body: string;
  nickname: string;
  password?: string;
};

export const listPosts = (board: BoardKey | null, cursor?: string) => {
  const q = new URLSearchParams();
  if (board) q.set("board", board);
  if (cursor) q.set("cursor", cursor);
  const qs = q.toString();
  return call<{ items: PostSummary[]; nextCursor?: string }>(`${base}/posts${qs ? `?${qs}` : ""}`);
};

export const getPost = (id: string) =>
  call<{ post: PostView; comments: CommentView[] }>(`${base}/posts/${encodeURIComponent(id)}`);

export const createPost = (draft: PostDraft) =>
  call<{ post: PostView; masked: number; seeds: number }>(`${base}/posts`, json("POST", draft));

export const editPost = (id: string, draft: Omit<PostDraft, "nickname">) =>
  call<{ post: PostView; masked: number }>(
    `${base}/posts/${encodeURIComponent(id)}`,
    json("PATCH", draft),
  );

export const deletePost = (id: string, password?: string) =>
  call<{ deleted: boolean }>(
    `${base}/posts/${encodeURIComponent(id)}`,
    json("DELETE", { password }),
  );

export const createComment = (
  postId: string,
  input: { body: string; nickname: string; password?: string },
) =>
  call<{ comment: CommentView; masked: number; seeds: number }>(
    `${base}/posts/${encodeURIComponent(postId)}/comments`,
    json("POST", input),
  );

export const deleteComment = (id: string, password?: string) =>
  call<{ deleted: boolean }>(
    `${base}/comments/${encodeURIComponent(id)}`,
    json("DELETE", { password }),
  );

export const reportPost = (id: string) =>
  call<{ reported: boolean }>(`${base}/posts/${encodeURIComponent(id)}/report`, json("POST"));

export const getMySeeds = () => call<SeedSummary>("/api/v1/me/seeds");

// 닉네임만 이 기기에 기억한다 (개인정보가 아닌 표시 이름)
const NICK_KEY = "hz:nick";
export function readNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
}
export function writeNickname(v: string) {
  try {
    if (v.trim()) localStorage.setItem(NICK_KEY, v.trim());
    else localStorage.removeItem(NICK_KEY);
  } catch {
    // 저장소를 못 쓰면 다음에 다시 적는다
  }
}

/** 오류를 화면 문장으로. 서버 메시지는 고정 문구라 그대로 써도 입력이 섞이지 않는다 */
export function communityErrorText(e: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}): string {
  const field = e.details?.field;
  const reason = e.details?.reason;
  if (e.code === "FORBIDDEN" && reason === "wrong_password") return "비밀번호가 맞지 않아요.";
  if (e.code === "FORBIDDEN") return "이 글을 쓴 계정으로 로그인해야 해요.";
  if (e.code === "NOT_FOUND") return "지워졌거나 없는 글이에요.";
  if (e.code === "RATE_LIMITED") return "잠시 쉬었다가 다시 써 주세요.";
  if (e.code === "VALIDATION_ERROR" && typeof field === "string") {
    const name =
      {
        title: "제목",
        body: "내용",
        comment: "댓글",
        nickname: "닉네임",
        password: "비밀번호",
        board: "게시판",
      }[field] ?? "입력";
    if (reason === "too_short" || reason === "required")
      return `${name}을(를) 조금 더 길게 적어 주세요.`;
    if (reason === "too_long") return `${name}이(가) 너무 길어요.`;
    return `${name}을(를) 다시 확인해 주세요.`;
  }
  return e.message;
}
