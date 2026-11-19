// 커뮤니티·씨앗 순수 규칙 (DEC-047). 서버 모듈을 끌어오지 않는다 — 화면도 이 파일의 게시판 목록·길이 제한을 같이 쓴다.
// 게시글은 이용자 의견이고 법률 자문이 아니다. 승패·유불리를 판정하는 기능은 없다(절대 규칙 2).

export const BOARDS = [
  { key: "free", name: "자유게시판", hint: "아무 이야기나 편하게" },
  { key: "opinion", name: "법·제도 의견", hint: "법과 제도에 대한 생각" },
  { key: "whatif", name: "만약에", hint: "가정해 보는 질문" },
  { key: "story", name: "경험담", hint: "직접 겪은 절차 이야기" },
  { key: "tips", name: "정보·꿀팁", hint: "알아 두면 좋은 정보" },
  { key: "feedback", name: "햄찌법원 건의", hint: "바라는 점·불편한 점" },
] as const;

export type BoardKey = (typeof BOARDS)[number]["key"];
export const DEFAULT_BOARD: BoardKey = "free";

export const isBoard = (v: unknown): v is BoardKey =>
  typeof v === "string" && BOARDS.some((b) => b.key === v);
export const boardName = (key: string) => BOARDS.find((b) => b.key === key)?.name ?? key;

/** 게시글 아래에 늘 붙이는 고지 */
export const COMMUNITY_NOTICE =
  "게시글과 댓글은 이용자 의견이며 법률 자문이 아닙니다. 이름·연락처 같은 개인정보는 자동으로 가려집니다.";

export const LIMITS = {
  title: { min: 2, max: 80 },
  body: { min: 2, max: 4000 },
  comment: { min: 1, max: 1000 },
  nickname: { min: 2, max: 12 },
  password: { min: 4, max: 32 },
  pageSize: 20,
} as const;

export const DEFAULT_NICKNAME = "익명 햄찌";

/**
 * 씨앗 (DEC-047): 로그인 사용자의 커뮤니티 활동에 쌓이는 포인트. 씨앗 하나가 할인 1원의 가치다.
 * 글 100개 = 1,000씨앗 = 1,000원, 댓글 200개 = 1,000씨앗 = 1,000원.
 * 사용(구독·유료 결제 할인)은 과금 게이트(F-013) 승인 전까지 꺼져 있다(절대 규칙 5) — 지금은 쌓이기만 한다.
 * 현금으로 바꾸거나 남에게 줄 수 없다.
 */
export const SEEDS = {
  post: 10,
  comment: 5,
  wonPerSeed: 1,
  /** 하루에 씨앗을 받는 글·댓글 수 (그 뒤에도 글은 쓸 수 있고 씨앗만 쌓이지 않는다) */
  postsPerDay: 5,
  commentsPerDay: 10,
  /** 이보다 짧은 글·댓글에는 씨앗이 쌓이지 않는다 */
  postMinChars: 30,
  commentMinChars: 10,
  /** 할인에 쓸 수 있는 최소 단위 (사용이 열렸을 때) */
  redeemUnit: 1000,
  redeemEnabled: false,
} as const;

export const seedsToWon = (seeds: number) => Math.max(0, Math.floor(seeds)) * SEEDS.wonPerSeed;

/** 지금 할인에 쓸 수 있는 금액(원). 사용이 꺼져 있으면 0 */
export function redeemableWon(balance: number): number {
  if (!SEEDS.redeemEnabled) return 0;
  return Math.floor(seedsToWon(balance) / SEEDS.redeemUnit) * SEEDS.redeemUnit;
}

/** 이 글·댓글이 씨앗을 받을 길이인지 (공백을 뺀 글자 수) */
export function earnsSeeds(kind: "post" | "comment", body: string): boolean {
  const n = body.replace(/\s/g, "").length;
  return n >= (kind === "post" ? SEEDS.postMinChars : SEEDS.commentMinChars);
}

export type FieldError = {
  field: string;
  reason: "required" | "too_short" | "too_long" | "invalid";
};

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

function lengthError(field: keyof typeof LIMITS & string, value: string): FieldError | null {
  const lim = LIMITS[field as "title" | "body" | "comment" | "nickname" | "password"];
  if (!value) return { field, reason: "required" };
  if (value.length < lim.min) return { field, reason: "too_short" };
  if (value.length > lim.max) return { field, reason: "too_long" };
  return null;
}

/** 닉네임: 비우면 기본값. 줄바꿈·제어문자는 받지 않는다 */
export function cleanNickname(v: unknown): { nickname: string } | { error: FieldError } {
  const nickname = str(v).replace(/\s+/g, " ") || DEFAULT_NICKNAME;
  const e = lengthError("nickname", nickname);
  if (e) return { error: e };
  if (/[\u0000-\u001f<>]/.test(nickname))
    return { error: { field: "nickname", reason: "invalid" } };
  return { nickname };
}

/** 비밀번호: 비로그인일 때만 필요하다. 앞뒤 공백도 그대로 쓴다 */
export function passwordError(v: unknown): FieldError | null {
  if (typeof v !== "string" || !v) return { field: "password", reason: "required" };
  if (v.length < LIMITS.password.min) return { field: "password", reason: "too_short" };
  if (v.length > LIMITS.password.max) return { field: "password", reason: "too_long" };
  return null;
}

export type PostInput = { board: BoardKey; title: string; body: string };

export function parsePost(input: {
  board?: unknown;
  title?: unknown;
  body?: unknown;
}): { value: PostInput } | { error: FieldError } {
  if (!isBoard(input.board)) return { error: { field: "board", reason: "invalid" } };
  const title = str(input.title).replace(/\s+/g, " ");
  const body = str(input.body);
  const e = lengthError("title", title) ?? lengthError("body", body);
  if (e) return { error: e };
  return { value: { board: input.board, title, body } };
}

export function parseComment(v: unknown): { body: string } | { error: FieldError } {
  const body = str(v);
  const e = lengthError("comment", body);
  if (e) return { error: e };
  return { body };
}

export type Viewer = { userId: string | null; admin: boolean };
export type Authored = { userId: string | null };

/**
 * 수정·삭제 권한. 로그인 글은 그 계정만, 비로그인 글은 비밀번호가 맞을 때만.
 * 관리자 모드는 지울 수만 있다(운영 정리) — 남의 글을 고치지는 못한다.
 */
export function canChange(
  action: "edit" | "delete",
  row: Authored,
  viewer: Viewer,
  passwordMatches: boolean,
): boolean {
  if (action === "delete" && viewer.admin) return true;
  if (row.userId) return viewer.userId === row.userId;
  return passwordMatches;
}

export type PostRow = {
  id: string;
  board: string;
  title: string;
  body: string;
  nickname: string;
  userId: string | null;
  commentCount: number;
  reportCount: number;
  createdAt: string;
  updatedAt: string | null;
};
export type CommentRow = {
  id: string;
  postId: string;
  body: string;
  nickname: string;
  userId: string | null;
  createdAt: string;
};

export type PostSummary = {
  id: string;
  board: string;
  title: string;
  nickname: string;
  /** 로그인 사용자가 쓴 글 */
  member: boolean;
  commentCount: number;
  createdAt: string;
  /** 관리자 모드에만 싣는다 */
  reportCount?: number;
};
export type PostView = PostSummary & {
  body: string;
  updatedAt: string | null;
  /** 지금 보는 사람이 로그인 계정으로 쓴 글 (비밀번호 없이 수정·삭제) */
  mine: boolean;
  /** 비로그인 글이라 수정·삭제에 비밀번호가 필요하다 */
  needsPassword: boolean;
};
export type CommentView = {
  id: string;
  body: string;
  nickname: string;
  member: boolean;
  mine: boolean;
  needsPassword: boolean;
  createdAt: string;
};

// 화면으로 내보내는 모양. 계정 ID·비밀번호 해시는 싣지 않는다
export function postSummary(row: PostRow, viewer: Viewer): PostSummary {
  return {
    id: row.id,
    board: row.board,
    title: row.title,
    nickname: row.nickname,
    member: row.userId !== null,
    commentCount: row.commentCount,
    createdAt: row.createdAt,
    ...(viewer.admin && { reportCount: row.reportCount }),
  };
}

export function postView(row: PostRow, viewer: Viewer): PostView {
  return {
    ...postSummary(row, viewer),
    body: row.body,
    updatedAt: row.updatedAt,
    mine: row.userId !== null && row.userId === viewer.userId,
    needsPassword: row.userId === null,
  };
}

export function commentView(row: CommentRow, viewer: Viewer): CommentView {
  return {
    id: row.id,
    body: row.body,
    nickname: row.nickname,
    member: row.userId !== null,
    mine: row.userId !== null && row.userId === viewer.userId,
    needsPassword: row.userId === null,
    createdAt: row.createdAt,
  };
}

export type SeedSummary = {
  balance: number;
  /** 씨앗을 원으로 바꾼 값 (할인 가치) */
  won: number;
  redeemableWon: number;
  redeemEnabled: boolean;
  today: { posts: number; postsLimit: number; comments: number; commentsLimit: number };
};

export function seedSummary(balance: number, posts: number, comments: number): SeedSummary {
  const b = Math.max(0, Math.floor(balance));
  return {
    balance: b,
    won: seedsToWon(b),
    redeemableWon: redeemableWon(b),
    redeemEnabled: SEEDS.redeemEnabled,
    today: {
      posts,
      postsLimit: SEEDS.postsPerDay,
      comments,
      commentsLimit: SEEDS.commentsPerDay,
    },
  };
}
