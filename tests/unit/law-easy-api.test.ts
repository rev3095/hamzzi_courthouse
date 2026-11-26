// @vitest-environment node
// DEC-074 GET /api/v1/laws/{name}/easy — 법령 쉬운 설명. 법제처·모델·예산은 가짜. Claude 실호출 없음 (절대 규칙 8).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE, SEARCH_NOTICE } from "@/lib/api/respond";
import { EASY_SOURCE_NOTE, EASY_VIRTUAL_NOTICE } from "@/lib/search/easy/types";
import type { ArticleHit, CaseHit } from "@/lib/search/types";

vi.mock("server-only", () => ({}));
const source = vi.hoisted(() => ({ getLawArticles: vi.fn(), searchCases: vi.fn() }));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => source }));
const rate = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  tryAiQuota: vi.fn(),
  settleAiQuota: vi.fn(),
  tryLawEasyDaily: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  ...rate,
}));
const mode = vi.hoisted(() => ({ aiMode: vi.fn() }));
vi.mock("@/lib/ai/mode", () => mode);
vi.mock("@/lib/search/world/source", () => ({ searchWorldCases: async () => [] }));
const ai = vi.hoisted(() => ({ explainLaw: vi.fn(), LAW_EASY_PROMPT_VERSION: "law-easy-test" }));
vi.mock("@/lib/ai/law-easy", () => ai);
const stored = vi.hoisted(() => ({ findEasyLaw: vi.fn() }));
vi.mock("@/lib/search/easy/data", () => stored);
// DEC-076 저장소 (가짜): 저장해 둔 설명이 있으면 다시 쓰고, 새로 만든 설명은 저장한다
const db = vi.hoisted(() => ({
  readGenerated: vi.fn(async (): Promise<unknown> => null),
  saveGenerated: vi.fn(async () => true),
  bumpGenerated: vi.fn(async () => undefined),
}));
vi.mock("@/lib/search/answer/store", () => db);

const route = await import("@/app/api/v1/laws/[name]/[view]/route");
const { LAW_EASY_RATE, LOOKUP_RATE } = await import("@/lib/auth/rate-limit");

const LAW = "의료기기법";
const art = (no: string, title: string, text: string): ArticleHit => ({
  id: `law:${LAW}:${no}`,
  lawName: LAW,
  articleNo: no,
  title,
  text,
  effectiveFrom: "2025-01-01",
  sourceUrl: "https://www.law.go.kr",
});
const ARTICLES = [
  art("제1조", "목적", "제1조(목적) 이 법은 의료기기의 관리에 관한 사항을 규정함을 목적으로 한다."),
  art("제6조", "제조업의 허가 등", "제6조(제조업의 허가 등) ① 제조업허가를 받아야 한다."),
];
const hit = (id: string): CaseHit => ({
  id,
  caseNo: `2020도${id}`,
  caseName: "의료기기법위반",
  court: "대법원",
  decidedAt: "2021-03-11",
  sourceUrl: `https://www.law.go.kr/LSW/precInfoP.do?precSeq=${id}`,
});
const EASY = {
  lawName: LAW,
  summary: ["의료기기를 관리하는 규칙을 정한 법이에요."],
  who: ["의료기기를 만드는 사업자"],
  keyPoints: [
    { title: "허가가 필요해요", body: "허가를 받도록 정하고 있어요.", articleNo: "제6조" },
  ],
  issues: [],
  virtualCases: [
    {
      title: "허가 없이 만든 경우",
      situation: "제조업자 A가 허가 없이 만들려고 해요.",
      lawSays: "이 법은 허가를 받도록 정하고 있어요.",
      articleNo: "제6조",
    },
  ],
  requirements: [{ text: "의료기기를 업으로 만들려는 경우에 해당해요.", articleNo: "제6조" }],
  alternatives: [
    {
      title: "먼저 허가를 신청해요",
      body: "만들기 전에 허가를 신청해 볼 수 있어요.",
      articleNo: "제6조",
    },
  ],
};

const call = (view = "easy", name = LAW) =>
  route.GET(new Request(`http://localhost/api/v1/laws/${encodeURIComponent(name)}/${view}`), {
    params: Promise.resolve({ name: encodeURIComponent(name), view }),
  });
type Body = { data: import("@/lib/search/easy/types").EasyLawView };

beforeEach(() => {
  vi.clearAllMocks();
  source.getLawArticles.mockResolvedValue({ lawName: LAW, articles: ARTICLES });
  source.searchCases.mockResolvedValue([]);
  rate.tryAiQuota.mockResolvedValue(true);
  mode.aiMode.mockReturnValue("paid");
  stored.findEasyLaw.mockReturnValue(null);
  ai.explainLaw.mockResolvedValue({ ok: true, easy: EASY, dropped: [], costUsd: 0.0021 });
});

describe("DEC-074 GET /laws/{name}/easy", () => {
  test("무료 모드: 모델·예산을 건드리지 않고 조문 제목 정리를 준다 (SEARCH_NOTICE)", async () => {
    mode.aiMode.mockReturnValue("free");
    const res = await call();
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as Body;
    expect(ai.explainLaw).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(rate.settleAiQuota).not.toHaveBeenCalled();
    expect(data.ai).toEqual({ used: false, reason: "free_mode" });
    expect(data.notice).toBe(SEARCH_NOTICE);
    expect(data.virtualNotice).toBeNull();
    expect(data.sourceNote).toBeNull();
    expect(data.easy.summary).toEqual([
      "이 법은 의료기기의 관리에 관한 사항을 규정함을 목적으로 한다.",
    ]);
    expect(data.easy.virtualCases).toEqual([]);
    expect(data.articles.map((a) => a.articleNo)).toEqual(["제1조", "제6조"]);
    expect(data.sourceUrl).toContain("law.go.kr");
  });

  test("예산이 없으면 모델을 부르지 않고 조문 제목 정리를 준다", async () => {
    rate.tryAiQuota.mockResolvedValue(false);
    const { data } = (await (await call()).json()) as Body;
    expect(rate.tryAiQuota).toHaveBeenCalledWith(3);
    expect(ai.explainLaw).not.toHaveBeenCalled();
    expect(rate.settleAiQuota).not.toHaveBeenCalled();
    expect(data.ai).toEqual({ used: false, reason: "budget" });
    expect(data.notice).toBe(SEARCH_NOTICE);
  });

  test("AI 경로: 예산을 잡고(3단위) 한 번 부른 뒤 실제 금액으로 정산한다. AI 고지·가상 사례 안내가 붙는다", async () => {
    const res = await call();
    const { data } = (await res.json()) as Body;
    expect(rate.tryAiQuota).toHaveBeenCalledWith(3);
    expect(ai.explainLaw).toHaveBeenCalledTimes(1);
    expect(ai.explainLaw.mock.calls[0][0]).toMatchObject({ lawName: LAW, needVirtual: true });
    expect(rate.settleAiQuota).toHaveBeenCalledWith(3, 0.0021);
    expect(data.ai).toEqual({ used: true });
    expect(data.notice).toBe(AI_NOTICE);
    expect(data.sourceNote).toBe(EASY_SOURCE_NOTE);
    expect(data.virtualNotice).toBe(EASY_VIRTUAL_NOTICE);
    expect(data.easy.keyPoints[0].articleNo).toBe("제6조");
    expect(res.headers.get("cache-control")).toBe("private, max-age=600");
  });

  test("모델이 실패해도 쓴 금액은 정산하고 조문 제목 정리로 답한다 (재시도 없음)", async () => {
    ai.explainLaw.mockResolvedValue({ ok: false, reason: "model_failed", costUsd: 0.0009 });
    const { data } = (await (await call()).json()) as Body;
    expect(ai.explainLaw).toHaveBeenCalledTimes(1);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(3, 0.0009);
    expect(data.ai).toEqual({ used: false, reason: "model_failed" });
    expect(data.notice).toBe(SEARCH_NOTICE);
  });

  test("실제 판례는 법제처 검색 결과만 싣는다 — 충분하면 가상 사례를 시키지 않는다", async () => {
    source.searchCases.mockResolvedValue([hit("1"), hit("2"), hit("3")]);
    ai.explainLaw.mockResolvedValue({
      ok: true,
      easy: { ...EASY, virtualCases: [] },
      dropped: [],
      costUsd: 0.002,
    });
    const { data } = (await (await call()).json()) as Body;
    expect(source.searchCases).toHaveBeenCalledWith(LAW, 4);
    expect(ai.explainLaw.mock.calls[0][0]).toMatchObject({ needVirtual: false });
    expect(data.realCases.map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(data.realCases[0]).toEqual(hit("1"));
    expect(data.virtualNotice).toBeNull();
  });

  test("판례 검색이 실패해도 설명은 준다 — 실패로 표시하고 가상 사례는 만들지 않는다", async () => {
    source.searchCases.mockRejectedValue(new ApiError("SEARCH_UPSTREAM_FAILED"));
    const res = await call();
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as Body;
    expect(data.realCases).toEqual([]);
    expect((data as { realCasesFailed?: boolean }).realCasesFailed).toBe(true);
    // 실패 응답은 붙잡아 두지 않는다
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(ai.explainLaw.mock.calls[0][0]).toMatchObject({ needVirtual: false });
  });

  test("같은 법령 하루 한도를 넘으면 모델·예산 없이 조문 제목 정리로 돌린다", async () => {
    rate.tryLawEasyDaily.mockResolvedValueOnce(false);
    const res = await call();
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as Body;
    expect(data.ai).toEqual({ used: false, reason: "daily_limit" });
    expect(ai.explainLaw).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
  });

  test("모델 호출이 예외로 끝나도 잡아 둔 예산은 정산한다", async () => {
    ai.explainLaw.mockRejectedValue(new Error("boom"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(expect.any(Number), 0);
  });

  test("미리 만든 설명이 있으면 모델·예산 없이 그것을 쓴다", async () => {
    stored.findEasyLaw.mockReturnValue(EASY);
    const { data } = (await (await call()).json()) as Body;
    expect(stored.findEasyLaw).toHaveBeenCalledWith(LAW, expect.any(Array), {
      allowVirtual: true,
    });
    expect(ai.explainLaw).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(data.ai).toEqual({ used: true });
    expect(data.notice).toBe(AI_NOTICE);
  });

  test("DEC-076 새로 만든 설명은 법령 이름을 키로 저장한다", async () => {
    await call();
    expect(db.saveGenerated).toHaveBeenCalledWith(
      "law_easy",
      "의료기기법",
      expect.objectContaining({ requirements: EASY.requirements, alternatives: EASY.alternatives }),
      "law-easy-test",
    );
  });

  test("DEC-076 저장해 둔 설명이 다 채워져 있으면 모델·예산 없이 다시 쓴다", async () => {
    const payload: Record<string, unknown> = { ...EASY };
    delete payload.lawName;
    db.readGenerated.mockResolvedValueOnce({
      payload,
      promptVersion: "v",
      updatedAt: "2026-11-27",
    });
    const { data } = (await (await call()).json()) as Body;
    expect(ai.explainLaw).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(db.bumpGenerated).toHaveBeenCalledWith("law_easy", "의료기기법");
    expect(data.easy.alternatives.map((a) => a.title)).toEqual(["먼저 허가를 신청해요"]);
  });

  test("DEC-076 미리 만든 설명에 성립 요건·대안이 없으면 그 두 칸만 더 써서 덧붙인다", async () => {
    stored.findEasyLaw.mockReturnValue({ ...EASY, requirements: [], alternatives: [] });
    const { data } = (await (await call()).json()) as Body;
    expect(ai.explainLaw).toHaveBeenCalledTimes(1);
    expect(ai.explainLaw.mock.calls[0][0]).toMatchObject({ want: "extra" });
    expect(data.easy.summary).toEqual(EASY.summary);
    expect(data.easy.alternatives).toEqual(EASY.alternatives);
    expect(db.saveGenerated).toHaveBeenCalledTimes(1);
  });

  test("DEC-076 두 칸을 더 채우지 못해도 앞의 설명은 그대로 보인다", async () => {
    stored.findEasyLaw.mockReturnValue({ ...EASY, requirements: [], alternatives: [] });
    rate.tryAiQuota.mockResolvedValue(false);
    const { data } = (await (await call()).json()) as Body;
    expect(data.ai).toEqual({ used: true });
    expect(data.notice).toBe(AI_NOTICE);
    expect(data.easy.keyPoints).toEqual(EASY.keyPoints);
  });

  test("횟수 제한은 쉬운 설명 전용 통(1시간 20회)으로 세고, 넘으면 모델 전에 막는다", async () => {
    expect(LAW_EASY_RATE).toEqual({ bucket: "law_easy", limit: 20, windowSeconds: 3600 });
    await call();
    expect(rate.assertRateLimit).toHaveBeenCalledWith(LAW_EASY_RATE, expect.anything());
    rate.assertRateLimit.mockRejectedValueOnce(new ApiError("RATE_LIMITED"));
    const res = await call();
    expect(res.status).toBe(429);
    expect(ai.explainLaw).toHaveBeenCalledTimes(1);
    // 다른 보기는 예전 통을 그대로 쓴다
    await call("articles");
    expect(rate.assertRateLimit).toHaveBeenLastCalledWith(LOOKUP_RATE, expect.anything());
  });

  test("법령을 못 찾으면 404, 원문 보기(articles)는 그대로 AI 없이 답한다", async () => {
    source.getLawArticles.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
    const res = await call("articles");
    const body = (await res.json()) as { data: { notice: string; articles: unknown[] } };
    expect(body.data.notice).toBe(SEARCH_NOTICE);
    expect(body.data.articles).toHaveLength(2);
    expect(ai.explainLaw).not.toHaveBeenCalled();
  });
});
