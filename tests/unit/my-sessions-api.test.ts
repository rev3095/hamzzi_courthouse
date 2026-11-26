// @vitest-environment node
// DEC-073 ② 내 세션 — 이름 바꾸기·목록에서 빼기(PATCH·DELETE /me/inquiries/{id}), 사건 이름을 바꾸면 자동 제목을 멈춤,
// 비로그인 목록(localStorage) 순수 규칙. 저장소는 가짜다 (절대 규칙 8). 이름은 가상이다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { parseLocalSessions, withSession, withTitle } from "@/lib/client/local-sessions";
import { parseSessionTitle } from "@/lib/inquiries/policy";
import { emptyMatter } from "@/lib/matters/model";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock("@/lib/auth/server", () => auth);
const store = vi.hoisted(() => ({ renameSavedInquiry: vi.fn(), unsaveInquiry: vi.fn() }));
vi.mock("@/lib/inquiries/store", () => store);
const matters = vi.hoisted(() => ({
  requireMatterUser: vi.fn(),
  getMatter: vi.fn(),
  saveMatter: vi.fn(),
  deleteMatter: vi.fn(),
}));
vi.mock("@/lib/matters/store", () => matters);
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  ...rate,
}));

const mine = await import("@/app/api/v1/me/inquiries/[id]/route");
const one = await import("@/app/api/v1/matters/[id]/route");

const ID = "11111111-2222-4333-8444-555555555555";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new Request(`http://localhost/api/v1/me/inquiries/${ID}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.getActor.mockResolvedValue({ userId: "u-1" });
  store.renameSavedInquiry.mockResolvedValue(undefined);
  store.unsaveInquiry.mockResolvedValue(undefined);
  rate.assertRateLimit.mockResolvedValue(undefined);
  matters.requireMatterUser.mockResolvedValue({ userId: "u-1", admin: false });
  matters.getMatter.mockResolvedValue({
    id: ID,
    title: "새 사건",
    updatedAt: "t",
    data: { ...emptyMatter(), titleAuto: true },
  });
  matters.saveMatter.mockResolvedValue({ id: ID, updatedAt: "t2" });
});

describe("DEC-073 내 세션 이름·빼기", () => {
  test("비로그인은 401", async () => {
    auth.getActor.mockResolvedValue(null);
    expect((await mine.PATCH(req("PATCH", { title: "x" }), ctx(ID))).status).toBe(401);
    expect((await mine.DELETE(req("DELETE"), ctx(ID))).status).toBe(401);
    expect(store.renameSavedInquiry).not.toHaveBeenCalled();
  });

  test("이름은 연락처 꼴을 가린 뒤 본인 계정으로만 저장한다", async () => {
    const res = await mine.PATCH(req("PATCH", { title: "보증금 010-1234-5678" }), ctx(ID));
    expect(res.status).toBe(200);
    const [userId, id, title] = store.renameSavedInquiry.mock.calls[0];
    expect([userId, id]).toEqual(["u-1", ID]);
    expect(title).not.toContain("1234-5678");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("빈 이름은 지우기(null), 너무 긴 이름은 400", async () => {
    await mine.PATCH(req("PATCH", { title: "  " }), ctx(ID));
    expect(store.renameSavedInquiry.mock.calls[0][2]).toBeNull();
    expect((await mine.PATCH(req("PATCH", { title: "가".repeat(61) }), ctx(ID))).status).toBe(400);
  });

  test("빼기는 기록에 남기기만 끈다", async () => {
    const res = await mine.DELETE(req("DELETE"), ctx(ID));
    expect(res.status).toBe(200);
    expect(store.unsaveInquiry).toHaveBeenCalledWith("u-1", ID);
  });

  test("남의 질문·없는 질문은 404, 번호 꼴이 아니면 404", async () => {
    store.unsaveInquiry.mockRejectedValue(new ApiError("NOT_FOUND"));
    expect((await mine.DELETE(req("DELETE"), ctx(ID))).status).toBe(404);
    expect((await mine.PATCH(req("PATCH", { title: "x" }), ctx("../x"))).status).toBe(404);
  });

  test("사건 이름을 직접 바꾸면 자동 정리가 더는 제목을 짓지 않는다", async () => {
    await one.PUT(
      new Request(`http://localhost/api/v1/matters/${ID}`, {
        method: "PUT",
        body: JSON.stringify({ title: "내가 지은 이름" }),
      }),
      ctx(ID),
    );
    const patch = matters.saveMatter.mock.calls[0][2];
    expect(patch.title).toBe("내가 지은 이름");
    expect(patch.data.titleAuto).toBe(false);
  });

  test("한 번 끈 자동 제목은 옛 자료(titleAuto: true) 저장으로 되살아나지 않는다", async () => {
    matters.getMatter.mockResolvedValue({
      id: ID,
      title: "내가 지은 이름",
      updatedAt: "t",
      data: { ...emptyMatter(), titleAuto: false },
    });
    await one.PUT(
      new Request(`http://localhost/api/v1/matters/${ID}`, {
        method: "PUT",
        body: JSON.stringify({ data: { ...emptyMatter(), titleAuto: true } }),
      }),
      ctx(ID),
    );
    expect(matters.saveMatter.mock.calls[0][2].data.titleAuto).toBe(false);
  });

  test("이름만 바꿀 때는 읽은 뒤 고쳐지지 않았을 때만 자료를 다시 쓰고, 끼어든 저장이 있으면 다시 읽는다", async () => {
    matters.saveMatter
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: ID, updatedAt: "t3" });
    await one.PUT(
      new Request(`http://localhost/api/v1/matters/${ID}`, {
        method: "PUT",
        body: JSON.stringify({ title: "새 이름" }),
      }),
      ctx(ID),
    );
    expect(matters.saveMatter.mock.calls[0][2].ifUpdatedAt).toBe("t");
    expect(matters.getMatter).toHaveBeenCalledTimes(2);
    expect(matters.saveMatter.mock.calls[1][2].data.titleAuto).toBe(false);
  });

  test("이름만 바꾸다 두 번 다 다른 저장과 겹치면 409로 거절한다(자동 제목을 켜 둔 채 이름만 바꾸지 않음)", async () => {
    matters.saveMatter.mockResolvedValue(null);
    const res = await one.PUT(
      new Request(`http://localhost/api/v1/matters/${ID}`, {
        method: "PUT",
        body: JSON.stringify({ title: "새 이름" }),
      }),
      ctx(ID),
    );
    expect(res.status).toBe(409);
    expect(matters.saveMatter).toHaveBeenCalledTimes(2);
  });

  test("parseSessionTitle", () => {
    expect(parseSessionTitle(null)).toBeNull();
    expect(parseSessionTitle(" 전세  보증금 ")).toBe("전세 보증금");
    expect(() => parseSessionTitle(3)).toThrow();
  });
});

describe("DEC-073 비로그인 내 세션 (이 브라우저)", () => {
  const s = (id: string) => ({ id, text: "가린 문장", at: "2026-11-27T00:00:00Z", title: null });

  test("모양이 다른 값은 버리고, 새 세션은 앞에 하나만", () => {
    expect(parseLocalSessions("not json")).toEqual([]);
    expect(parseLocalSessions(JSON.stringify([s("a"), { id: 1 }]))).toEqual([s("a")]);
    expect(withSession([s("a"), s("b")], s("b")).map((x) => x.id)).toEqual(["b", "a"]);
  });

  test("이름은 다듬고, 비우면 null", () => {
    expect(withTitle([s("a")], "a", "  새  이름 ")[0].title).toBe("새 이름");
    expect(withTitle([s("a")], "a", " ")[0].title).toBeNull();
    // 이 브라우저에 둘 때도 연락처 꼴은 가린다
    expect(withTitle([s("a")], "a", "집주인 010-1234-5678")[0].title).not.toContain("1234-5678");
  });
});
