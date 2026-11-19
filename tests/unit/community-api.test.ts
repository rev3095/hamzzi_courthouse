// @vitest-environment node
// 커뮤니티 API (DEC-047): 비로그인 비밀번호 글, 로그인 계정 글, 마스킹본 저장, 씨앗 적립·회수.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/community/password";
import { SEEDS } from "@/lib/community/policy";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  listPosts: vi.fn(),
  getPost: vi.fn(),
  insertPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  listComments: vi.fn(),
  getComment: vi.fn(),
  insertComment: vi.fn(),
  deleteComment: vi.fn(),
  memberCommentsOf: vi.fn(),
  reportPost: vi.fn(),
  clearReports: vi.fn(),
  awardSeeds: vi.fn(),
  revokeSeeds: vi.fn(),
  getSeedCounts: vi.fn(),
}));
vi.mock("@/lib/community/store", () => store);
const auth = vi.hoisted(() => ({ getActor: vi.fn(), isAdminRequest: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ getActor: auth.getActor }));
vi.mock("@/lib/auth/admin-session", () => ({ isAdminRequest: auth.isAdminRequest }));
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({ assertRateLimit: rate.assertRateLimit }));

const posts = await import("@/app/api/v1/community/posts/route");
const post = await import("@/app/api/v1/community/posts/[id]/route");
const comments = await import("@/app/api/v1/community/posts/[id]/comments/route");
const comment = await import("@/app/api/v1/community/comments/[id]/route");
const reportRoute = await import("@/app/api/v1/community/posts/[id]/report/route");
const seeds = await import("@/app/api/v1/me/seeds/route");

const PID = "11111111-2222-3333-4444-555555555555";
const CID = "aaaaaaaa-2222-3333-4444-555555555555";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown, path = "posts") =>
  new Request(`http://localhost/api/v1/community/${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const LONG =
  "전세 계약이 끝났는데 집주인이 보증금을 돌려주지 않을 때 다들 어떻게 하셨는지 궁금합니다.";
const COMMENT = "저도 궁금합니다 알려 주세요";
const stored = (over: Record<string, unknown> = {}) => ({
  id: PID,
  board: "free",
  title: "제목",
  body: "본문",
  nickname: "익명 햄찌",
  userId: null,
  passHash: hashPassword("1234"),
  commentCount: 0,
  reportCount: 0,
  createdAt: "2026-11-19T00:00:00Z",
  updatedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  auth.getActor.mockResolvedValue(null);
  auth.isAdminRequest.mockResolvedValue(false);
  rate.assertRateLimit.mockResolvedValue(undefined);
  store.insertPost.mockImplementation(async (i: Record<string, unknown>) => stored({ ...i }));
  store.updatePost.mockImplementation(async (_id: string, p: Record<string, unknown>) =>
    stored({ ...p }),
  );
  store.insertComment.mockImplementation(async (i: Record<string, unknown>) => ({
    id: CID,
    createdAt: "2026-11-19T00:00:00Z",
    ...i,
  }));
  store.memberCommentsOf.mockResolvedValue([]);
  store.awardSeeds.mockResolvedValue(SEEDS.post);
  store.revokeSeeds.mockResolvedValue(0);
});

describe("POST /community/posts", () => {
  test("비로그인은 비밀번호를 정해야 쓴다 — 해시만 저장하고 응답에 싣지 않는다", async () => {
    const none = await posts.POST(req("POST", { board: "free", title: "제목", body: LONG }), {});
    expect(none.status).toBe(400);
    expect((await none.json()).error.details).toEqual({ field: "password", reason: "required" });

    const res = await posts.POST(
      req("POST", { board: "free", title: "제목", body: LONG, password: "햄찌1234" }),
      {},
    );
    expect(res.status).toBe(201);
    const saved = store.insertPost.mock.calls[0][0];
    expect(saved.userId).toBeNull();
    expect(saved.passHash).not.toContain("햄찌1234");
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/passHash|햄찌1234|s1\$/);
    // 비로그인 글에는 씨앗이 쌓이지 않는다
    expect(store.awardSeeds).not.toHaveBeenCalled();
  });

  test("F-007 개인정보는 가린 마스킹본만 저장하고 가린 곳 수를 알려 준다", async () => {
    const res = await posts.POST(
      req("POST", {
        board: "story",
        title: "연락 주세요",
        body: `${LONG} 제 번호는 010-1234-5678 입니다.`,
        password: "1234",
      }),
      {},
    );
    const saved = store.insertPost.mock.calls[0][0];
    expect(saved.body).not.toContain("010-1234-5678");
    expect((await res.json()).data.masked).toBeGreaterThan(0);
  });

  test("로그인하면 비밀번호 없이 쓰고 씨앗이 쌓인다 — 짧은 글에는 쌓이지 않는다", async () => {
    auth.getActor.mockResolvedValue({ userId: "u1", role: "user" });
    const res = await posts.POST(req("POST", { board: "free", title: "제목", body: LONG }), {});
    expect(res.status).toBe(201);
    expect(store.insertPost.mock.calls[0][0]).toMatchObject({ userId: "u1", passHash: null });
    expect(store.awardSeeds).toHaveBeenCalledWith("u1", "post", PID);
    expect((await res.json()).data.seeds).toBe(SEEDS.post);

    store.awardSeeds.mockClear();
    await posts.POST(req("POST", { board: "free", title: "제목", body: "짧은 글" }), {});
    expect(store.awardSeeds).not.toHaveBeenCalled();
  });

  test("없는 게시판은 400, 쓰기 횟수 상한을 먼저 본다", async () => {
    const bad = await posts.POST(req("POST", { board: "x", title: "제목", body: LONG }), {});
    expect(bad.status).toBe(400);
    rate.assertRateLimit.mockRejectedValue(new ApiError("RATE_LIMITED"));
    const limited = await posts.POST(
      req("POST", { board: "free", title: "제목", body: LONG, password: "1234" }),
      {},
    );
    expect(limited.status).toBe(429);
    expect(store.insertPost).not.toHaveBeenCalled();
  });
});

describe("GET /community/posts", () => {
  test("목록에 계정 ID·해시가 없고 없는 게시판은 400", async () => {
    store.listPosts.mockResolvedValue({
      items: [stored({ userId: "user-99" })],
      nextCursor: undefined,
    });
    const res = await posts.GET(req("GET", undefined, "posts?board=free"), {});
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/user-99|passHash|s1\$/);
    expect(store.listPosts).toHaveBeenCalledWith("free", null);
    expect((await posts.GET(req("GET", undefined, "posts?board=zzz"), {})).status).toBe(400);
  });
});

describe("PATCH·DELETE /community/posts/{id}", () => {
  test("비로그인 글: 비밀번호가 틀리면 403, 맞으면 수정", async () => {
    store.getPost.mockResolvedValue(stored());
    const wrong = await post.PATCH(
      req("PATCH", { title: "새 제목", body: "새 내용", password: "0000" }),
      ctx(PID),
    );
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).error.details).toEqual({ reason: "wrong_password" });
    expect(store.updatePost).not.toHaveBeenCalled();

    const ok = await post.PATCH(
      req("PATCH", { title: "새 제목", body: "새 내용", password: "1234" }),
      ctx(PID),
    );
    expect(ok.status).toBe(200);
    expect(store.updatePost).toHaveBeenCalledWith(PID, {
      board: "free",
      title: "새 제목",
      body: "새 내용",
    });
  });

  test("로그인 글: 그 계정만 수정·삭제하고, 지우면 씨앗을 되돌린다", async () => {
    store.getPost.mockResolvedValue(stored({ userId: "u1", passHash: null }));
    store.memberCommentsOf.mockResolvedValue([{ id: CID, userId: "u2" }]);
    auth.getActor.mockResolvedValue({ userId: "u2", role: "user" });
    expect((await post.DELETE(req("DELETE"), ctx(PID))).status).toBe(403);
    expect((await post.DELETE(req("DELETE", { password: "1234" }), ctx(PID))).status).toBe(403);

    auth.getActor.mockResolvedValue({ userId: "u1", role: "user" });
    const res = await post.DELETE(req("DELETE"), ctx(PID));
    expect(res.status).toBe(200);
    expect(store.deletePost).toHaveBeenCalledWith(PID);
    expect(store.revokeSeeds).toHaveBeenCalledWith("u1", PID);
    expect(store.revokeSeeds).toHaveBeenCalledWith("u2", CID);
  });

  test("관리자 모드는 남의 글을 지울 수 있지만 고치지는 못한다", async () => {
    store.getPost.mockResolvedValue(stored({ userId: "u1", passHash: null }));
    auth.isAdminRequest.mockResolvedValue(true);
    const edit = await post.PATCH(req("PATCH", { title: "제목", body: "내용" }), ctx(PID));
    expect(edit.status).toBe(403);
    expect((await post.DELETE(req("DELETE"), ctx(PID))).status).toBe(200);
  });

  test("없는 글·잘못된 번호는 404", async () => {
    store.getPost.mockResolvedValue(null);
    expect((await post.GET(req("GET"), ctx(PID))).status).toBe(404);
    expect((await post.GET(req("GET"), ctx("nope"))).status).toBe(404);
  });
});

describe("댓글·신고·씨앗", () => {
  test("댓글: 비로그인은 비밀번호, 로그인은 씨앗", async () => {
    store.getPost.mockResolvedValue(stored());
    const anon = await comments.POST(req("POST", { body: COMMENT }), ctx(PID));
    expect(anon.status).toBe(400);

    auth.getActor.mockResolvedValue({ userId: "u1", role: "user" });
    store.awardSeeds.mockResolvedValue(SEEDS.comment);
    const res = await comments.POST(req("POST", { body: COMMENT }), ctx(PID));
    expect(res.status).toBe(201);
    expect(store.awardSeeds).toHaveBeenCalledWith("u1", "comment", CID);
    expect((await res.json()).data.seeds).toBe(SEEDS.comment);
  });

  test("댓글 삭제: 비밀번호 확인 뒤 지운다", async () => {
    store.getComment.mockResolvedValue({
      id: CID,
      postId: PID,
      body: "댓글",
      nickname: "햄찌",
      userId: null,
      passHash: hashPassword("9999"),
      createdAt: "",
    });
    expect((await comment.DELETE(req("DELETE", { password: "1" }), ctx(CID))).status).toBe(403);
    expect((await comment.DELETE(req("DELETE", { password: "9999" }), ctx(CID))).status).toBe(200);
    expect(store.deleteComment).toHaveBeenCalledWith(CID);
  });

  test("신고는 수만 올린다", async () => {
    store.reportPost.mockResolvedValue(true);
    expect((await reportRoute.POST(req("POST"), ctx(PID))).status).toBe(200);
    store.reportPost.mockResolvedValue(false);
    expect((await reportRoute.POST(req("POST"), ctx(PID))).status).toBe(404);
  });

  test("GET /me/seeds: 비로그인 401, 로그인은 잔액과 할인 가치 — 사용은 꺼져 있다", async () => {
    expect((await seeds.GET(req("GET"), {})).status).toBe(401);
    auth.getActor.mockResolvedValue({ userId: "u1", role: "user" });
    store.getSeedCounts.mockResolvedValue({ balance: 120, posts: 1, comments: 2 });
    const body = await (await seeds.GET(req("GET"), {})).json();
    expect(body.data).toMatchObject({
      balance: 120,
      won: 120,
      redeemEnabled: false,
      redeemableWon: 0,
    });
  });
});

describe("민감정보 동의·신고 보강 (F-007 AC2, DEC-047)", () => {
  const SENSITIVE = `${LONG} 저는 우울증 진단을 받고 치료 중입니다.`;

  test("민감한 내용으로 보이는 글은 동의 없이는 저장하지 않고, 동의하면 시각·종류만 남긴다", async () => {
    const body = { board: "story", title: "제목", body: SENSITIVE, password: "1234" };
    const blocked = await posts.POST(req("POST", body), {});
    expect(blocked.status).toBe(409);
    const err = (await blocked.json()).error;
    expect(err.code).toBe("CONSENT_REQUIRED");
    expect(err.details.kind).toBe("sensitive_info");
    expect(store.insertPost).not.toHaveBeenCalled();

    const ok = await posts.POST(req("POST", { ...body, sensitiveConsent: true }), {});
    expect(ok.status).toBe(201);
    const consent = store.insertPost.mock.calls[0][0].sensitiveConsent;
    expect(consent.categories.length).toBeGreaterThan(0);
    expect(JSON.stringify(consent)).not.toContain("우울증");
  });

  test("댓글도 같고, 해당 없는 글은 동의 기록이 없다", async () => {
    store.getPost.mockResolvedValue(stored());
    const c = { body: "저도 우울증 진단을 받았어요 힘내세요", password: "1234" };
    expect((await comments.POST(req("POST", c), ctx(PID))).status).toBe(409);
    expect(
      (await comments.POST(req("POST", { ...c, sensitiveConsent: true }), ctx(PID))).status,
    ).toBe(201);
    await posts.POST(
      req("POST", { board: "free", title: "제목", body: LONG, password: "1234" }),
      {},
    );
    expect(store.insertPost.mock.calls[0][0].sensitiveConsent).toBeNull();
  });

  test("같은 네트워크의 되풀이 신고는 세지 않는다", async () => {
    store.reportPost.mockResolvedValue(true);
    rate.assertRateLimit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiError("RATE_LIMITED"));
    const res = await reportRoute.POST(req("POST"), ctx(PID));
    expect(res.status).toBe(200);
    expect(store.reportPost).not.toHaveBeenCalled();
  });

  test("신고 초기화는 관리자 모드만", async () => {
    store.clearReports.mockResolvedValue(true);
    expect((await reportRoute.DELETE(req("DELETE"), ctx(PID))).status).toBe(403);
    auth.isAdminRequest.mockResolvedValue(true);
    expect((await reportRoute.DELETE(req("DELETE"), ctx(PID))).status).toBe(200);
    expect(store.clearReports).toHaveBeenCalledWith(PID);
  });
});
