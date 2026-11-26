// DEC-075 ⓔ 조문 두 날짜 비교·개정 이력: 법제처 연혁의 조문을 줄 단위로 비교하고 개정 이력을 그대로 옮긴다. 법제처는 가짜.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SEARCH_NOTICE } from "@/lib/api/respond";
import {
  articleRevisions,
  compareResponse,
  dayBefore,
  parseCompareDates,
} from "@/lib/search/article-time";
import type { ArticleAtDate, LawVersion } from "@/lib/search/types";

vi.mock("server-only", () => ({}));
const source = vi.hoisted(() => ({ getArticleAt: vi.fn(), articleHistory: vi.fn() }));
vi.mock("@/lib/search/law-source", () => ({ createLawSource: () => source }));
const rate = vi.hoisted(() => ({ assertRateLimit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  assertRateLimit: rate.assertRateLimit,
}));
const api = vi.hoisted(() => ({ compareStatute: vi.fn(), getStatuteHistory: vi.fn() }));
vi.mock("@/lib/client/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/api")>()),
  compareStatute: api.compareStatute,
  getStatuteHistory: api.getStatuteHistory,
}));
const compareRoute = await import("@/app/api/v1/statutes/[id]/compare/route");
const historyRoute = await import("@/app/api/v1/statutes/[id]/history/route");
const { StatuteTime } = await import("@/components/search/StatuteTime");

const V = (mst: string, ef: string): LawVersion => ({
  mst,
  lawName: "주택임대차보호법",
  effectiveFrom: ef,
  promulgatedAt: ef,
  promulgationNo: "1",
  revisionType: "일부개정",
});
const found = (mst: string, text: string): ArticleAtDate => ({
  status: "found",
  version: V(mst, "2020-01-01"),
  article: {
    id: "law:주택임대차보호법:제3조",
    lawName: "주택임대차보호법",
    articleNo: "제3조",
    title: "대항력 등",
    text,
    effectiveFrom: "2020-01-01",
    sourceUrl: "https://www.law.go.kr",
  },
});
const ID = encodeURIComponent("주택임대차보호법:제3조");
const ctx = { params: Promise.resolve({ id: ID }) };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("두 날짜 비교 (순수)", () => {
  test("날짜는 둘 다 YYYY-MM-DD이고 앞 날짜 < 뒤 날짜", () => {
    const p = (q: string) => parseCompareDates(new URLSearchParams(q));
    expect(p("from=2015-01-01&to=2020-01-01")).toEqual({ from: "2015-01-01", to: "2020-01-01" });
    for (const bad of [
      "from=2015-01-01",
      "from=2020-01-01&to=2015-01-01",
      "from=2015-1-1&to=2020-01-01",
      "from=2024-02-30&to=2024-03-05",
      "from=0000-01-01&to=2020-01-01",
    ])
      expect(() => p(bad), bad).toThrow();
    expect(dayBefore("2021-03-01")).toBe("2021-02-28");
  });

  test("둘 다 찾으면 줄 비교, 한쪽이 없으면 안내만 (만들지 않는다)", () => {
    const r = compareResponse(
      { date: "2015-01-01", at: found("1", "① 같은 줄\n② 옛 줄") },
      { date: "2020-01-01", at: found("2", "① 같은 줄\n② 새 줄") },
    );
    expect(r.diff?.map((d) => d.type)).toEqual(["same", "removed", "added"]);
    expect([r.same, r.sameVersion]).toEqual([false, false]);
    const none = compareResponse(
      { date: "1900-01-01", at: { status: "not_in_force" } },
      { date: "2020-01-01", at: found("2", "x") },
    );
    expect(none.diff).toBeNull();
    expect(none.from).toMatchObject({ found: false });
  });

  test("개정 이력은 법제처 값 그대로, 시행일 내림차순, 같은 버전·날짜는 한 번", () => {
    const xml = `<LsJoHstInf><law><법령정보><법령명한글>주택임대차보호법</법령명한글><법령일련번호>100</법령일련번호><공포일자>20200101</공포일자><제개정구분명>일부개정</제개정구분명><시행일자>20200201</시행일자></법령정보><jo><조문번호>000300</조문번호><변경사유>조문개정</변경사유><조문시행일>20200201</조문시행일></jo><jo><조문번호>000300</조문번호><변경사유>조문개정</변경사유><조문시행일>20200201</조문시행일></jo></law><law><법령정보><법령일련번호>200</법령일련번호><공포일자>20230101</공포일자><제개정구분명>타법개정</제개정구분명><시행일자>20230301</시행일자></법령정보><jo><변경사유>조문신설</변경사유></jo></law></LsJoHstInf>`;
    expect(articleRevisions(xml)).toEqual([
      {
        mst: "200",
        promulgatedAt: "2023-01-01",
        effectiveFrom: "2023-03-01",
        revisionType: "타법개정",
        changeReason: "조문신설",
      },
      {
        mst: "100",
        promulgatedAt: "2020-01-01",
        effectiveFrom: "2020-02-01",
        revisionType: "일부개정",
        changeReason: "조문개정",
      },
    ]);
  });
});

describe("라우트", () => {
  test("비교: 두 날짜를 법제처에서 가져와 비교하고 SEARCH_NOTICE, 날짜 꼴이 틀리면 법제처 전에 400", async () => {
    source.getArticleAt.mockImplementation(async (_l: string, _a: string, d: string) =>
      found(d, d === "2015-01-01" ? "옛 줄" : "새 줄"),
    );
    const res = await compareRoute.GET(
      new Request(`http://localhost/x?from=2015-01-01&to=2020-01-01`),
      ctx,
    );
    const body = (await res.json()) as { data: { diff: unknown[]; notice: string } };
    expect(body.data.diff).toHaveLength(2);
    expect(body.data.notice).toBe(SEARCH_NOTICE);
    expect(source.getArticleAt).toHaveBeenCalledWith("주택임대차보호법", "제3조", "2015-01-01");
    source.getArticleAt.mockClear();
    const bad = await compareRoute.GET(new Request(`http://localhost/x?from=2020-01-01`), ctx);
    expect(bad.status).toBe(400);
    expect(source.getArticleAt).not.toHaveBeenCalled();
  });

  test("개정 이력: 법령이 없으면 404", async () => {
    source.articleHistory.mockResolvedValue(null);
    const res = await historyRoute.GET(new Request("http://localhost/x"), ctx);
    expect(res.status).toBe(404);
  });
});

describe("조문 화면", () => {
  test("개정 이력은 누를 때만 불러오고, '이 개정 전후 비교'는 전날·그날로 비교한다", async () => {
    api.getStatuteHistory.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            mst: "100",
            promulgatedAt: "2020-01-01",
            effectiveFrom: "2020-02-01",
            revisionType: "일부개정",
            changeReason: "조문개정",
          },
        ],
      },
    });
    api.compareStatute.mockResolvedValue({
      ok: true,
      data: {
        lawName: "주택임대차보호법",
        articleNo: "제3조",
        from: {
          date: "2020-01-31",
          found: true,
          lawName: "",
          articleNo: "제3조",
          articleTitle: "",
          body: "옛 줄",
          version: V("1", "2019-01-01"),
        },
        to: {
          date: "2020-02-01",
          found: true,
          lawName: "",
          articleNo: "제3조",
          articleTitle: "",
          body: "새 줄",
          version: V("100", "2020-02-01"),
        },
        diff: [
          { type: "removed", text: "옛 줄" },
          { type: "added", text: "새 줄" },
        ],
        same: false,
        sameVersion: false,
        notice: SEARCH_NOTICE,
      },
    });
    render(<StatuteTime id="주택임대차보호법:제3조" />);
    expect(api.getStatuteHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "법제처에서 불러오기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 개정 전후 비교" }));
    expect(api.compareStatute).toHaveBeenCalledWith(
      "주택임대차보호법:제3조",
      "2020-01-31",
      "2020-02-01",
    );
    expect(await screen.findByTestId("compare-result")).toBeDefined();
    expect(screen.getByText("새 줄")).toBeDefined();
    expect(screen.queryByText(/유리|불리|중요도|영향이 큰/)).toBeNull();
  });
});
