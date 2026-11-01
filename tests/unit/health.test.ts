// @vitest-environment node
// GET /health (운영 점검, OQ-ARC-09 제안) — 도달 여부·지연만, 비밀값·오류 문구 없음.
import { beforeEach, expect, test, vi } from "vitest";
import { healthOf, probe } from "@/lib/api/health";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ result: { error: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({ select: async () => db.result }),
  }),
}));
const law = vi.hoisted(() => ({ getArticle: vi.fn() }));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => law }));

const { GET } = await import("@/app/api/v1/health/route");

beforeEach(() => {
  db.result = { error: null };
  law.getArticle.mockReset();
});

test("DB·법제처가 모두 닿으면 200 ok, 법제처 확인은 5분 캐시", async () => {
  law.getArticle.mockResolvedValue({ id: "law:민법:제1조" });
  const res = await GET(new Request("http://localhost/api/v1/health"), {});
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(Object.keys(body)).toEqual(["status", "checks", "version", "time"]);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const again = await (await GET(new Request("http://localhost/api/v1/health"), {})).json();
  expect(again.checks.lawApi.cached).toBe(true);
  expect(law.getArticle).toHaveBeenCalledTimes(1);
});

test("DB 실패는 503 degraded, 오류 문구를 내보내지 않는다", async () => {
  db.result = { error: { message: "password authentication failed for user postgres.secret" } };
  const res = await GET(new Request("http://localhost/api/v1/health"), {});
  expect(res.status).toBe(503);
  const text = await res.text();
  expect(text).not.toContain("password");
  expect(JSON.parse(text).checks.db.ok).toBe(false);
});

test("시간 초과·예외는 실패로 본다", async () => {
  expect((await probe(() => new Promise(() => {}), 10)).ok).toBe(false);
  expect(
    (
      await probe(async () => {
        throw new Error("secret");
      }, 100)
    ).ok,
  ).toBe(false);
  expect(
    healthOf(
      { db: { ok: true, latencyMs: 1 }, lawApi: { ok: true, latencyMs: 1 } },
      { VERCEL_GIT_COMMIT_SHA: "abcdef1234" },
    ).version,
  ).toBe("abcdef1");
});
