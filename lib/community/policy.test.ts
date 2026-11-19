// 커뮤니티·씨앗 순수 규칙 (DEC-047)
import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import {
  BOARDS,
  COMMUNITY_NOTICE,
  DEFAULT_BOARD,
  SEEDS,
  canChange,
  cleanNickname,
  commentView,
  earnsSeeds,
  parseComment,
  parsePost,
  passwordError,
  postSummary,
  postView,
  redeemableWon,
  seedSummary,
  seedsToWon,
  type PostRow,
} from "./policy";

const ROW: PostRow = {
  id: "p1",
  board: "free",
  title: "제목",
  body: "본문",
  nickname: "익명 햄찌",
  userId: null,
  commentCount: 0,
  reportCount: 2,
  createdAt: "2026-11-19T00:00:00Z",
  updatedAt: null,
};

describe("DEC-047 게시판", () => {
  test("자유게시판이 맨 앞이고 기본 게시판이다", () => {
    expect(BOARDS[0].key).toBe("free");
    expect(DEFAULT_BOARD).toBe("free");
    expect(BOARDS.map((b) => b.name)).toEqual(
      expect.arrayContaining(["자유게시판", "법·제도 의견", "만약에"]),
    );
  });

  test("고지 문구에 단정·판정 표현이 없다 (절대 규칙 2)", () => {
    const texts = [COMMUNITY_NOTICE, ...BOARDS.flatMap((b) => [b.name, b.hint])].join(" ");
    expect(texts).not.toMatch(/반드시|무조건|100%|승소|유리|불리|확률/);
    expect(COMMUNITY_NOTICE).toContain("법률 자문이 아닙니다");
  });
});

describe("DEC-047 입력 검사", () => {
  test("글: 게시판·제목·내용을 확인하고 앞뒤 공백을 뗀다", () => {
    expect(
      parsePost({ board: "free", title: "  안녕  하세요 ", body: " 내용\r\n둘째 줄 " }),
    ).toEqual({
      value: { board: "free", title: "안녕 하세요", body: "내용\n둘째 줄" },
    });
    expect(parsePost({ board: "nope", title: "제목", body: "내용" })).toEqual({
      error: { field: "board", reason: "invalid" },
    });
    expect(parsePost({ board: "free", title: "", body: "내용" })).toEqual({
      error: { field: "title", reason: "required" },
    });
    expect(parsePost({ board: "free", title: "제목", body: "가".repeat(4001) })).toEqual({
      error: { field: "body", reason: "too_long" },
    });
  });

  test("댓글·닉네임·비밀번호", () => {
    expect(parseComment(" 좋아요 ")).toEqual({ body: "좋아요" });
    expect(parseComment("")).toEqual({ error: { field: "comment", reason: "required" } });
    expect(cleanNickname("")).toEqual({ nickname: "익명 햄찌" });
    expect(cleanNickname("가")).toEqual({ error: { field: "nickname", reason: "too_short" } });
    expect(cleanNickname("<b>굵게</b>")).toEqual({
      error: { field: "nickname", reason: "invalid" },
    });
    expect(passwordError("123")).toEqual({ field: "password", reason: "too_short" });
    expect(passwordError(undefined)).toEqual({ field: "password", reason: "required" });
    expect(passwordError("1234")).toBeNull();
  });
});

describe("DEC-047 수정·삭제 권한", () => {
  const anon = { userId: null, admin: false };
  test("비로그인 글은 비밀번호가 맞을 때만 — 로그인한 사람도 비밀번호가 필요하다", () => {
    expect(canChange("edit", { userId: null }, anon, true)).toBe(true);
    expect(canChange("delete", { userId: null }, anon, false)).toBe(false);
    expect(canChange("edit", { userId: null }, { userId: "u1", admin: false }, false)).toBe(false);
  });

  test("로그인 글은 그 계정만 — 비밀번호로는 못 바꾼다", () => {
    expect(canChange("edit", { userId: "u1" }, { userId: "u1", admin: false }, false)).toBe(true);
    expect(canChange("delete", { userId: "u1" }, { userId: "u2", admin: false }, true)).toBe(false);
    expect(canChange("delete", { userId: "u1" }, anon, true)).toBe(false);
  });

  test("관리자 모드는 지울 수만 있다", () => {
    const admin = { userId: null, admin: true };
    expect(canChange("delete", { userId: "u1" }, admin, false)).toBe(true);
    expect(canChange("edit", { userId: "u1" }, admin, false)).toBe(false);
  });

  test("비밀번호는 해시로만 확인한다", () => {
    const hash = hashPassword("햄찌1234");
    expect(hash).not.toContain("햄찌1234");
    expect(verifyPassword("햄찌1234", hash)).toBe(true);
    expect(verifyPassword("햄찌12345", hash)).toBe(false);
    expect(verifyPassword(undefined, hash)).toBe(false);
    expect(verifyPassword("햄찌1234", null)).toBe(false);
    expect(verifyPassword("햄찌1234", "깨진 값")).toBe(false);
    expect(hashPassword("햄찌1234")).not.toBe(hash);
  });
});

describe("DEC-047 화면으로 내보내는 모양", () => {
  test("계정 ID·비밀번호 해시를 싣지 않고, 신고 수는 관리자에게만", () => {
    const row = { ...ROW, userId: "user-77", passHash: "s1$a$b" } as PostRow;
    const view = postView(row, { userId: "user-77", admin: false });
    expect(JSON.stringify(view)).not.toMatch(/user-77|s1\$|passHash|userId/);
    expect(view).toMatchObject({ member: true, mine: true, needsPassword: false });
    expect(view.reportCount).toBeUndefined();
    expect(postSummary(row, { userId: null, admin: true }).reportCount).toBe(2);
    expect(postView(ROW, { userId: "user-77", admin: false })).toMatchObject({
      member: false,
      mine: false,
      needsPassword: true,
    });
  });

  test("댓글도 같다", () => {
    const c = {
      id: "c1",
      postId: "p1",
      body: "댓글",
      nickname: "햄찌",
      userId: "user-88",
      createdAt: "",
    };
    const view = commentView(c, { userId: "user-77", admin: false });
    expect(view).toMatchObject({ member: true, mine: false, needsPassword: false });
    expect(JSON.stringify(view)).not.toContain("user-88");
  });
});

describe("DEC-047 씨앗", () => {
  test("글 100개와 댓글 200개가 각각 1,000원 가치다", () => {
    expect(seedsToWon(SEEDS.post * 100)).toBe(1000);
    expect(seedsToWon(SEEDS.comment * 200)).toBe(1000);
  });

  test("너무 짧은 글·댓글에는 쌓이지 않는다 (공백 제외)", () => {
    expect(earnsSeeds("post", "가".repeat(SEEDS.postMinChars))).toBe(true);
    expect(earnsSeeds("post", "가 ".repeat(SEEDS.postMinChars - 1))).toBe(false);
    expect(earnsSeeds("comment", "ㅋㅋ")).toBe(false);
    expect(earnsSeeds("comment", "가".repeat(SEEDS.commentMinChars))).toBe(true);
  });

  test("절대 규칙 5: 과금 게이트 승인 전이라 할인 사용은 꺼져 있다", () => {
    expect(SEEDS.redeemEnabled).toBe(false);
    expect(redeemableWon(50_000)).toBe(0);
    expect(seedSummary(1234.9, 2, 3)).toEqual({
      balance: 1234,
      won: 1234,
      redeemableWon: 0,
      redeemEnabled: false,
      today: {
        posts: 2,
        postsLimit: SEEDS.postsPerDay,
        comments: 3,
        commentsLimit: SEEDS.commentsPerDay,
      },
    });
    expect(seedSummary(-5, 0, 0).balance).toBe(0);
  });
});
