// @vitest-environment node
// DEC-074 국내·해외 법령 통합 검색 API (GET·POST /world-laws). 출처 조회는 가짜.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE } from "@/lib/api/respond";
import { WORLD_NOTICE, type WorldLawHit } from "@/lib/search/world/types";

vi.mock("server-only", () => ({}));
const world = vi.hoisted(() => ({ searchWorldLaws: vi.fn() }));
vi.mock("@/lib/search/world/source", () => world);
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));

const route = await import("@/app/api/v1/world-laws/route");

const HIT: WorldLawHit = {
  id: "us:21cfr-part-806",
  country: "us",
  title: "Medical Devices; Reports of Corrections and Removals",
  titleKo: "시정·회수 보고",
  kind: "연방규정",
  citation: "21 CFR Part 806",
  sourceUrl: "https://www.ecfr.gov/current/title-21/part-806",
  source: "eCFR (미국 연방규정집)",
  curated: true,
};
const post = (body: unknown) =>
  new Request("http://localhost/api/v1/world-laws", { method: "POST", body: JSON.stringify(body) });
const get = (qs: string) => new Request(`http://localhost/api/v1/world-laws${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  rate.assertRateLimit.mockResolvedValue(undefined);
  world.searchWorldLaws.mockResolvedValue({
    items: [HIT],
    failed: ["jp"],
    translated: { en: "medical device recall", ja: "医療機器 回収" },
  });
});

describe("DEC-074 /world-laws", () => {
  test("POST 본문 검색어로 찾고, 목록·실패한 나라·바꿔 보낸 말을 AI 고지 대신 검색 고지와 함께 준다", async () => {
    const res = await route.POST(post({ q: "의료기기 리콜" }), {});
    expect(res.status).toBe(200);
    const { data, meta } = await res.json();
    expect(data).toEqual({
      items: [HIT],
      failed: ["jp"],
      translated: { en: "medical device recall", ja: "医療機器 回収" },
      notice: WORLD_NOTICE,
      outcome: "grounded",
    });
    expect(data.notice).not.toBe(AI_NOTICE);
    expect(data.items[0]).not.toHaveProperty("relevance");
    expect(meta.requestId).toBeTruthy();
    expect(world.searchWorldLaws).toHaveBeenCalledWith("의료기기 리콜");
    expect(rate.assertRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "search" }),
      expect.any(Headers),
    );
  });

  test("GET ?q= 도 같은 결과", async () => {
    const res = await route.GET(get("?q=medical%20device"), {});
    expect(res.status).toBe(200);
    expect(world.searchWorldLaws).toHaveBeenCalledWith("medical device");
  });

  test("결과 없음은 오류가 아니다 (200 no_result_in_scope)", async () => {
    world.searchWorldLaws.mockResolvedValue({ items: [], failed: [], translated: {} });
    const { data } = await (await route.POST(post({ q: "없는말" }), {})).json();
    expect(data).toMatchObject({ items: [], outcome: "no_result_in_scope", notice: WORLD_NOTICE });
  });

  test("빈 검색어 400 EMPTY_INPUT, 긴 검색어 400", async () => {
    const empty = await route.POST(post({ q: "  " }), {});
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("EMPTY_INPUT");
    expect((await route.POST(post({ q: "가".repeat(101) }), {})).status).toBe(400);
    expect((await route.POST(post({}), {})).status).toBe(400);
    expect(world.searchWorldLaws).not.toHaveBeenCalled();
  });

  test("F-007 개인정보로 보이는 검색어는 어느 출처로도 보내지 않는다", async () => {
    const res = await route.POST(post({ q: "010-1234-5678" }), {});
    expect(res.status).toBe(400);
    expect((await res.json()).error.details).toEqual({ field: "q", reason: "personal_info" });
    expect(world.searchWorldLaws).not.toHaveBeenCalled();
  });

  test("레이트 리밋 초과 429 — 출처를 부르지 않는다", async () => {
    rate.assertRateLimit.mockRejectedValue(
      new ApiError("RATE_LIMITED", { reason: "search_hourly" }),
    );
    expect((await route.POST(post({ q: "의료기기" }), {})).status).toBe(429);
    expect(world.searchWorldLaws).not.toHaveBeenCalled();
  });
});
