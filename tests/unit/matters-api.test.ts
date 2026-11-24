// @vitest-environment node
// /api/v1/matters/* (F-016, DEC-053, API.md) — 로그인 전용, 본인 사건만, 가린 글만 모델로, 예산 확인·정산, no-store.
// 저장소·모델·외부 API는 모두 가짜다 (절대 규칙 8). 이름·회사는 가상이다.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { AI_NOTICE } from "@/lib/api/respond";
import { COMPANY_WEIGHT, MATTER_READ_WEIGHT, MATTER_SUMMARY_WEIGHT, TIERS } from "@/lib/ai/models";
import { emptyMatter } from "@/lib/matters/model";

vi.mock("server-only", () => ({}));
const store = vi.hoisted(() => ({
  requireMatterUser: vi.fn(),
  listMatters: vi.fn(),
  createMatter: vi.fn(),
  getMatter: vi.fn(),
  saveMatter: vi.fn(),
  deleteMatter: vi.fn(),
}));
vi.mock("@/lib/matters/store", () => store);
const rate = vi.hoisted(() => ({
  assertRateLimit: vi.fn(),
  assertUserRate: vi.fn(),
  tryAiQuota: vi.fn(),
  settleAiQuota: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  ...rate,
}));
const mode = vi.hoisted(() => ({ aiMode: vi.fn() }));
vi.mock("@/lib/ai/mode", () => mode);
const ai = vi.hoisted(() => ({
  readMatterDocs: vi.fn(),
  organizeIssues: vi.fn(),
  summarizeText: vi.fn(),
}));
vi.mock("@/lib/ai/matter", () => ai);
const company = vi.hoisted(() => ({ researchCompany: vi.fn() }));
vi.mock("@/lib/ai/company", () => company);
const source = vi.hoisted(() => ({
  searchPlaces: vi.fn(),
  searchCorps: vi.fn(),
  searchBlogs: vi.fn(),
}));
vi.mock("@/lib/business/source", () => source);

const list = await import("@/app/api/v1/matters/route");
const one = await import("@/app/api/v1/matters/[id]/route");
const { POST: read } = await import("@/app/api/v1/matters/read/route");
const { POST: issues } = await import("@/app/api/v1/matters/issues/route");
const { POST: summarize } = await import("@/app/api/v1/matters/summarize/route");
const { POST: research } = await import("@/app/api/v1/matters/company/route");
const { MATTER_AI_RATE } = await import("@/lib/auth/rate-limit");

const ID = "11111111-2222-4333-8444-555555555555";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array<number>(60).fill(0)]).toString("base64");
const req = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost/api/v1/${path}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const READING = {
  doc: { type: "통지서", title: "통보", date: "", gist: "" },
  parties: [],
  relations: [],
  facts: [{ when: "", what: "사실" }],
  demands: [],
  clauses: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  store.requireMatterUser.mockResolvedValue({ userId: "u-1", admin: false });
  store.listMatters.mockResolvedValue([]);
  store.createMatter.mockImplementation(async (_u: string, title: string, data: unknown) => ({
    id: ID,
    title,
    updatedAt: "t",
    data,
  }));
  store.getMatter.mockResolvedValue({
    id: ID,
    title: "가상 사건",
    updatedAt: "t",
    data: emptyMatter(),
  });
  store.saveMatter.mockResolvedValue({ id: ID, updatedAt: "t2" });
  store.deleteMatter.mockResolvedValue(undefined);
  rate.assertRateLimit.mockResolvedValue(undefined);
  rate.assertUserRate.mockResolvedValue(undefined);
  rate.tryAiQuota.mockResolvedValue(true);
  rate.settleAiQuota.mockResolvedValue(undefined);
  mode.aiMode.mockReturnValue("paid");
  ai.readMatterDocs.mockResolvedValue({ ok: true, reading: READING, costUsd: 0.004 });
  ai.organizeIssues.mockResolvedValue({
    issues: [{ title: "쟁점", points: [] }],
    unknowns: [],
    costUsd: 0.2,
  });
  ai.summarizeText.mockResolvedValue({ ok: true, lines: ["한 줄"], costUsd: 0.001 });
  company.researchCompany.mockResolvedValue({
    ok: true,
    report: {
      overview: "소재 회사",
      products: [],
      business: "",
      items: [],
      basics: [],
      unknowns: [],
    },
    sources: [{ title: "example.co.kr", url: "https://example.co.kr/" }],
    found: [],
    unread: ["https://blog.example.com/1"],
    costUsd: 0.09,
  });
  for (const f of Object.values(source)) f.mockResolvedValue({ status: "no_key", items: [] });
});

describe("F-016 AC1 로그인 전용·본인 사건만", () => {
  test("비로그인은 모든 경로에서 401이고 아무 일도 하지 않는다", async () => {
    store.requireMatterUser.mockRejectedValue(new ApiError("UNAUTHENTICATED"));
    const calls = [
      list.GET(req("matters", "GET"), undefined),
      list.POST(req("matters", "POST", { title: "사건" }), undefined),
      one.GET(req(`matters/${ID}`, "GET"), ctx(ID)),
      one.PUT(req(`matters/${ID}`, "PUT", { title: "x" }), ctx(ID)),
      one.DELETE(req(`matters/${ID}`, "DELETE"), ctx(ID)),
      read(req("matters/read", "POST", {}), undefined),
      issues(req("matters/issues", "POST", {}), undefined),
      summarize(req("matters/summarize", "POST", {}), undefined),
      research(req("matters/company", "POST", {}), undefined),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(store.listMatters).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).not.toHaveBeenCalled();
    expect(ai.readMatterDocs).not.toHaveBeenCalled();
  });

  test("사건 만들기·읽기·저장·삭제는 로그인 계정 번호로만 하고 no-store로 돌려준다", async () => {
    const created = await list.POST(req("matters", "POST", { title: " 가상 사건 " }), undefined);
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    expect(store.createMatter).toHaveBeenCalledWith("u-1", "가상 사건", emptyMatter());

    const got = await one.GET(req(`matters/${ID}`, "GET"), ctx(ID));
    expect(got.headers.get("cache-control")).toBe("no-store");
    expect(store.getMatter).toHaveBeenCalledWith("u-1", ID);

    const data = { ...emptyMatter(), summary: "담당자 010-1234-5678" };
    await one.PUT(req(`matters/${ID}`, "PUT", { data }), ctx(ID));
    // 연락처는 저장 전에 가린다
    expect(store.saveMatter).toHaveBeenCalledWith("u-1", ID, {
      data: { ...emptyMatter(), summary: "담당자 [전화번호]" },
    });

    await one.DELETE(req(`matters/${ID}`, "DELETE"), ctx(ID));
    expect(store.deleteMatter).toHaveBeenCalledWith("u-1", ID);
  });

  test("남의 사건·없는 사건·모양이 다른 번호는 똑같이 404, 잘못된 자료는 400 (내용은 오류에 없다)", async () => {
    store.getMatter.mockRejectedValue(new ApiError("NOT_FOUND"));
    expect((await one.GET(req(`matters/${ID}`, "GET"), ctx(ID))).status).toBe(404);
    expect((await one.GET(req("matters/read-me", "GET"), ctx("read-me"))).status).toBe(404);
    const bad = await one.PUT(
      req(`matters/${ID}`, "PUT", { data: { version: 9, secret: "김가상" } }),
      ctx(ID),
    );
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).not.toContain("김가상");
    expect((await one.PUT(req(`matters/${ID}`, "PUT", {}), ctx(ID))).status).toBe(400);
    expect(store.saveMatter).not.toHaveBeenCalled();
  });
});

describe("F-016 AC2 POST /matters/read", () => {
  const BODY = {
    images: [{ mediaType: "image/jpeg", data: JPEG }],
    consent: { images: true, sensitive: true },
  };

  test("동의 두 항목이 있어야 하고, 하루 횟수·예산을 확인한 뒤 읽고 실제 쓴 금액으로 정산한다", async () => {
    const no = await read(
      req("matters/read", "POST", { ...BODY, consent: { images: true } }),
      undefined,
    );
    expect(no.status).toBe(409);
    expect(ai.readMatterDocs).not.toHaveBeenCalled();

    const res = await read(req("matters/read", "POST", BODY), undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rate.assertUserRate).toHaveBeenCalledWith(MATTER_AI_RATE, "u-1");
    expect(rate.tryAiQuota).toHaveBeenCalledWith(MATTER_READ_WEIGHT);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(MATTER_READ_WEIGHT, 0.004);
    const { data } = await res.json();
    expect(data).toEqual({ reading: READING, ai: { used: true }, notice: AI_NOTICE });
    expect(JSON.stringify(data)).not.toContain(JPEG);
  });

  test("무료 모드·예산 초과·하루 횟수 초과면 모델을 부르지 않는다. 관리자 모드는 횟수만 받지 않는다", async () => {
    mode.aiMode.mockReturnValue("free");
    let { data } = await (await read(req("matters/read", "POST", BODY), undefined)).json();
    expect(data).toEqual({ reading: null, ai: { used: false, reason: "free_mode" }, notice: null });
    mode.aiMode.mockReturnValue("paid");
    rate.tryAiQuota.mockResolvedValueOnce(false);
    ({ data } = await (await read(req("matters/read", "POST", BODY), undefined)).json());
    expect(data.ai).toEqual({ used: false, reason: "budget" });
    rate.assertUserRate.mockRejectedValueOnce(
      new ApiError("RATE_LIMITED", { reason: "matter_ai_daily" }),
    );
    expect((await read(req("matters/read", "POST", BODY), undefined)).status).toBe(429);
    expect(ai.readMatterDocs).not.toHaveBeenCalled();

    store.requireMatterUser.mockResolvedValue({ userId: "u-1", admin: true });
    rate.assertUserRate.mockClear();
    await read(req("matters/read", "POST", BODY), undefined);
    expect(rate.assertUserRate).not.toHaveBeenCalled();
    expect(rate.tryAiQuota).toHaveBeenLastCalledWith(MATTER_READ_WEIGHT);
  });

  test("호출이 예상 밖 오류로 끝나도 잡아 둔 예산은 돌려준다", async () => {
    ai.readMatterDocs.mockRejectedValue(new Error("boom"));
    expect((await read(req("matters/read", "POST", BODY), undefined)).status).toBe(500);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(MATTER_READ_WEIGHT, 0);
  });
});

describe("F-016 AC3·AC5 가린 글만 모델로 (절대 규칙 4)", () => {
  test("쟁점 정리: 동의가 있어야 하고, 이름·연락처를 가린 글과 고른 단계로 부른다", async () => {
    const body = {
      text: "임대인 김가상(010-1234-5678)이 통지했습니다.",
      personNames: ["김가상"],
      tier: "pro",
    };
    expect((await issues(req("matters/issues", "POST", body), undefined)).status).toBe(409);
    const res = await issues(req("matters/issues", "POST", { ...body, consent: true }), undefined);
    expect(res.status).toBe(200);
    const [masked, opts] = ai.organizeIssues.mock.calls[0];
    expect(masked).not.toContain("김가상");
    expect(masked).not.toContain("010-1234-5678");
    expect(opts).toMatchObject({ tier: "pro" });
    expect(rate.tryAiQuota).toHaveBeenCalledWith(TIERS.pro.deep.weight);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(TIERS.pro.deep.weight, 0.2);
    expect((await res.json()).data).toMatchObject({ ai: { used: true }, notice: AI_NOTICE });
    expect(
      (
        await issues(
          req("matters/issues", "POST", { ...body, consent: true, tier: "ultra" }),
          undefined,
        )
      ).status,
    ).toBe(400);
  });

  test("요약: 가린 글만 보내고, 민감정보로 보이면 동의 없이는 보내지 않는다", async () => {
    const res = await summarize(
      req("matters/summarize", "POST", {
        text: "담당자 연락처 010-1234-5678, 내용은 다음과 같습니다.",
        personNames: [],
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(ai.summarizeText.mock.calls[0][0]).not.toContain("010-1234-5678");
    expect(rate.settleAiQuota).toHaveBeenCalledWith(MATTER_SUMMARY_WEIGHT, 0.001);

    ai.summarizeText.mockClear();
    const sensitive = {
      text: "상대방은 사기 전과가 있고 우울증 진단을 받았다고 적혀 있습니다.",
      personNames: [],
    };
    const blocked = await summarize(req("matters/summarize", "POST", sensitive), undefined);
    if (blocked.status === 409) {
      expect(ai.summarizeText).not.toHaveBeenCalled();
      expect(
        (
          await summarize(
            req("matters/summarize", "POST", { ...sensitive, consent: true }),
            undefined,
          )
        ).status,
      ).toBe(200);
    } else {
      expect(blocked.status).toBe(200);
    }
  });
});

describe("F-016 AC4 POST /matters/company", () => {
  test("붙여 넣은 글은 가린 뒤 보내고, 출처·읽지 못한 링크·공식 자료·고지를 돌려준다", async () => {
    source.searchBlogs.mockResolvedValue({
      status: "ok",
      items: [{ title: "가상랩 탐방", description: "요약문", link: "https://blog.example.com/1" }],
    });
    const res = await research(
      req("matters/company", "POST", {
        name: " 가상랩 ",
        urls: ["https://example.co.kr/"],
        pasted: "담당 김가상 씨 010-1234-5678",
      }),
      undefined,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const input = company.researchCompany.mock.calls[0][0];
    expect(input.name).toBe("가상랩");
    expect(input.urls).toEqual(["https://example.co.kr/"]);
    expect(input.pastedMasked).not.toContain("김가상");
    expect(input.pastedMasked).not.toContain("010-1234-5678");
    expect(input.snippets).toEqual(["가상랩 탐방 — 요약문"]);
    expect(rate.tryAiQuota).toHaveBeenCalledWith(COMPANY_WEIGHT);
    expect(rate.settleAiQuota).toHaveBeenCalledWith(COMPANY_WEIGHT, 0.09);
    const { data } = await res.json();
    expect(data).toMatchObject({
      report: { overview: "소재 회사" },
      sources: [{ url: "https://example.co.kr/" }],
      unread: ["https://blog.example.com/1"],
      ai: { used: true },
      notice: AI_NOTICE,
    });
    expect(data.sourceNotice).toContain("출처");
    expect(data.links).toHaveLength(3);
  });

  test("자동으로 읽을 수 없는 링크(네이버 블로그)는 도구에 넘기지 않는다", async () => {
    await research(
      req("matters/company", "POST", {
        name: "가상랩",
        urls: ["https://blog.naver.com/x/1", "https://example.co.kr/"],
      }),
      undefined,
    );
    const input = company.researchCompany.mock.calls[0][0];
    expect(input.urls).toEqual(["https://example.co.kr/"]);
    expect(input.skipped).toEqual(["https://blog.naver.com/x/1"]);
  });

  test("링크가 공개 주소가 아니거나 이름에 연락처가 섞이면 외부로 보내지 않고 400", async () => {
    for (const body of [
      { name: "가상랩", urls: ["http://localhost:3000/admin"] },
      { name: "가상랩 010-1234-5678" },
    ]) {
      expect((await research(req("matters/company", "POST", body), undefined)).status).toBe(400);
    }
    expect(company.researchCompany).not.toHaveBeenCalled();
    expect(source.searchPlaces).not.toHaveBeenCalled();
  });

  test("무료 모드면 모델을 부르지 않고 준 링크를 모두 읽지 못한 것으로 돌려준다", async () => {
    mode.aiMode.mockReturnValue("free");
    const { data } = await (
      await research(
        req("matters/company", "POST", { name: "가상랩", urls: ["https://example.co.kr/"] }),
        undefined,
      )
    ).json();
    expect(data).toMatchObject({
      report: null,
      unread: ["https://example.co.kr/"],
      ai: { used: false, reason: "free_mode" },
      notice: null,
    });
    expect(company.researchCompany).not.toHaveBeenCalled();
  });
});
